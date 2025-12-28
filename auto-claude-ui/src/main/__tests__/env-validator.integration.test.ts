/**
 * Integration tests for Environment Validator
 * Tests comprehensive validation scenarios with real file system
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { validateEnvironment, logValidationResults } from '../env-validator';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';

// Mock dialog to avoid UI during tests
vi.mock('electron', () => ({
  app: {
    getPath: () => '/tmp/test-app-data',
    isPackaged: false
  },
  dialog: {
    showMessageBox: vi.fn(() => Promise.resolve({ response: 0 }))
  }
}));

describe('EnvValidator - Integration Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `env-validator-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const createValidAutoClaude = (dir: string) => {
    writeFileSync(path.join(dir, 'run.py'), '#!/usr/bin/env python3');
    writeFileSync(path.join(dir, 'spec_runner.py'), '#!/usr/bin/env python3');
    writeFileSync(path.join(dir, 'requirements.txt'), 'anthropic>=0.3.0');
  };

  const createEnvFile = (dir: string, content: string) => {
    writeFileSync(path.join(dir, '.env'), content);
  };

  describe('Critical Validations', () => {
    it('should fail when auto-claude path not provided', async () => {
      const result = await validateEnvironment(undefined);

      expect(result.canStart).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'critical',
          component: 'Auto Claude Directory',
          message: expect.stringContaining('not configured')
        })
      );
    });

    it('should fail when auto-claude directory does not exist', async () => {
      const nonexistentPath = path.join(tempDir, 'nonexistent');

      const result = await validateEnvironment(nonexistentPath);

      expect(result.canStart).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'critical',
          component: 'Auto Claude Directory',
          message: expect.stringContaining('not found')
        })
      );
    });

    it('should fail when required files are missing', async () => {
      // Create directory but without required files
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

    it('should fail when CLAUDE_CODE_OAUTH_TOKEN is missing', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(tempDir, '# Empty config');

      const result = await validateEnvironment(tempDir);

      expect(result.canStart).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'critical',
          component: 'Claude Authentication',
          message: expect.stringContaining('CLAUDE_CODE_OAUTH_TOKEN not configured')
        })
      );
      expect(result.degradedFeatures).toContain('All Auto Claude functionality');
    });

    it('should fail when token is too short', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(tempDir, 'CLAUDE_CODE_OAUTH_TOKEN=short');

      const result = await validateEnvironment(tempDir);

      expect(result.canStart).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'critical',
          component: 'Claude Authentication',
          message: expect.stringContaining('appears invalid')
        })
      );
    });

    it('should check Python availability', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(tempDir, 'CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here');

      const result = await validateEnvironment(tempDir);

      // Python check is critical - may fail in CI but should be tested
      const pythonIssue = result.issues.find(i => i.component === 'Python');
      if (pythonIssue) {
        expect(pythonIssue.severity).toBe('critical');
      }
    });
  });

  describe('Graphiti Provider Validation', () => {
    it('should report info when Graphiti is not enabled', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        'CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here'
      );

      const result = await validateEnvironment(tempDir);

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'info',
          component: 'Graphiti Memory',
          message: expect.stringContaining('not enabled')
        })
      );
      expect(result.unavailableFeatures).toContain(
        'Cross-session memory and semantic search unavailable'
      );
    });

    it('should warn when Graphiti enabled with OpenAI but missing API key', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=openai`
      );

      const result = await validateEnvironment(tempDir);

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          component: expect.stringContaining('Graphiti - OpenAI LLM'),
          message: expect.stringContaining('OPENAI_API_KEY not set')
        })
      );
      expect(result.degradedFeatures).toContain('Graphiti memory features will fail');
    });

    it('should warn when Graphiti enabled with Anthropic but missing API key', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic`
      );

      const result = await validateEnvironment(tempDir);

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          component: expect.stringContaining('Graphiti - Anthropic LLM'),
          message: expect.stringContaining('ANTHROPIC_API_KEY not set')
        })
      );
    });

    it('should warn when Azure OpenAI credentials incomplete', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=azure_openai
AZURE_OPENAI_API_KEY=test-key`
      );

      const result = await validateEnvironment(tempDir);

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          component: expect.stringContaining('Graphiti - Azure OpenAI LLM'),
          message: expect.stringContaining('incomplete')
        })
      );
    });

    it('should warn when Google AI enabled but missing API key', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=google`
      );

      const result = await validateEnvironment(tempDir);

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          component: expect.stringContaining('Graphiti - Google AI LLM'),
          message: expect.stringContaining('GOOGLE_API_KEY not set')
        })
      );
    });

    it('should warn when Ollama model not configured', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=ollama`
      );

      const result = await validateEnvironment(tempDir);

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          component: expect.stringContaining('Graphiti - Ollama LLM'),
          message: expect.stringContaining('OLLAMA_LLM_MODEL not set')
        })
      );
    });

    it('should validate embedder provider credentials', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=openai
GRAPHITI_EMBEDDER_PROVIDER=voyage`
      );

      const result = await validateEnvironment(tempDir);

      // Should warn about both LLM and embedder
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          component: expect.stringContaining('Graphiti - OpenAI LLM')
        })
      );
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          component: expect.stringContaining('Graphiti - Voyage Embeddings'),
          message: expect.stringContaining('VOYAGE_API_KEY not set')
        })
      );
    });

    it('should pass when Graphiti fully configured with OpenAI', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=openai
GRAPHITI_EMBEDDER_PROVIDER=openai
OPENAI_API_KEY=sk-test-key-12345678901234567890`
      );

      const result = await validateEnvironment(tempDir);

      // Should not have Graphiti-related warnings
      const graphitiWarnings = result.issues.filter(
        i => i.component.includes('Graphiti') && i.severity === 'warning'
      );
      expect(graphitiWarnings).toHaveLength(0);
    });

    it('should validate Ollama embedder configuration', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=ollama
GRAPHITI_EMBEDDER_PROVIDER=ollama
OLLAMA_LLM_MODEL=deepseek-r1:7b`
      );

      const result = await validateEnvironment(tempDir);

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          component: expect.stringContaining('Graphiti - Ollama Embeddings'),
          message: expect.stringContaining('OLLAMA_EMBEDDING_MODEL not set')
        })
      );
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          component: expect.stringContaining('Graphiti - Ollama Embeddings'),
          message: expect.stringContaining('OLLAMA_EMBEDDING_DIM not set')
        })
      );
    });
  });

  describe('Linear Integration Validation', () => {
    it('should report info when Linear not configured', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        'CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here'
      );

      const result = await validateEnvironment(tempDir);

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'info',
          component: 'Linear Integration',
          message: expect.stringContaining('not configured')
        })
      );
      expect(result.unavailableFeatures).toContain('Linear progress tracking unavailable');
    });

    it('should warn when Linear API key has invalid format', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here
LINEAR_API_KEY=invalid_key_format`
      );

      const result = await validateEnvironment(tempDir);

      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'warning',
          component: 'Linear Integration',
          message: expect.stringContaining('format appears invalid')
        })
      );
      expect(result.degradedFeatures).toContain('Linear integration may not work');
    });

    it('should pass when Linear API key is valid format', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here
LINEAR_API_KEY=lin_api_1234567890abcdef`
      );

      const result = await validateEnvironment(tempDir);

      // Should not have Linear warnings
      const linearWarnings = result.issues.filter(
        i => i.component === 'Linear Integration' && i.severity === 'warning'
      );
      expect(linearWarnings).toHaveLength(0);
    });
  });

  describe('Complete Configuration Scenarios', () => {
    it('should pass with minimal valid configuration', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        'CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here'
      );

      const result = await validateEnvironment(tempDir);

      // Should be able to start (Python check might fail in CI)
      const criticalNonPython = result.issues.filter(
        i => i.severity === 'critical' && i.component !== 'Python'
      );
      expect(criticalNonPython).toHaveLength(0);
    });

    it('should pass with full Graphiti and Linear configuration', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=openai
GRAPHITI_EMBEDDER_PROVIDER=openai
OPENAI_API_KEY=sk-test-key-12345678901234567890
LINEAR_API_KEY=lin_api_1234567890abcdef`
      );

      const result = await validateEnvironment(tempDir);

      // Should have no warnings or critical issues (except possibly Python)
      const warningsAndCritical = result.issues.filter(
        i =>
          (i.severity === 'warning' || i.severity === 'critical') &&
          i.component !== 'Python'
      );
      expect(warningsAndCritical).toHaveLength(0);
    });

    it('should handle mixed provider configuration', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=voyage
ANTHROPIC_API_KEY=sk-ant-test-key-12345
VOYAGE_API_KEY=pa-test-voyage-key`
      );

      const result = await validateEnvironment(tempDir);

      // Should have no Graphiti warnings
      const graphitiWarnings = result.issues.filter(
        i => i.component.includes('Graphiti') && i.severity === 'warning'
      );
      expect(graphitiWarnings).toHaveLength(0);
    });
  });

  describe('Feature Impact Reporting', () => {
    it('should report degraded features correctly', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN=short
GRAPHITI_ENABLED=true
LINEAR_API_KEY=invalid_format`
      );

      const result = await validateEnvironment(tempDir);

      expect(result.degradedFeatures).toContain('All Auto Claude functionality');
      expect(result.degradedFeatures.length).toBeGreaterThan(0);
    });

    it('should report unavailable features correctly', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        'CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here'
      );

      const result = await validateEnvironment(tempDir);

      expect(result.unavailableFeatures).toContain(
        'Cross-session memory and semantic search unavailable'
      );
      expect(result.unavailableFeatures).toContain('Linear progress tracking unavailable');
    });

    it('should not duplicate features in degraded/unavailable lists', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here
GRAPHITI_ENABLED=true`
      );

      const result = await validateEnvironment(tempDir);

      // Check for duplicates
      const allFeatures = [
        ...result.degradedFeatures,
        ...result.unavailableFeatures
      ];
      const uniqueFeatures = new Set(allFeatures);
      expect(allFeatures.length).toBe(uniqueFeatures.size);
    });
  });

  describe('Validation Result Logging', () => {
    it('should log validation results without throwing', () => {
      const result = {
        canStart: true,
        issues: [],
        degradedFeatures: [],
        unavailableFeatures: []
      };

      expect(() => logValidationResults(result)).not.toThrow();
    });

    it('should log results with issues', () => {
      const result = {
        canStart: false,
        issues: [
          {
            severity: 'critical' as const,
            component: 'Test Component',
            message: 'Test error',
            details: 'Test details'
          },
          {
            severity: 'warning' as const,
            component: 'Warning Component',
            message: 'Test warning'
          },
          {
            severity: 'info' as const,
            component: 'Info Component',
            message: 'Test info'
          }
        ],
        degradedFeatures: ['Feature 1'],
        unavailableFeatures: ['Feature 2']
      };

      expect(() => logValidationResults(result)).not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle .env file with comments and empty lines', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `# This is a comment
CLAUDE_CODE_OAUTH_TOKEN=valid_token_with_sufficient_length_here

# Another comment
GRAPHITI_ENABLED=false

`
      );

      const result = await validateEnvironment(tempDir);

      const criticalNonPython = result.issues.filter(
        i => i.severity === 'critical' && i.component !== 'Python'
      );
      expect(criticalNonPython).toHaveLength(0);
    });

    it('should handle .env file with quoted values', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN="valid_token_with_sufficient_length_here"
LINEAR_API_KEY='lin_api_1234567890abcdef'`
      );

      const result = await validateEnvironment(tempDir);

      // Should parse quoted values correctly
      const linearWarnings = result.issues.filter(
        i => i.component === 'Linear Integration' && i.severity === 'warning'
      );
      expect(linearWarnings).toHaveLength(0);
    });

    it('should handle missing .env file gracefully', async () => {
      createValidAutoClaude(tempDir);
      // Don't create .env file

      const result = await validateEnvironment(tempDir);

      expect(result.canStart).toBe(false);
      expect(result.issues).toContainEqual(
        expect.objectContaining({
          severity: 'critical',
          component: 'Claude Authentication'
        })
      );
    });

    it('should handle malformed .env file', async () => {
      createValidAutoClaude(tempDir);
      createEnvFile(
        tempDir,
        `CLAUDE_CODE_OAUTH_TOKEN=valid_token
MALFORMED LINE WITHOUT EQUALS
GRAPHITI_ENABLED=true`
      );

      const result = await validateEnvironment(tempDir);

      // Should still parse valid lines
      expect(result.issues.some(i => i.component === 'Claude Authentication')).toBe(
        false
      );
    });
  });
});
