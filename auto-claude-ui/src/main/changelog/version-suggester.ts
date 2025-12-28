import * as path from 'path';
import * as os from 'os';
import type { GitCommit } from '../../shared/types';
import { getProfileEnv } from '../rate-limit-detector';
import { parsePythonCommand } from '../python-detector';
import { getProcessManager } from '../utils/process-manager';

interface VersionSuggestion {
  version: string;
  reason: string;
  bumpType: 'major' | 'minor' | 'patch';
}

/**
 * AI-powered version bump suggester using Claude SDK with haiku model
 * Analyzes commits to intelligently suggest semantic version bumps with timeout protection
 */
export class VersionSuggester {
  private processManager = getProcessManager();
  private debugEnabled: boolean;
  private readonly VERSION_SUGGEST_TIMEOUT = 60 * 1000; // 1 minute

  constructor(
    private pythonPath: string,
    private claudePath: string,
    private autoBuildSourcePath: string,
    debugEnabled: boolean
  ) {
    this.debugEnabled = debugEnabled;
  }

  private debug(...args: unknown[]): void {
    if (this.debugEnabled) {
      console.warn('[VersionSuggester]', ...args);
    }
  }

  /**
   * Suggest version bump using AI analysis of commits with timeout protection
   */
  async suggestVersionBump(
    commits: GitCommit[],
    currentVersion: string
  ): Promise<VersionSuggestion> {
    this.debug('suggestVersionBump called', {
      commitCount: commits.length,
      currentVersion
    });

    // Build prompt for Claude to analyze commits
    const prompt = this.buildPrompt(commits, currentVersion);
    const script = this.createAnalysisScript(prompt);

    // Build environment
    const spawnEnv = this.buildSpawnEnvironment();

    // Parse Python command to handle space-separated commands like "py -3"
    const [pythonCommand, pythonBaseArgs] = parsePythonCommand(this.pythonPath);

    try {
      // Execute with ProcessManager (with timeout)
      const result = await this.processManager.execute({
        id: `version-suggest-${Date.now()}`,
        command: pythonCommand,
        args: [...pythonBaseArgs, '-c', script],
        spawnOptions: {
          cwd: this.autoBuildSourcePath,
          env: spawnEnv
        },
        timeout: this.VERSION_SUGGEST_TIMEOUT,
        description: 'Version bump suggestion analysis'
      });

      // Parse AI response
      const suggestion = this.parseAIResponse(result.stdout.trim(), currentVersion);
      this.debug('AI suggestion parsed', suggestion);
      return suggestion;
    } catch (error) {
      this.debug('AI analysis failed, using fallback', error);
      // Fallback to simple bump on any error
      return this.fallbackSuggestion(currentVersion);
    }
  }

  /**
   * Build prompt for Claude to analyze commits and suggest version bump
   */
  private buildPrompt(commits: GitCommit[], currentVersion: string): string {
    const commitSummary = commits
      .map((c, i) => `${i + 1}. ${c.hash} - ${c.subject}`)
      .join('\n');

    return `You are a semantic versioning expert analyzing git commits to suggest the appropriate version bump.

Current version: ${currentVersion}

Analyze these ${commits.length} commits and determine the appropriate semantic version bump:

${commitSummary}

Consider:
- MAJOR (X.0.0): Breaking changes, API changes, removed features, architectural changes
- MINOR (0.X.0): New features, enhancements, additions that maintain backward compatibility
- PATCH (0.0.X): Bug fixes, small tweaks, documentation updates, refactoring without new features

Respond with ONLY a JSON object in this exact format (no markdown, no extra text):
{
  "bumpType": "major|minor|patch",
  "reason": "Brief explanation of the decision"
}`;
  }

  /**
   * Create Python script to run Claude analysis
   */
  private createAnalysisScript(prompt: string): string {
    // Escape the prompt for Python string literal
    const escapedPrompt = prompt
      .replace(/\\/g, '\\\\')
      .replace(/"/g, '\\"')
      .replace(/\n/g, '\\n');

    return `
import subprocess
import sys

# Use haiku model for fast, cost-effective analysis
prompt = "${escapedPrompt}"

try:
    result = subprocess.run(
        ["${this.claudePath}", "chat", "--model", "haiku", "--prompt", prompt],
        capture_output=True,
        text=True,
        check=True
    )
    print(result.stdout)
except subprocess.CalledProcessError as e:
    print(f"Error: {e.stderr}", file=sys.stderr)
    sys.exit(1)
except Exception as e:
    print(f"Error: {str(e)}", file=sys.stderr)
    sys.exit(1)
`;
  }

  /**
   * Parse AI response to extract version suggestion
   */
  private parseAIResponse(output: string, currentVersion: string): VersionSuggestion {
    // Extract JSON from output (Claude might wrap it in markdown or other text)
    const jsonMatch = output.match(/\{[\s\S]*"bumpType"[\s\S]*"reason"[\s\S]*\}/);
    if (!jsonMatch) {
      throw new Error('No JSON found in AI response');
    }

    const parsed = JSON.parse(jsonMatch[0]);
    const bumpType = parsed.bumpType as 'major' | 'minor' | 'patch';
    const reason = parsed.reason || 'AI analysis of commits';

    // Calculate new version
    const [major, minor, patch] = currentVersion.split('.').map(Number);

    let newVersion: string;
    switch (bumpType) {
      case 'major':
        newVersion = `${major + 1}.0.0`;
        break;
      case 'minor':
        newVersion = `${major}.${minor + 1}.0`;
        break;
      case 'patch':
      default:
        newVersion = `${major}.${minor}.${patch + 1}`;
        break;
    }

    return {
      version: newVersion,
      reason,
      bumpType
    };
  }

  /**
   * Fallback suggestion if AI analysis fails
   */
  private fallbackSuggestion(currentVersion: string): VersionSuggestion {
    const [major, minor, patch] = currentVersion.split('.').map(Number);
    return {
      version: `${major}.${minor}.${patch + 1}`,
      reason: 'Patch version bump (default)',
      bumpType: 'patch'
    };
  }

  /**
   * Build spawn environment with proper PATH and auth settings
   */
  private buildSpawnEnvironment(): Record<string, string> {
    const homeDir = os.homedir();
    const isWindows = process.platform === 'win32';

    // Build PATH with platform-appropriate separator and locations
    const pathAdditions = isWindows
      ? [
          path.join(homeDir, 'AppData', 'Local', 'Programs', 'claude'),
          path.join(homeDir, 'AppData', 'Roaming', 'npm'),
          path.join(homeDir, '.local', 'bin'),
          'C:\\Program Files\\Claude',
          'C:\\Program Files (x86)\\Claude'
        ]
      : [
          '/usr/local/bin',
          '/opt/homebrew/bin',
          path.join(homeDir, '.local', 'bin'),
          path.join(homeDir, 'bin')
        ];

    // Get active Claude profile environment
    const profileEnv = getProfileEnv();

    const spawnEnv: Record<string, string> = {
      ...process.env as Record<string, string>,
      ...profileEnv,
      ...(isWindows ? { USERPROFILE: homeDir } : { HOME: homeDir }),
      USER: process.env.USER || process.env.USERNAME || 'user',
      PATH: [process.env.PATH || '', ...pathAdditions].filter(Boolean).join(path.delimiter),
      PYTHONUNBUFFERED: '1',
      PYTHONIOENCODING: 'utf-8',
      PYTHONUTF8: '1'
    };

    return spawnEnv;
  }
}
