import { spawn, type ChildProcess, type SpawnOptionsWithoutStdio } from 'child_process';
import { EventEmitter } from 'events';
import type { BrowserWindow } from 'electron';

/**
 * Process execution options
 */
export interface ProcessExecutionOptions {
  /** Unique identifier for this process */
  id: string;
  /** Command to execute */
  command: string;
  /** Command arguments */
  args: string[];
  /** Spawn options */
  spawnOptions?: SpawnOptionsWithoutStdio;
  /** Timeout in milliseconds (default: no timeout) */
  timeout?: number;
  /** Enable debug logging */
  debug?: boolean;
  /** Optional description for logging */
  description?: string;
}

/**
 * Process execution result
 */
export interface ProcessExecutionResult {
  /** Exit code (null if killed by timeout) */
  exitCode: number | null;
  /** Combined stdout output */
  stdout: string;
  /** Combined stderr output */
  stderr: string;
  /** Whether the process was killed by timeout */
  timedOut: boolean;
  /** Execution duration in milliseconds */
  duration: number;
}

/**
 * Process info for tracking
 */
interface ProcessInfo {
  process: ChildProcess;
  startTime: number;
  timeout?: NodeJS.Timeout;
  description?: string;
}

/**
 * Centralized process manager for Python subprocess calls
 *
 * Features:
 * - Configurable timeouts with automatic cleanup
 * - Process tracking and lifecycle management
 * - Cleanup on app exit (kills all spawned processes)
 * - Graceful termination with SIGTERM/SIGINT handling
 * - Debug logging support
 */
export class ProcessManager extends EventEmitter {
  private processes: Map<string, ProcessInfo> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private debugEnabled: boolean = false;
  private shuttingDown: boolean = false;

  constructor(debugEnabled: boolean = false) {
    super();
    this.debugEnabled = debugEnabled;
    this.setupExitHandlers();
  }

  /**
   * Set the main window for UI updates
   */
  setMainWindow(window: BrowserWindow | null): void {
    this.mainWindow = window;
  }

  /**
   * Enable or disable debug logging
   */
  setDebugEnabled(enabled: boolean): void {
    this.debugEnabled = enabled;
  }

  /**
   * Debug logging helper
   */
  private debug(...args: unknown[]): void {
    if (this.debugEnabled) {
      console.warn('[ProcessManager]', ...args);
    }
  }

  /**
   * Setup exit handlers to kill all processes on app shutdown
   */
  private setupExitHandlers(): void {
    const cleanup = (): void => {
      this.debug('App exit detected, killing all processes...');
      this.killAll();
    };

    // Handle app exit events
    process.on('exit', cleanup);
    process.on('SIGINT', () => {
      cleanup();
      process.exit(0);
    });
    process.on('SIGTERM', () => {
      cleanup();
      process.exit(0);
    });
  }

  /**
   * Execute a process with timeout and cleanup
   */
  async execute(options: ProcessExecutionOptions): Promise<ProcessExecutionResult> {
    const {
      id,
      command,
      args,
      spawnOptions,
      timeout,
      description
    } = options;

    // Kill existing process with same ID
    this.kill(id);

    this.debug(`Spawning process [${id}]`, {
      command,
      args: args.slice(0, 3), // Log first 3 args only
      timeout,
      description
    });

    const startTime = Date.now();
    let timedOut = false;

    // Spawn the process
    const childProcess = spawn(command, args, spawnOptions);
    const processInfo: ProcessInfo = {
      process: childProcess,
      startTime,
      description
    };

    this.processes.set(id, processInfo);

    return new Promise((resolve, reject) => {
      let stdout = '';
      let stderr = '';
      let timeoutHandle: NodeJS.Timeout | undefined;

      // Setup timeout if specified
      if (timeout && timeout > 0) {
        timeoutHandle = setTimeout(() => {
          timedOut = true;
          this.debug(`Process [${id}] timed out after ${timeout}ms`);

          // Kill the process
          childProcess.kill('SIGTERM');

          // Force kill after 5 seconds if not terminated
          setTimeout(() => {
            if (!childProcess.killed) {
              this.debug(`Force killing process [${id}]`);
              childProcess.kill('SIGKILL');
            }
          }, 5000);
        }, timeout);

        processInfo.timeout = timeoutHandle;
      }

      // Collect stdout
      childProcess.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
        this.emit('stdout', id, data.toString());
      });

      // Collect stderr
      childProcess.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
        this.emit('stderr', id, data.toString());
      });

      // Handle process exit
      childProcess.on('close', (code: number | null) => {
        const duration = Date.now() - startTime;

        // Clear timeout
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        // Remove from tracking
        this.processes.delete(id);

        this.debug(`Process [${id}] exited`, {
          code,
          timedOut,
          duration: `${duration}ms`
        });

        const result: ProcessExecutionResult = {
          exitCode: code,
          stdout,
          stderr,
          timedOut,
          duration
        };

        if (timedOut) {
          reject(new Error(`Process timed out after ${timeout}ms`));
        } else if (code === 0) {
          resolve(result);
        } else {
          const error = new Error(
            `Process exited with code ${code}${stderr ? `: ${stderr.substring(0, 200)}` : ''}`
          );
          reject(error);
        }
      });

      // Handle process errors
      childProcess.on('error', (err: Error) => {
        const duration = Date.now() - startTime;

        // Clear timeout
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
        }

        // Remove from tracking
        this.processes.delete(id);

        this.debug(`Process [${id}] error`, { error: err.message, duration: `${duration}ms` });
        reject(err);
      });
    });
  }

  /**
   * Kill a specific process by ID
   */
  kill(id: string): boolean {
    const processInfo = this.processes.get(id);
    if (!processInfo) {
      return false;
    }

    this.debug(`Killing process [${id}]`);

    // Clear timeout
    if (processInfo.timeout) {
      clearTimeout(processInfo.timeout);
    }

    // Kill process
    try {
      processInfo.process.kill('SIGTERM');

      // Force kill after 5 seconds
      setTimeout(() => {
        if (!processInfo.process.killed) {
          this.debug(`Force killing process [${id}]`);
          processInfo.process.kill('SIGKILL');
        }
      }, 5000);
    } catch (err) {
      this.debug(`Error killing process [${id}]:`, err);
    }

    // Remove from tracking
    this.processes.delete(id);
    return true;
  }

  /**
   * Kill all tracked processes
   */
  killAll(): void {
    if (this.shuttingDown) {
      return; // Prevent recursive calls
    }

    this.shuttingDown = true;
    this.debug(`Killing all processes (${this.processes.size} active)`);

    const processIds = Array.from(this.processes.keys());
    for (const id of processIds) {
      this.kill(id);
    }

    this.processes.clear();
    this.shuttingDown = false;
  }

  /**
   * Check if a process is currently running
   */
  isRunning(id: string): boolean {
    return this.processes.has(id);
  }

  /**
   * Get all running process IDs
   */
  getRunningProcessIds(): string[] {
    return Array.from(this.processes.keys());
  }

  /**
   * Get process info
   */
  getProcessInfo(id: string): { description?: string; uptime: number } | null {
    const processInfo = this.processes.get(id);
    if (!processInfo) {
      return null;
    }

    return {
      description: processInfo.description,
      uptime: Date.now() - processInfo.startTime
    };
  }
}

// Export singleton instance
let processManager: ProcessManager | null = null;

/**
 * Get the singleton ProcessManager instance
 */
export function getProcessManager(debugEnabled: boolean = false): ProcessManager {
  if (!processManager) {
    processManager = new ProcessManager(debugEnabled);
  }
  return processManager;
}
