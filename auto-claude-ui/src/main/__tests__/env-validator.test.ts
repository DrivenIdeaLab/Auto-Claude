/**
 * Tests for environment validation service
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { validateEnvironment } from '../env-validator';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';

describe('Environment Validator', () => {
  let tempDir: string;

  beforeEach(() => {
    // Create temp directory for tests
    tempDir = path.join(os.tmpdir(), `auto-claude-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    // Clean up temp directory
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it('should fail validation when auto-claude directory does not exist', async () => {
    const result = await validateEnvironment('/nonexistent/path');

    expect(result.canStart).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: 'critical',
        component: 'Auto Claude Directory'
      })
    );
  });

  it('should fail validation when required files are missing', async () => {
    const result = await validateEnvironment(tempDir);

    expect(result.canStart).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: 'critical',
        component: 'Auto Claude Directory',
        message: expect.stringContaining('Missing required file')
      })
    );
  });

  it('should fail validation when CLAUDE_CODE_OAUTH_TOKEN is missing', async () => {
    // Create required files
    writeFileSync(path.join(tempDir, 'run.py'), '');
    writeFileSync(path.join(tempDir, 'spec_runner.py'), '');
    writeFileSync(path.join(tempDir, 'requirements.txt'), '');
    writeFileSync(path.join(tempDir, '.env'), '# Empty env file');

    const result = await validateEnvironment(tempDir);

    expect(result.canStart).toBe(false);
    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: 'critical',
        component: 'Claude Authentication',
        message: expect.stringContaining('CLAUDE_CODE_OAUTH_TOKEN not configured')
      })
    );
  });

  it('should pass validation with valid configuration', async () => {
    // Create required files
    writeFileSync(path.join(tempDir, 'run.py'), '');
    writeFileSync(path.join(tempDir, 'spec_runner.py'), '');
    writeFileSync(path.join(tempDir, 'requirements.txt'), '');
    writeFileSync(
      path.join(tempDir, '.env'),
      'CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length'
    );

    const result = await validateEnvironment(tempDir);

    // Should be able to start (Python check might fail in test environment, but that's ok)
    const criticalIssues = result.issues.filter(i => i.severity === 'critical');
    const nonPythonCritical = criticalIssues.filter(
      i => i.component !== 'Python'
    );

    expect(nonPythonCritical).toHaveLength(0);
  });

  it('should warn about Graphiti when enabled but missing credentials', async () => {
    // Create required files
    writeFileSync(path.join(tempDir, 'run.py'), '');
    writeFileSync(path.join(tempDir, 'spec_runner.py'), '');
    writeFileSync(path.join(tempDir, 'requirements.txt'), '');
    writeFileSync(
      path.join(tempDir, '.env'),
      `CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=openai`
    );

    const result = await validateEnvironment(tempDir);

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        component: expect.stringContaining('Graphiti'),
        message: expect.stringContaining('OPENAI_API_KEY')
      })
    );
  });

  it('should report info for unconfigured optional features', async () => {
    // Create required files
    writeFileSync(path.join(tempDir, 'run.py'), '');
    writeFileSync(path.join(tempDir, 'spec_runner.py'), '');
    writeFileSync(path.join(tempDir, 'requirements.txt'), '');
    writeFileSync(
      path.join(tempDir, '.env'),
      'CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length'
    );

    const result = await validateEnvironment(tempDir);

    const infoIssues = result.issues.filter(i => i.severity === 'info');
    expect(infoIssues.length).toBeGreaterThan(0);
  });

  it('should validate Linear API key format', async () => {
    // Create required files
    writeFileSync(path.join(tempDir, 'run.py'), '');
    writeFileSync(path.join(tempDir, 'spec_runner.py'), '');
    writeFileSync(path.join(tempDir, 'requirements.txt'), '');
    writeFileSync(
      path.join(tempDir, '.env'),
      `CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length
LINEAR_API_KEY=invalid_format`
    );

    const result = await validateEnvironment(tempDir);

    expect(result.issues).toContainEqual(
      expect.objectContaining({
        severity: 'warning',
        component: 'Linear Integration',
        message: expect.stringContaining('format appears invalid')
      })
    );
  });
});
