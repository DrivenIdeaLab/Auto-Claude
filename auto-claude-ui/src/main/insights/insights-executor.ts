import { existsSync, writeFileSync, unlinkSync } from 'fs';
import path from 'path';
import os from 'os';
import { EventEmitter } from 'events';
import type {
  InsightsChatMessage,
  InsightsChatStatus,
  InsightsStreamChunk,
  InsightsToolUsage,
  InsightsModelConfig
} from '../../shared/types';
import { MODEL_ID_MAP } from '../../shared/constants';
import { InsightsConfig } from './config';
import { detectRateLimit, createSDKRateLimitInfo, detectCostLimit } from '../rate-limit-detector';
import { getProcessManager } from '../utils/process-manager';

/**
 * Message processor result
 */
interface ProcessorResult {
  fullResponse: string;
  suggestedTask?: InsightsChatMessage['suggestedTask'];
  toolsUsed: InsightsToolUsage[];
}

/**
 * Python process executor for insights
 * Handles spawning and managing the Python insights runner process
 * Uses centralized ProcessManager for timeout protection and cleanup
 */
export class InsightsExecutor extends EventEmitter {
  private config: InsightsConfig;
  private processManager = getProcessManager();
  private readonly INSIGHTS_TIMEOUT = 5 * 60 * 1000; // 5 minutes

  constructor(config: InsightsConfig) {
    super();
    this.config = config;
  }

  /**
   * Check if a session is currently active
   */
  isSessionActive(projectId: string): boolean {
    return this.processManager.isRunning(`insights-${projectId}`);
  }

  /**
   * Cancel an active session
   */
  cancelSession(projectId: string): boolean {
    return this.processManager.kill(`insights-${projectId}`);
  }

  /**
   * Execute insights query with timeout protection
   */
  async execute(
    projectId: string,
    projectPath: string,
    message: string,
    conversationHistory: Array<{ role: string; content: string }>,
    modelConfig?: InsightsModelConfig
  ): Promise<ProcessorResult> {
    // Cancel any existing session
    this.cancelSession(projectId);

    const autoBuildSource = this.config.getAutoBuildSourcePath();
    if (!autoBuildSource) {
      throw new Error('Auto Claude source not found');
    }

    const runnerPath = path.join(autoBuildSource, 'runners', 'insights_runner.py');
    if (!existsSync(runnerPath)) {
      throw new Error('insights_runner.py not found in auto-claude directory');
    }

    // Emit thinking status
    this.emit('status', projectId, {
      phase: 'thinking',
      message: 'Processing your message...'
    } as InsightsChatStatus);

    // Get process environment
    const processEnv = this.config.getProcessEnv();

    // Write conversation history to temp file to avoid Windows command-line length limit
    const historyFile = path.join(
      os.tmpdir(),
      `insights-history-${projectId}-${Date.now()}.json`
    );

    let historyFileCreated = false;
    try {
      writeFileSync(historyFile, JSON.stringify(conversationHistory), 'utf-8');
      historyFileCreated = true;
    } catch (err) {
      console.error('[Insights] Failed to write history file:', err);
      throw new Error('Failed to write conversation history to temp file');
    }

    // Build command arguments
    const args = [
      runnerPath,
      '--project-dir', projectPath,
      '--message', message,
      '--history-file', historyFile
    ];

    // Add model config if provided
    if (modelConfig) {
      const modelId = MODEL_ID_MAP[modelConfig.model] || MODEL_ID_MAP['sonnet'];
      args.push('--model', modelId);
      args.push('--thinking-level', modelConfig.thinkingLevel);
    }

    // Track state for streaming
    let fullResponse = '';
    let suggestedTask: InsightsChatMessage['suggestedTask'] | undefined;
    const toolsUsed: InsightsToolUsage[] = [];
    let allInsightsOutput = '';

    // Setup stdout handler
    const handleStdout = (id: string, data: string): void => {
      if (id !== `insights-${projectId}`) return;

      allInsightsOutput = (allInsightsOutput + data).slice(-10000);

      const lines = data.split('\n');
      for (const line of lines) {
        if (line.startsWith('__TASK_SUGGESTION__:')) {
          this.handleTaskSuggestion(projectId, line, (task) => {
            suggestedTask = task;
          });
        } else if (line.startsWith('__TOOL_START__:')) {
          this.handleToolStart(projectId, line, toolsUsed);
        } else if (line.startsWith('__TOOL_END__:')) {
          this.handleToolEnd(projectId, line);
        } else if (line.trim()) {
          fullResponse += line + '\n';
          this.emit('stream-chunk', projectId, {
            type: 'text',
            content: line + '\n'
          } as InsightsStreamChunk);
        }
      }
    };

    const handleStderr = (id: string, data: string): void => {
      if (id !== `insights-${projectId}`) return;
      allInsightsOutput = (allInsightsOutput + data).slice(-10000);
    };

    this.processManager.on('stdout', handleStdout);
    this.processManager.on('stderr', handleStderr);

    try {
      // Execute with ProcessManager (with timeout)
      await this.processManager.execute({
        id: `insights-${projectId}`,
        command: this.config.getPythonPath(),
        args,
        spawnOptions: {
          cwd: autoBuildSource,
          env: processEnv
        },
        timeout: this.INSIGHTS_TIMEOUT,
        description: `Insights query for project ${projectId}`
      });

      // Success - cleanup and return result
      this.emit('stream-chunk', projectId, {
        type: 'done'
      } as InsightsStreamChunk);

      this.emit('status', projectId, {
        phase: 'complete'
      } as InsightsChatStatus);

      return {
        fullResponse: fullResponse.trim(),
        suggestedTask,
        toolsUsed
      };
    } catch (err) {
      // Check for rate limit
      this.handleRateLimit(projectId, allInsightsOutput);

      const error = err instanceof Error ? err.message : 'Insights execution failed';
      this.emit('stream-chunk', projectId, {
        type: 'error',
        error
      } as InsightsStreamChunk);

      this.emit('error', projectId, error);
      throw err;
    } finally {
      // Cleanup handlers
      this.processManager.off('stdout', handleStdout);
      this.processManager.off('stderr', handleStderr);

      // Cleanup temp file
      if (historyFileCreated && existsSync(historyFile)) {
        try {
          unlinkSync(historyFile);
        } catch (cleanupErr) {
          console.error('[Insights] Failed to cleanup history file:', cleanupErr);
        }
      }
    }
  }

