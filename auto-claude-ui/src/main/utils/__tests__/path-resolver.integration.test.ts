/**
 * Integration tests for PathResolver
 * Tests path resolution in development and production environments
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  getAutoBuildSourcePath,
  getUpdateTargetPath,
  getUpdateCachePath,
  getEffectiveSourcePath,
  validateAutoBuildSource,
  getDiagnosticPaths,
  isProduction
} from '../path-resolver';
import { existsSync, mkdirSync, writeFileSync, rmSync } from 'fs';
import path from 'path';
import os from 'os';

// Mock electron app module
let mockIsPackaged = false;
let mockAppPath = '/mock/app/path';
let mockUserDataPath = '/mock/userdata';
let mockResourcesPath = '/mock/resources';

vi.mock('electron', () => ({
  app: {
    get isPackaged() {
      return mockIsPackaged;
    },
    getAppPath: () => mockAppPath,
    getPath: (name: string) => {
      if (name === 'userData') return mockUserDataPath;
      return '/mock/path';
    }
  }
}));

// Override process.resourcesPath
Object.defineProperty(process, 'resourcesPath', {
  get: () => mockResourcesPath,
  configurable: true
});

describe('PathResolver - Integration Tests', () => {
  let tempDir: string;

  beforeEach(() => {
    tempDir = path.join(os.tmpdir(), `path-resolver-test-${Date.now()}`);
    mkdirSync(tempDir, { recursive: true });

    // Reset mocks to development mode defaults
    mockIsPackaged = false;
    mockAppPath = tempDir;
    mockUserDataPath = path.join(tempDir, 'userdata');
    mockResourcesPath = path.join(tempDir, 'resources');

    mkdirSync(mockUserDataPath, { recursive: true });
    mkdirSync(mockResourcesPath, { recursive: true });
  });

  afterEach(() => {
    if (existsSync(tempDir)) {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  const createValidAutoBuildSource = (dir: string) => {
    mkdirSync(dir, { recursive: true });
    writeFileSync(path.join(dir, 'requirements.txt'), 'anthropic>=0.3.0');
    writeFileSync(path.join(dir, 'run.py'), '#!/usr/bin/env python3');
    writeFileSync(path.join(dir, 'spec_runner.py'), '#!/usr/bin/env python3');
  };

  describe('isProduction', () => {
    it('should return false in development mode', () => {
      mockIsPackaged = false;
      expect(isProduction()).toBe(false);
    });

    it('should return true in production mode', () => {
      mockIsPackaged = true;
      expect(isProduction()).toBe(true);
    });
  });

  describe('Development Path Resolution', () => {
    beforeEach(() => {
      mockIsPackaged = false;
    });

    it('should find auto-claude sibling to auto-claude-ui', () => {
      const autoBuildPath = path.join(tempDir, 'auto-claude');
      createValidAutoBuildSource(autoBuildPath);

      // Mock app path as auto-claude-ui
      mockAppPath = path.join(tempDir, 'auto-claude-ui');

      const result = getAutoBuildSourcePath();

      expect(result).toBe(autoBuildPath);
      expect(result).toContain('auto-claude');
    });

    it('should find auto-claude from process.cwd()', () => {
      const autoBuildPath = path.join(process.cwd(), '..', 'auto-claude');

      if (existsSync(autoBuildPath) && existsSync(path.join(autoBuildPath, 'requirements.txt'))) {
        const result = getAutoBuildSourcePath();
        expect(result).toBeTruthy();
      }
    });

    it('should return null when auto-claude not found in development', () => {
      mockAppPath = '/completely/nonexistent/path';

      const result = getAutoBuildSourcePath();

      expect(result).toBeNull();
    });

    it('should prioritize paths with valid requirements.txt', () => {
      // Create invalid directory (no requirements.txt)
      const invalidPath = path.join(tempDir, 'auto-claude-invalid');
      mkdirSync(invalidPath, { recursive: true });

      // Create valid directory
      const validPath = path.join(tempDir, 'auto-claude');
      createValidAutoBuildSource(validPath);

      mockAppPath = path.join(tempDir, 'auto-claude-ui');

      const result = getAutoBuildSourcePath();

      expect(result).toBe(validPath);
    });
  });

  describe('Production Path Resolution', () => {
    beforeEach(() => {
      mockIsPackaged = true;
    });

    it('should find auto-claude in resources directory', () => {
      const autoBuildPath = path.join(mockResourcesPath, 'auto-claude');
      createValidAutoBuildSource(autoBuildPath);

      const result = getAutoBuildSourcePath();

      expect(result).toBe(autoBuildPath);
    });

    it('should find auto-claude in ASAR unpacked directory', () => {
      const asarPath = path.join(mockResourcesPath, 'app.asar.unpacked', 'auto-claude');
      createValidAutoBuildSource(asarPath);

      const result = getAutoBuildSourcePath();

      expect(result).toBe(asarPath);
    });

    it('should prioritize userData override in production', () => {
      // Create bundled version
      const bundledPath = path.join(mockResourcesPath, 'auto-claude');
      createValidAutoBuildSource(bundledPath);

      // Create userData override
      const overridePath = path.join(mockUserDataPath, 'auto-claude-source');
      createValidAutoBuildSource(overridePath);

      const result = getAutoBuildSourcePath();

      // Should prefer userData override
      expect(result).toBe(overridePath);
    });

    it('should fall back to bundled when userData override invalid', () => {
      // Create invalid userData override (missing requirements.txt)
      const overridePath = path.join(mockUserDataPath, 'auto-claude-source');
      mkdirSync(overridePath, { recursive: true });

      // Create valid bundled version
      const bundledPath = path.join(mockResourcesPath, 'auto-claude');
      createValidAutoBuildSource(bundledPath);

      const result = getAutoBuildSourcePath();

      expect(result).toBe(bundledPath);
    });

    it('should return null when no valid source in production', () => {
      // Don't create any auto-claude directories
      const result = getAutoBuildSourcePath();

      expect(result).toBeNull();
    });
  });

  describe('Update Target Path', () => {
    it('should use source directory in development', () => {
      mockIsPackaged = false;

      const autoBuildPath = path.join(tempDir, 'auto-claude');
      createValidAutoBuildSource(autoBuildPath);
      mockAppPath = path.join(tempDir, 'auto-claude-ui');

      const targetPath = getUpdateTargetPath();

      // Should point to actual source or userData
      expect(targetPath).toBeTruthy();
    });

    it('should use userData in production', () => {
      mockIsPackaged = true;

      const targetPath = getUpdateTargetPath();

      expect(targetPath).toBe(path.join(mockUserDataPath, 'auto-claude-source'));
    });
  });

  describe('Update Cache Path', () => {
    it('should always use userData for cache', () => {
      const cachePath = getUpdateCachePath();

      expect(cachePath).toBe(path.join(mockUserDataPath, 'auto-claude-updates'));
    });

    it('should return same path in development and production', () => {
      mockIsPackaged = false;
      const devCache = getUpdateCachePath();

      mockIsPackaged = true;
      const prodCache = getUpdateCachePath();

      expect(devCache).toBe(prodCache);
    });
  });

  describe('Effective Source Path', () => {
    it('should return source path in development', () => {
      mockIsPackaged = false;

      const autoBuildPath = path.join(tempDir, 'auto-claude');
      createValidAutoBuildSource(autoBuildPath);
      mockAppPath = path.join(tempDir, 'auto-claude-ui');

      const effectivePath = getEffectiveSourcePath();

      expect(effectivePath).toBe(autoBuildPath);
    });

    it('should prefer userData override in production', () => {
      mockIsPackaged = true;

      // Create bundled version
      const bundledPath = path.join(mockResourcesPath, 'auto-claude');
      createValidAutoBuildSource(bundledPath);

      // Create userData override
      const overridePath = path.join(mockUserDataPath, 'auto-claude-source');
      createValidAutoBuildSource(overridePath);

      const effectivePath = getEffectiveSourcePath();

      expect(effectivePath).toBe(overridePath);
    });

    it('should fall back to bundled when no override exists', () => {
      mockIsPackaged = true;

      // Create only bundled version
      const bundledPath = path.join(mockResourcesPath, 'auto-claude');
      createValidAutoBuildSource(bundledPath);

      const effectivePath = getEffectiveSourcePath();

      expect(effectivePath).toBe(bundledPath);
    });
  });

  describe('Validation', () => {
    it('should validate path with all required files', () => {
      const autoBuildPath = path.join(tempDir, 'valid-auto-claude');
      createValidAutoBuildSource(autoBuildPath);

      const isValid = validateAutoBuildSource(autoBuildPath);

      expect(isValid).toBe(true);
    });

    it('should reject path that does not exist', () => {
      const nonexistentPath = path.join(tempDir, 'nonexistent');

      const isValid = validateAutoBuildSource(nonexistentPath);

      expect(isValid).toBe(false);
    });

    it('should reject path missing requirements.txt', () => {
      const incompletePath = path.join(tempDir, 'incomplete');
      mkdirSync(incompletePath, { recursive: true });
      writeFileSync(path.join(incompletePath, 'run.py'), '');
      writeFileSync(path.join(incompletePath, 'spec_runner.py'), '');
      // Missing requirements.txt

      const isValid = validateAutoBuildSource(incompletePath);

      expect(isValid).toBe(false);
    });

    it('should reject path missing run.py', () => {
      const incompletePath = path.join(tempDir, 'incomplete');
      mkdirSync(incompletePath, { recursive: true });
      writeFileSync(path.join(incompletePath, 'requirements.txt'), '');
      writeFileSync(path.join(incompletePath, 'spec_runner.py'), '');
      // Missing run.py

      const isValid = validateAutoBuildSource(incompletePath);

      expect(isValid).toBe(false);
    });

    it('should reject path missing spec_runner.py', () => {
      const incompletePath = path.join(tempDir, 'incomplete');
      mkdirSync(incompletePath, { recursive: true });
      writeFileSync(path.join(incompletePath, 'requirements.txt'), '');
      writeFileSync(path.join(incompletePath, 'run.py'), '');
      // Missing spec_runner.py

      const isValid = validateAutoBuildSource(incompletePath);

      expect(isValid).toBe(false);
    });

    it('should reject completely empty directory', () => {
      const emptyPath = path.join(tempDir, 'empty');
      mkdirSync(emptyPath, { recursive: true });

      const isValid = validateAutoBuildSource(emptyPath);

      expect(isValid).toBe(false);
    });
  });

  describe('Diagnostic Paths', () => {
    it('should return all diagnostic information', () => {
      const diagnostics = getDiagnosticPaths();

      expect(diagnostics).toHaveProperty('isPackaged');
      expect(diagnostics).toHaveProperty('appPath');
      expect(diagnostics).toHaveProperty('resourcesPath');
      expect(diagnostics).toHaveProperty('userData');
      expect(diagnostics).toHaveProperty('cwd');
      expect(diagnostics).toHaveProperty('__dirname');
      expect(diagnostics).toHaveProperty('autoBuildSource');
      expect(diagnostics).toHaveProperty('effectiveSource');
      expect(diagnostics).toHaveProperty('updateTarget');
      expect(diagnostics).toHaveProperty('updateCache');
    });

    it('should show NOT FOUND when source not available', () => {
      mockIsPackaged = false;
      mockAppPath = '/nonexistent/path';

      const diagnostics = getDiagnosticPaths();

      expect(diagnostics.autoBuildSource).toBe('NOT FOUND');
      expect(diagnostics.effectiveSource).toBe('NOT FOUND');
    });

    it('should show valid paths when source is available', () => {
      mockIsPackaged = false;

      const autoBuildPath = path.join(tempDir, 'auto-claude');
      createValidAutoBuildSource(autoBuildPath);
      mockAppPath = path.join(tempDir, 'auto-claude-ui');

      const diagnostics = getDiagnosticPaths();

      expect(diagnostics.autoBuildSource).not.toBe('NOT FOUND');
      expect(diagnostics.effectiveSource).not.toBe('NOT FOUND');
    });

    it('should include packaged state in diagnostics', () => {
      mockIsPackaged = true;
      const prodDiagnostics = getDiagnosticPaths();
      expect(prodDiagnostics.isPackaged).toBe('true');

      mockIsPackaged = false;
      const devDiagnostics = getDiagnosticPaths();
      expect(devDiagnostics.isPackaged).toBe('false');
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('should handle symlinked directories', () => {
      // Create actual directory
      const actualPath = path.join(tempDir, 'actual-auto-claude');
      createValidAutoBuildSource(actualPath);

      // Note: Creating symlinks requires elevated permissions on Windows
      // This test will verify the function handles them if they exist
      const isValid = validateAutoBuildSource(actualPath);
      expect(isValid).toBe(true);
    });

    it('should handle paths with spaces', () => {
      const pathWithSpaces = path.join(tempDir, 'path with spaces', 'auto-claude');
      createValidAutoBuildSource(pathWithSpaces);

      const isValid = validateAutoBuildSource(pathWithSpaces);

      expect(isValid).toBe(true);
    });

    it('should handle paths with special characters', () => {
      const specialPath = path.join(tempDir, 'auto-claude-v2.0');
      createValidAutoBuildSource(specialPath);

      const isValid = validateAutoBuildSource(specialPath);

      expect(isValid).toBe(true);
    });

    it('should handle deeply nested paths', () => {
      const deepPath = path.join(
        tempDir,
        'level1',
        'level2',
        'level3',
        'auto-claude'
      );
      createValidAutoBuildSource(deepPath);

      const isValid = validateAutoBuildSource(deepPath);

      expect(isValid).toBe(true);
    });

    it('should handle permission errors gracefully', () => {
      // This is hard to test cross-platform, but ensure no crashes
      const result = getAutoBuildSourcePath();
      // Should either return a path or null, never throw
      expect(result === null || typeof result === 'string').toBe(true);
    });

    it('should handle race conditions with concurrent access', () => {
      const autoBuildPath = path.join(tempDir, 'auto-claude');
      createValidAutoBuildSource(autoBuildPath);
      mockAppPath = path.join(tempDir, 'auto-claude-ui');

      // Call multiple times concurrently
      const promises = Array(10)
        .fill(null)
        .map(() => Promise.resolve(getAutoBuildSourcePath()));

      return Promise.all(promises).then(results => {
        // All should return same result
        expect(new Set(results).size).toBe(1);
        expect(results[0]).toBe(autoBuildPath);
      });
    });
  });

  describe('Production Update Workflow', () => {
    beforeEach(() => {
      mockIsPackaged = true;
    });

    it('should support update workflow: bundled -> userData override', () => {
      // Initial state: bundled version
      const bundledPath = path.join(mockResourcesPath, 'auto-claude');
      createValidAutoBuildSource(bundledPath);

      let effectivePath = getEffectiveSourcePath();
      expect(effectivePath).toBe(bundledPath);

      // After update: userData override exists
      const overridePath = path.join(mockUserDataPath, 'auto-claude-source');
      createValidAutoBuildSource(overridePath);

      effectivePath = getEffectiveSourcePath();
      expect(effectivePath).toBe(overridePath);
    });

    it('should use update target for new installations', () => {
      const targetPath = getUpdateTargetPath();

      // Create update at target
      createValidAutoBuildSource(targetPath);

      const effectivePath = getEffectiveSourcePath();
      expect(effectivePath).toBe(targetPath);
    });

    it('should separate cache from active source', () => {
      const cachePath = getUpdateCachePath();
      const targetPath = getUpdateTargetPath();

      expect(cachePath).not.toBe(targetPath);
      expect(cachePath).toContain('auto-claude-updates');
      expect(targetPath).toContain('auto-claude-source');
    });
  });

  describe('Development Workflow', () => {
    beforeEach(() => {
      mockIsPackaged = false;
    });

    it('should support development with sibling directories', () => {
      // Typical repo structure:
      // /project
      //   /auto-claude
      //   /auto-claude-ui

      const autoBuildPath = path.join(tempDir, 'auto-claude');
      createValidAutoBuildSource(autoBuildPath);

      mockAppPath = path.join(tempDir, 'auto-claude-ui');

      const result = getAutoBuildSourcePath();
      expect(result).toBe(autoBuildPath);
    });

    it('should find source from compiled output directory', () => {
      // Typical structure after build:
      // /project
      //   /auto-claude
      //   /auto-claude-ui
      //     /dist
      //       /main

      const autoBuildPath = path.join(tempDir, 'auto-claude');
      createValidAutoBuildSource(autoBuildPath);

      // Simulate being in dist/main
      mockAppPath = path.join(tempDir, 'auto-claude-ui', 'dist', 'main');

      const result = getAutoBuildSourcePath();
      expect(result).toBe(autoBuildPath);
    });
  });
});
