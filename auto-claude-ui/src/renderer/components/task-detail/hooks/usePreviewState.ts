/**
 * Custom hook for managing merge preview state
 * Handles conflict detection and merge preview data
 */

import { useState, useCallback, useEffect } from 'react';
import type { PreviewState } from './types';
import type { MergeConflict, MergeStats, GitConflictInfo } from '../../../../shared/types';

export interface UsePreviewStateReturn extends PreviewState {
  setMergePreview: (preview: PreviewState['mergePreview']) => void;
  loadMergePreview: () => Promise<void>;
  clearMergePreview: () => void;
}

export interface UsePreviewStateOptions {
  taskId: string;
  needsReview: boolean;
  worktreeExists: boolean;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
}

const INITIAL_STATE: PreviewState = {
  mergePreview: null,
} as const;

export function usePreviewState({
  taskId,
  needsReview,
  worktreeExists,
  onLoadStart,
  onLoadEnd,
}: UsePreviewStateOptions): UsePreviewStateReturn {
  const [state, setState] = useState<PreviewState>(INITIAL_STATE);

  const setMergePreview = useCallback((preview: PreviewState['mergePreview']) => {
    setState({ mergePreview: preview });
    if (preview) {
      // Persist to sessionStorage to survive HMR reloads
      sessionStorage.setItem(`mergePreview-${taskId}`, JSON.stringify(preview));
    }
  }, [taskId]);

  const clearMergePreview = useCallback(() => {
    setState(INITIAL_STATE);
    sessionStorage.removeItem(`mergePreview-${taskId}`);
  }, [taskId]);

  // Load merge preview (conflict detection)
  const loadMergePreview = useCallback(async () => {
    console.warn('%c[usePreviewState] loadMergePreview called for task:', 'color: cyan; font-weight: bold;', taskId);
    onLoadStart?.();
    try {
      console.warn('[usePreviewState] Calling mergeWorktreePreview...');
      const result = await window.electronAPI.mergeWorktreePreview(taskId);
      console.warn('%c[usePreviewState] mergeWorktreePreview result:', 'color: lime; font-weight: bold;', JSON.stringify(result, null, 2));
      if (result.success && result.data?.preview) {
        const previewData = result.data.preview;
        console.warn('%c[usePreviewState] Setting merge preview:', 'color: lime; font-weight: bold;', previewData);
        console.warn('  - files:', previewData.files);
        console.warn('  - conflicts:', previewData.conflicts);
        console.warn('  - summary:', previewData.summary);
        setMergePreview(previewData);
      } else {
        console.warn('%c[usePreviewState] Preview not successful or no preview data:', 'color: orange;', result);
        console.warn('  - success:', result.success);
        console.warn('  - data:', result.data);
        console.warn('  - error:', result.error);
      }
    } catch (err) {
      console.error('%c[usePreviewState] Failed to load merge preview:', 'color: red; font-weight: bold;', err);
    } finally {
      console.warn('[usePreviewState] Load complete');
      onLoadEnd?.();
    }
  }, [taskId, onLoadStart, onLoadEnd, setMergePreview]);

  // Restore merge preview from sessionStorage on mount (survives HMR reloads)
  useEffect(() => {
    const storageKey = `mergePreview-${taskId}`;
    const stored = sessionStorage.getItem(storageKey);
    if (stored) {
      try {
        const previewData = JSON.parse(stored);
        console.warn('%c[usePreviewState] Restored merge preview from sessionStorage:', 'color: magenta;', previewData);
        setState({ mergePreview: previewData });
      } catch {
        console.warn('[usePreviewState] Failed to parse stored merge preview');
        sessionStorage.removeItem(storageKey);
      }
    }
  }, [taskId]);

  // Auto-load merge preview when worktree is ready
  useEffect(() => {
    // Only auto-load if:
    // 1. Task needs review
    // 2. Worktree exists
    // 3. We haven't already loaded the preview
    if (needsReview && worktreeExists && !state.mergePreview) {
      console.warn('[usePreviewState] Auto-loading merge preview for task:', taskId);
      loadMergePreview();
    }
  }, [needsReview, worktreeExists, state.mergePreview, taskId, loadMergePreview]);

  return {
    ...state,
    setMergePreview,
    loadMergePreview,
    clearMergePreview,
  };
}
