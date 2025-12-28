/**
 * Custom hook for managing worktree-related state
 * Handles worktree status, diff, and merge staging
 */

import { useState, useCallback, useEffect } from 'react';
import type { WorktreeState } from './types';
import type { WorktreeStatus, WorktreeDiff } from '../../../../shared/types';

export interface UseWorktreeStateReturn extends WorktreeState {
  setWorktreeStatus: (status: WorktreeStatus | null) => void;
  setWorktreeDiff: (diff: WorktreeDiff | null) => void;
  setWorkspaceError: (error: string | null) => void;
  setStageOnly: (stageOnly: boolean) => void;
  setStagedSuccess: (message: string | null) => void;
  setStagedProjectPath: (path: string | undefined) => void;
  setSuggestedCommitMessage: (message: string | undefined) => void;
  resetWorktreeState: () => void;
}

export interface UseWorktreeStateOptions {
  taskId: string;
  needsReview: boolean;
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
}

const INITIAL_STATE: WorktreeState = {
  worktreeStatus: null,
  worktreeDiff: null,
  workspaceError: null,
  stageOnly: false,
  stagedSuccess: null,
  stagedProjectPath: undefined,
  suggestedCommitMessage: undefined,
} as const;

export function useWorktreeState({
  taskId,
  needsReview,
  onLoadStart,
  onLoadEnd,
}: UseWorktreeStateOptions): UseWorktreeStateReturn {
  const [state, setState] = useState<WorktreeState>(INITIAL_STATE);

  const setWorktreeStatus = useCallback((status: WorktreeStatus | null) => {
    setState((prev) => ({ ...prev, worktreeStatus: status }));
  }, []);

  const setWorktreeDiff = useCallback((diff: WorktreeDiff | null) => {
    setState((prev) => ({ ...prev, worktreeDiff: diff }));
  }, []);

  const setWorkspaceError = useCallback((error: string | null) => {
    setState((prev) => ({ ...prev, workspaceError: error }));
  }, []);

  const setStageOnly = useCallback((stageOnly: boolean) => {
    setState((prev) => ({ ...prev, stageOnly }));
  }, []);

  const setStagedSuccess = useCallback((message: string | null) => {
    setState((prev) => ({ ...prev, stagedSuccess: message }));
  }, []);

  const setStagedProjectPath = useCallback((path: string | undefined) => {
    setState((prev) => ({ ...prev, stagedProjectPath: path }));
  }, []);

  const setSuggestedCommitMessage = useCallback((message: string | undefined) => {
    setState((prev) => ({ ...prev, suggestedCommitMessage: message }));
  }, []);

  const resetWorktreeState = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  // Load worktree status when task is in human_review
  useEffect(() => {
    if (needsReview) {
      onLoadStart?.();
      setWorkspaceError(null);

      Promise.all([
        window.electronAPI.getWorktreeStatus(taskId),
        window.electronAPI.getWorktreeDiff(taskId)
      ])
        .then(([statusResult, diffResult]) => {
          if (statusResult.success && statusResult.data) {
            setWorktreeStatus(statusResult.data);
          }
          if (diffResult.success && diffResult.data) {
            setWorktreeDiff(diffResult.data);
          }
        })
        .catch((err) => {
          console.error('Failed to load worktree info:', err);
        })
        .finally(() => {
          onLoadEnd?.();
        });
    } else {
      setWorktreeStatus(null);
      setWorktreeDiff(null);
    }
  }, [taskId, needsReview, onLoadStart, onLoadEnd, setWorktreeStatus, setWorktreeDiff, setWorkspaceError]);

  return {
    ...state,
    setWorktreeStatus,
    setWorktreeDiff,
    setWorkspaceError,
    setStageOnly,
    setStagedSuccess,
    setStagedProjectPath,
    setSuggestedCommitMessage,
    resetWorktreeState,
  };
}
