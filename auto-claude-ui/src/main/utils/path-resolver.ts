/**
 * Centralized path resolution utilities for Auto Claude
 * Handles both development and production (packaged) environments
 */

import { existsSync } from 'fs';
import path from 'path';
import { app } from 'electron';

/**
 * Path resolution debug logging
 */
function logPathResolution(message: string): void {
  if (['true', '1', 'yes', 'on'].includes(process.env.DEBUG?.toLowerCase() ?? '')) {
    console.log(`[PathResolver] ${message}`);
  }
}

/**
 * Determine if we're running in a packaged production build
 */
export function isProduction(): boolean {
  return app.isPackaged;
}

/**
 * Get the path to the auto-claude Python source
 *
 * Resolution strategy:
 * - Production (ASAR): Look in resources directory, then userData override
 * - Development: Look relative to app path and process.cwd()
 *
 * @returns Path to auto-claude source, or null if not found
 */
export function getAutoBuildSourcePath(): string | null {
  logPathResolution(`Resolving auto-claude source path (isPackaged: ${app.isPackaged})`);

  if (app.isPackaged) {
    // Production build - check multiple locations
    const possiblePaths = [
      // User-installed updates override (highest priority)
      path.join(app.getPath('userData'), 'auto-claude-source'),
      // Bundled with application resources
      path.join(process.resourcesPath, 'auto-claude'),
      // ASAR unpacked location
      path.join(process.resourcesPath, 'app.asar.unpacked', 'auto-claude'),
      // Alternative resource location
      path.join(app.getAppPath(), 'auto-claude')
    ];

    for (const p of possiblePaths) {
      const reqPath = path.join(p, 'requirements.txt');
      const exists = existsSync(p) && existsSync(reqPath);

      logPathResolution(`Production - checking: ${p} (exists: ${exists})`);

      if (exists) {
        logPathResolution(`Production - resolved to: ${p}`);
        return p;
      }
    }

    console.error('[PathResolver] Failed to find auto-claude source in production build');
    console.error('[PathResolver] Searched paths:', possiblePaths);
    return null;
  }

  // Development mode - look relative to repo structure
  const possiblePaths = [
    // From auto-claude-ui/dist/main -> ../../../auto-claude (sibling directory)
    path.resolve(__dirname, '..', '..', '..', 'auto-claude'),
    // From app.getAppPath() (auto-claude-ui/) -> ../auto-claude
    path.resolve(app.getAppPath(), '..', 'auto-claude'),
    // From process.cwd() (usually repo root or auto-claude-ui/)
    path.resolve(process.cwd(), 'auto-claude'),
    path.resolve(process.cwd(), '..', 'auto-claude')
  ];

  for (const p of possiblePaths) {
    const reqPath = path.join(p, 'requirements.txt');
    const exists = existsSync(p) && existsSync(reqPath);

    logPathResolution(`Development - checking: ${p} (exists: ${exists})`);

    if (exists) {
      logPathResolution(`Development - resolved to: ${p}`);
      return p;
    }
  }

  console.warn('[PathResolver] Auto-claude source not found in development mode');
  console.warn('[PathResolver] Searched paths:', possiblePaths);
  return null;
}

/**
 * Get the path where auto-claude updates should be installed
 *
 * @returns Update installation path
 */
export function getUpdateTargetPath(): string {
  if (app.isPackaged) {
    // For packaged apps, store in userData as a source override
    // This allows updating without modifying the installed app bundle
    return path.join(app.getPath('userData'), 'auto-claude-source');
  } else {
    // In development, update the actual source directory
    return getAutoBuildSourcePath() || path.join(app.getAppPath(), '..', 'auto-claude');
  }
}

/**
 * Get the path for storing downloaded updates (cache)
 *
 * @returns Update cache path
 */
export function getUpdateCachePath(): string {
  return path.join(app.getPath('userData'), 'auto-claude-updates');
}

/**
 * Get the effective source path (considers update overrides)
 *
 * In production, checks for user-updated source before falling back to bundled version
 *
 * @returns Effective auto-claude source path
 */
export function getEffectiveSourcePath(): string | null {
  if (app.isPackaged) {
    // Check for user-updated source first (takes precedence over bundled)
    const overridePath = path.join(app.getPath('userData'), 'auto-claude-source');
    if (existsSync(overridePath) && existsSync(path.join(overridePath, 'requirements.txt'))) {
      logPathResolution(`Using update override: ${overridePath}`);
      return overridePath;
    }
  }

  // Fall back to standard resolution
  return getAutoBuildSourcePath();
}

/**
 * Validate that a path contains a valid auto-claude installation
 *
 * @param sourcePath - Path to validate
 * @returns True if path contains valid auto-claude source
 */
export function validateAutoBuildSource(sourcePath: string): boolean {
  if (!existsSync(sourcePath)) {
    return false;
  }

  // Check for key marker files
  const markers = [
    'requirements.txt',
    'run.py',
    'spec_runner.py'
  ];

  for (const marker of markers) {
    if (!existsSync(path.join(sourcePath, marker))) {
      logPathResolution(`Validation failed: missing ${marker} in ${sourcePath}`);
      return false;
    }
  }

  return true;
}

/**
 * Get paths for debugging/diagnostics
 *
 * @returns Object with all relevant path information
 */
export function getDiagnosticPaths(): Record<string, string> {
  return {
    isPackaged: String(app.isPackaged),
    appPath: app.getAppPath(),
    resourcesPath: process.resourcesPath || 'N/A',
    userData: app.getPath('userData'),
    cwd: process.cwd(),
    __dirname: __dirname,
    autoBuildSource: getAutoBuildSourcePath() || 'NOT FOUND',
    effectiveSource: getEffectiveSourcePath() || 'NOT FOUND',
    updateTarget: getUpdateTargetPath(),
    updateCache: getUpdateCachePath()
  };
}