  /**
   * Handle task suggestion from output
   */
  private handleTaskSuggestion(
    projectId: string,
    line: string,
    onTaskFound: (task: InsightsChatMessage['suggestedTask']) => void
  ): void {
    try {
      const taskJson = line.substring('__TASK_SUGGESTION__:'.length);
      const suggestedTask = JSON.parse(taskJson);
      onTaskFound(suggestedTask);
      this.emit('stream-chunk', projectId, {
        type: 'task_suggestion',
        suggestedTask
      } as InsightsStreamChunk);
    } catch {
      // Not valid JSON, treat as normal text (should not emit here as it's already handled)
    }
  }

  /**
   * Handle tool start marker
   */
  private handleToolStart(
    projectId: string,
    line: string,
    toolsUsed: InsightsToolUsage[]
  ): void {
    try {
      const toolJson = line.substring('__TOOL_START__:'.length);
      const toolData = JSON.parse(toolJson);
      // Accumulate tool usage for persistence
      toolsUsed.push({
        name: toolData.name,
        input: toolData.input,
        timestamp: new Date()
      });
      this.emit('stream-chunk', projectId, {
        type: 'tool_start',
        tool: {
          name: toolData.name,
          input: toolData.input
        }
      } as InsightsStreamChunk);
    } catch {
      // Ignore parse errors for tool markers
    }
  }

  /**
   * Handle tool end marker
   */
  private handleToolEnd(projectId: string, line: string): void {
    try {
      const toolJson = line.substring('__TOOL_END__:'.length);
      const toolData = JSON.parse(toolJson);
      this.emit('stream-chunk', projectId, {
        type: 'tool_end',
        tool: {
          name: toolData.name
        }
      } as InsightsStreamChunk);
    } catch {
      // Ignore parse errors for tool markers
    }
  }

  /**
   * Handle rate limit detection
   */
  private handleRateLimit(projectId: string, output: string): void {
    // Check for cost limit first (more critical)
    const costLimitDetection = detectCostLimit(output);
    if (costLimitDetection.isCostLimited) {
      console.warn('[Insights] Cost limit detected:', { projectId });
      this.emit('cost-limit', {
        projectId,
        profileId: costLimitDetection.profileId,
        message: costLimitDetection.message,
        originalError: costLimitDetection.originalError
      });
      return;
    }

    const rateLimitDetection = detectRateLimit(output);
    if (rateLimitDetection.isRateLimited) {
      console.warn('[Insights] Rate limit detected:', {
        projectId,
        resetTime: rateLimitDetection.resetTime,
        limitType: rateLimitDetection.limitType,
        suggestedProfile: rateLimitDetection.suggestedProfile?.name
      });

      const rateLimitInfo = createSDKRateLimitInfo('other', rateLimitDetection, {
        projectId
      });
      this.emit('sdk-rate-limit', rateLimitInfo);
    }
  }
}
