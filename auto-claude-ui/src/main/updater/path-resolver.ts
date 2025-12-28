/**
 * Path resolution utilities for Auto Claude updater
 *
 * DEPRECATED: This file is maintained for backwards compatibility only.
 * New code should use '../utils/path-resolver.ts' instead.
 */

import {
  getAutoBuildSourcePath,
  getUpdateCachePath as utilGetUpdateCachePath,
  getEffectiveSourcePath as utilGetEffectiveSourcePath,
  getUpdateTargetPath as utilGetUpdateTargetPath
} from '../utils/path-resolver';

/**
 * Get the path to the bundled auto-claude source
 * @deprecated Use getAutoBuildSourcePath from '../utils/path-resolver' instead
 */
export function getBundledSourcePath(): string | null {
  return getAutoBuildSourcePath();
}

/**
 * Get the path for storing downloaded updates
 * @deprecated Use getUpdateCachePath from '../utils/path-resolver' instead
 */
export function getUpdateCachePath(): string {
  return utilGetUpdateCachePath();
}

/**
 * Get the effective source path (considers override from updates)
 * @deprecated Use getEffectiveSourcePath from '../utils/path-resolver' instead
 */
export function getEffectiveSourcePath(): string | null {
  return utilGetEffectiveSourcePath();
}

/**
 * Get the path where updates should be installed
 * @deprecated Use getUpdateTargetPath from '../utils/path-resolver' instead
 */
export function getUpdateTargetPath(): string {
  return utilGetUpdateTargetPath();
}
