/**
 * Environment Validation Service
 *
 * Centralized validation for all Auto Claude environment variables and dependencies.
 * Runs at startup to catch configuration errors early with user-friendly messages.
 */

import { existsSync, readFileSync } from 'fs';
import { execSync } from 'child_process';
import path from 'path';
import { dialog } from 'electron';
import type { BrowserWindow } from 'electron';
import type { ValidationSeverity, ValidationIssue, EnvValidationResult } from '../shared/types';

// Re-export types for convenience
export type { ValidationSeverity, ValidationIssue, EnvValidationResult };

/**
 * Parse .env file into key-value pairs
 */
function parseEnvFile(filePath: string): Record<string, string> {
  if (!existsSync(filePath)) {
    return {};
  }

  try {
    const content = readFileSync(filePath, 'utf-8');
    const vars: Record<string, string> = {};

    for (const line of content.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;

      const match = trimmed.match(/^([^=]+)=(.*)$/);
      if (match) {
        const key = match[1].trim();
        const value = match[2].trim();
        // Remove quotes if present
        vars[key] = value.replace(/^["']|["']$/g, '');
      }
    }

    return vars;
  } catch {
    return {};
  }
}

/**
 * Check if Python is available and meets minimum version requirement
 */
function validatePython(): ValidationIssue | null {
  try {
    // Try common Python commands
    const commands = process.platform === 'win32'
      ? ['py -3 --version', 'python --version', 'python3 --version']
      : ['python3 --version', 'python --version'];

    for (const cmd of commands) {
      try {
        const version = execSync(cmd, { stdio: 'pipe', timeout: 5000 }).toString();
        if (version.includes('Python 3')) {
          // Extract version number
          const match = version.match(/Python (\d+)\.(\d+)/);
          if (match) {
            const major = parseInt(match[1], 10);
            const minor = parseInt(match[2], 10);

            // Python 3.9+ required
            if (major >= 3 && minor >= 9) {
              return null; // Valid
            }

            return {
              severity: 'critical',
              component: 'Python',
              message: `Python ${major}.${minor} found, but 3.9+ is required`,
              details: 'Please upgrade Python to version 3.9 or higher. Download from https://www.python.org/downloads/'
            };
          }
        }
      } catch {
        continue;
      }
    }

    return {
      severity: 'critical',
      component: 'Python',
      message: 'Python 3.9+ not found',
      details: 'Auto Claude requires Python 3.9 or higher. Download from https://www.python.org/downloads/'
    };
  } catch (error) {
    return {
      severity: 'critical',
      component: 'Python',
      message: 'Failed to check Python version',
      details: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Validate Claude OAuth token
 */
function validateClaudeToken(env: Record<string, string>): ValidationIssue | null {
  const token = env['CLAUDE_CODE_OAUTH_TOKEN'];

  if (!token || token.trim() === '') {
    return {
      severity: 'critical',
      component: 'Claude Authentication',
      message: 'CLAUDE_CODE_OAUTH_TOKEN not configured',
      details: 'Run "claude setup-token" in your terminal or configure it in Settings. This is required for all Auto Claude functionality.'
    };
  }

  // Basic format validation (tokens are typically base64-like)
  if (token.length < 20) {
    return {
      severity: 'critical',
      component: 'Claude Authentication',
      message: 'CLAUDE_CODE_OAUTH_TOKEN appears invalid (too short)',
      details: 'The token should be a long string. Please re-run "claude setup-token" to obtain a valid token.'
    };
  }

  return null;
}

/**
 * Validate Graphiti provider configuration if enabled
 */
function validateGraphiti(env: Record<string, string>): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const enabled = env['GRAPHITI_ENABLED']?.toLowerCase() === 'true';

  if (!enabled) {
    return [{
      severity: 'info',
      component: 'Graphiti Memory',
      message: 'Graphiti memory integration not enabled',
      featureImpact: 'Cross-session memory and semantic search unavailable'
    }];
  }

  const llmProvider = env['GRAPHITI_LLM_PROVIDER'] || 'openai';
  const embedderProvider = env['GRAPHITI_EMBEDDER_PROVIDER'] || 'openai';

  // Validate LLM provider credentials
  switch (llmProvider) {
    case 'openai':
      if (!env['OPENAI_API_KEY']) {
        issues.push({
          severity: 'warning',
          component: 'Graphiti - OpenAI LLM',
          message: 'OPENAI_API_KEY not set but required for LLM provider',
          details: 'Set OPENAI_API_KEY in .env or change GRAPHITI_LLM_PROVIDER to another provider',
          featureImpact: 'Graphiti memory features will fail'
        });
      }
      break;

    case 'anthropic':
      if (!env['ANTHROPIC_API_KEY']) {
        issues.push({
          severity: 'warning',
          component: 'Graphiti - Anthropic LLM',
          message: 'ANTHROPIC_API_KEY not set but required for LLM provider',
          details: 'Set ANTHROPIC_API_KEY in .env or change GRAPHITI_LLM_PROVIDER to another provider',
          featureImpact: 'Graphiti memory features will fail'
        });
      }
      break;

    case 'azure_openai':
      if (!env['AZURE_OPENAI_API_KEY'] || !env['AZURE_OPENAI_BASE_URL']) {
        issues.push({
          severity: 'warning',
          component: 'Graphiti - Azure OpenAI LLM',
          message: 'Azure OpenAI credentials incomplete',
          details: 'Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_BASE_URL in .env',
          featureImpact: 'Graphiti memory features will fail'
        });
      }
      break;

    case 'google':
      if (!env['GOOGLE_API_KEY']) {
        issues.push({
          severity: 'warning',
          component: 'Graphiti - Google AI LLM',
          message: 'GOOGLE_API_KEY not set but required for LLM provider',
          details: 'Set GOOGLE_API_KEY in .env or change GRAPHITI_LLM_PROVIDER to another provider',
          featureImpact: 'Graphiti memory features will fail'
        });
      }
      break;

    case 'ollama':
      const ollamaUrl = env['OLLAMA_BASE_URL'] || 'http://localhost:11434';
      const ollamaModel = env['OLLAMA_LLM_MODEL'];
      if (!ollamaModel) {
        issues.push({
          severity: 'warning',
          component: 'Graphiti - Ollama LLM',
          message: 'OLLAMA_LLM_MODEL not set',
          details: 'Set OLLAMA_LLM_MODEL in .env (e.g., deepseek-r1:7b)',
          featureImpact: 'Graphiti memory features will fail'
        });
      }
      issues.push({
        severity: 'info',
        component: 'Graphiti - Ollama',
        message: `Using Ollama at ${ollamaUrl}`,
        details: 'Ensure Ollama is running and the specified model is pulled'
      });
      break;
  }

  // Validate embedder provider credentials
  switch (embedderProvider) {
    case 'openai':
      if (!env['OPENAI_API_KEY']) {
        issues.push({
          severity: 'warning',
          component: 'Graphiti - OpenAI Embeddings',
          message: 'OPENAI_API_KEY not set but required for embedder provider',
          details: 'Set OPENAI_API_KEY in .env or change GRAPHITI_EMBEDDER_PROVIDER to another provider',
          featureImpact: 'Graphiti memory features will fail'
        });
      }
      break;

    case 'voyage':
      if (!env['VOYAGE_API_KEY']) {
        issues.push({
          severity: 'warning',
          component: 'Graphiti - Voyage Embeddings',
          message: 'VOYAGE_API_KEY not set but required for embedder provider',
          details: 'Set VOYAGE_API_KEY in .env or change GRAPHITI_EMBEDDER_PROVIDER to another provider',
          featureImpact: 'Graphiti memory features will fail'
        });
      }
      break;

    case 'azure_openai':
      if (!env['AZURE_OPENAI_API_KEY'] || !env['AZURE_OPENAI_BASE_URL']) {
        issues.push({
          severity: 'warning',
          component: 'Graphiti - Azure OpenAI Embeddings',
          message: 'Azure OpenAI credentials incomplete',
          details: 'Set AZURE_OPENAI_API_KEY and AZURE_OPENAI_BASE_URL in .env',
          featureImpact: 'Graphiti memory features will fail'
        });
      }
      break;

    case 'google':
      if (!env['GOOGLE_API_KEY']) {
        issues.push({
          severity: 'warning',
          component: 'Graphiti - Google AI Embeddings',
          message: 'GOOGLE_API_KEY not set but required for embedder provider',
          details: 'Set GOOGLE_API_KEY in .env or change GRAPHITI_EMBEDDER_PROVIDER to another provider',
          featureImpact: 'Graphiti memory features will fail'
        });
      }
      break;

    case 'ollama':
      const ollamaEmbedModel = env['OLLAMA_EMBEDDING_MODEL'];
      const ollamaEmbedDim = env['OLLAMA_EMBEDDING_DIM'];
      if (!ollamaEmbedModel) {
        issues.push({
          severity: 'warning',
          component: 'Graphiti - Ollama Embeddings',
          message: 'OLLAMA_EMBEDDING_MODEL not set',
          details: 'Set OLLAMA_EMBEDDING_MODEL in .env (e.g., nomic-embed-text)',
          featureImpact: 'Graphiti memory features will fail'
        });
      }
      if (!ollamaEmbedDim) {
        issues.push({
          severity: 'warning',
          component: 'Graphiti - Ollama Embeddings',
          message: 'OLLAMA_EMBEDDING_DIM not set',
          details: 'Set OLLAMA_EMBEDDING_DIM in .env (e.g., 768 for nomic-embed-text)',
          featureImpact: 'Graphiti memory features will fail'
        });
      }
      break;
  }

  return issues;
}

/**
 * Validate Linear integration if configured
 */
function validateLinear(env: Record<string, string>): ValidationIssue | null {
  const apiKey = env['LINEAR_API_KEY'];

  if (!apiKey) {
    return {
      severity: 'info',
      component: 'Linear Integration',
      message: 'Linear integration not configured',
      featureImpact: 'Linear progress tracking unavailable'
    };
  }

  // Basic format validation (Linear keys start with 'lin_api_')
  if (!apiKey.startsWith('lin_api_')) {
    return {
      severity: 'warning',
      component: 'Linear Integration',
      message: 'LINEAR_API_KEY format appears invalid',
      details: 'Linear API keys should start with "lin_api_". Get your key from https://linear.app/settings/api',
      featureImpact: 'Linear integration may not work'
    };
  }

  return null;
}

/**
 * Validate auto-claude directory structure
 */
function validateAutoClaude(autoBuildPath?: string): ValidationIssue | null {
  if (!autoBuildPath) {
    return {
      severity: 'critical',
      component: 'Auto Claude Directory',
      message: 'Auto Claude source path not configured',
      details: 'Please specify the path to your auto-claude installation in Settings'
    };
  }

  if (!existsSync(autoBuildPath)) {
    return {
      severity: 'critical',
      component: 'Auto Claude Directory',
      message: `Auto Claude directory not found: ${autoBuildPath}`,
      details: 'The specified auto-claude path does not exist. Please verify the path in Settings'
    };
  }

  // Check for key files
  const requiredFiles = [
    'run.py',
    'spec_runner.py',
    'requirements.txt'
  ];

  for (const file of requiredFiles) {
    const filePath = path.join(autoBuildPath, file);
    if (!existsSync(filePath)) {
      return {
        severity: 'critical',
        component: 'Auto Claude Directory',
        message: `Missing required file: ${file}`,
        details: `The auto-claude directory at ${autoBuildPath} is incomplete or invalid`
      };
    }
  }

  return null;
}

/**
 * Main validation function
 * Checks all environment variables and dependencies
 */
export async function validateEnvironment(
  autoBuildPath?: string
): Promise<EnvValidationResult> {
  const issues: ValidationIssue[] = [];
  const degradedFeatures: string[] = [];
  const unavailableFeatures: string[] = [];

  // 1. Validate Python
  const pythonIssue = validatePython();
  if (pythonIssue) {
    issues.push(pythonIssue);
    if (pythonIssue.severity === 'critical') {
      degradedFeatures.push('All Auto Claude functionality');
    }
  }

  // 2. Validate auto-claude directory
  const autoClaudeIssue = validateAutoClaude(autoBuildPath);
  if (autoClaudeIssue) {
    issues.push(autoClaudeIssue);
    if (autoClaudeIssue.severity === 'critical') {
      degradedFeatures.push('All Auto Claude functionality');
    }
  }

  // 3. Load and validate .env file
  let env: Record<string, string> = {};
  if (autoBuildPath) {
    const envPath = path.join(autoBuildPath, '.env');
    env = parseEnvFile(envPath);

    // 4. Validate Claude token
    const tokenIssue = validateClaudeToken(env);
    if (tokenIssue) {
      issues.push(tokenIssue);
      if (tokenIssue.severity === 'critical') {
        degradedFeatures.push('All Auto Claude functionality');
      }
    }

    // 5. Validate Graphiti if enabled
    const graphitiIssues = validateGraphiti(env);
    for (const issue of graphitiIssues) {
      issues.push(issue);
      if (issue.severity === 'warning' && issue.featureImpact) {
        degradedFeatures.push(issue.featureImpact);
      }
      if (issue.severity === 'info' && issue.featureImpact) {
        unavailableFeatures.push(issue.featureImpact);
      }
    }

    // 6. Validate Linear integration
    const linearIssue = validateLinear(env);
    if (linearIssue) {
      issues.push(linearIssue);
      if (linearIssue.featureImpact) {
        if (linearIssue.severity === 'warning') {
          degradedFeatures.push(linearIssue.featureImpact);
        } else {
          unavailableFeatures.push(linearIssue.featureImpact);
        }
      }
    }
  }

  // Determine if app can start (no critical errors)
  const canStart = !issues.some(issue => issue.severity === 'critical');

  return {
    canStart,
    issues,
    degradedFeatures: [...new Set(degradedFeatures)],
    unavailableFeatures: [...new Set(unavailableFeatures)]
  };
}

/**
 * Display validation results to user via dialog
 */
export async function showValidationDialog(
  result: EnvValidationResult,
  mainWindow: BrowserWindow | null
): Promise<void> {
  const criticalIssues = result.issues.filter(i => i.severity === 'critical');
  const warnings = result.issues.filter(i => i.severity === 'warning');

  if (criticalIssues.length === 0 && warnings.length === 0) {
    return; // No issues to show
  }

  let message = '';

  if (criticalIssues.length > 0) {
    message += 'Critical Issues:\n\n';
    for (const issue of criticalIssues) {
      message += `• ${issue.component}: ${issue.message}\n`;
      if (issue.details) {
        message += `  ${issue.details}\n`;
      }
      message += '\n';
    }
  }

  if (warnings.length > 0) {
    if (message) message += '\n';
    message += 'Warnings:\n\n';
    for (const warning of warnings) {
      message += `• ${warning.component}: ${warning.message}\n`;
      if (warning.details) {
        message += `  ${warning.details}\n`;
      }
      message += '\n';
    }
  }

  if (result.degradedFeatures.length > 0) {
    message += '\nDegraded Features:\n';
    for (const feature of result.degradedFeatures) {
      message += `  - ${feature}\n`;
    }
  }

  const dialogType = criticalIssues.length > 0 ? 'error' : 'warning';
  const dialogTitle = criticalIssues.length > 0
    ? 'Auto Claude - Critical Configuration Errors'
    : 'Auto Claude - Configuration Warnings';

  await dialog.showMessageBox(mainWindow || { browserWindow: undefined } as any, {
    type: dialogType,
    title: dialogTitle,
    message: dialogTitle,
    detail: message.trim(),
    buttons: ['OK']
  });
}

/**
 * Log validation results to console
 */
export function logValidationResults(result: EnvValidationResult): void {
  if (result.issues.length === 0) {
    console.warn('[EnvValidator] All environment checks passed');
    return;
  }

  console.warn('[EnvValidator] ========================================');
  console.warn('[EnvValidator] Environment Validation Results');
  console.warn('[EnvValidator] ========================================');

  for (const issue of result.issues) {
    const prefix = issue.severity === 'critical' ? '[ERROR]' :
                   issue.severity === 'warning' ? '[WARN]' : '[INFO]';
    console.warn(`[EnvValidator] ${prefix} ${issue.component}: ${issue.message}`);
    if (issue.details) {
      console.warn(`[EnvValidator]        ${issue.details}`);
    }
  }

  if (result.degradedFeatures.length > 0) {
    console.warn('[EnvValidator]');
    console.warn('[EnvValidator] Degraded Features:');
    for (const feature of result.degradedFeatures) {
      console.warn(`[EnvValidator]   - ${feature}`);
    }
  }

  if (result.unavailableFeatures.length > 0) {
    console.warn('[EnvValidator]');
    console.warn('[EnvValidator] Unavailable Features:');
    for (const feature of result.unavailableFeatures) {
      console.warn(`[EnvValidator]   - ${feature}`);
    }
  }

  console.warn('[EnvValidator] ========================================');
  console.warn(`[EnvValidator] Can Start: ${result.canStart ? 'YES' : 'NO'}`);
  console.warn('[EnvValidator] ========================================');
}
