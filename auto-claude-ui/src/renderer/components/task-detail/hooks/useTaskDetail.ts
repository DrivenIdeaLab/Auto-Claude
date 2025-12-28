/**
 * Main task detail hook
 * Orchestrates all sub-hooks for task detail state management
 */

import { useState, useEffect, useCallback } from 'react';
import { useProjectStore } from '../../../stores/project-store';
import { checkTaskRunning, isIncompleteHumanReview, getTaskProgress } from '../../../stores/task-store';
import { useLoadingState } from './useLoadingState';
import { useWorktreeState } from './useWorktreeState';
import { usePreviewState } from './usePreviewState';
import { useLogsState } from './useLogsState';
import { useDialogState } from './useDialogState';
import { useScheduledRestartState } from './useScheduledRestartState';
import type { Task } from '../../../../shared/types';

export interface UseTaskDetailOptions {
  task: Task;
}

export function useTaskDetail({ task }: UseTaskDetailOptions) {
  // Simple state (not grouped into hooks)
  const [feedback, setFeedback] = useState('');
  const [activeTab, setActiveTab] = useState('overview');
  const [isStuck, setIsStuck] = useState(false);
  const [hasCheckedRunning, setHasCheckedRunning] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Derived state
  const selectedProject = useProjectStore((state) => state.getSelectedProject());
  const isRunning = task.status === 'in_progress' || task.status === 'ai_review';
  const needsReview = task.status === 'human_review';
  const executionPhase = task.executionProgress?.phase;
  const hasActiveExecution = executionPhase && executionPhase !== 'idle' && executionPhase !== 'complete' && executionPhase !== 'failed';
  const isIncomplete = isIncompleteHumanReview(task);
  const taskProgress = getTaskProgress(task);

  // Custom hooks for grouped state
  const loadingState = useLoadingState();

  const worktreeState = useWorktreeState({
    taskId: task.id,
    needsReview,
    onLoadStart: () => loadingState.setIsLoadingWorktree(true),
    onLoadEnd: () => loadingState.setIsLoadingWorktree(false),
  });

  const previewState = usePreviewState({
    taskId: task.id,
    needsReview,
    worktreeExists: worktreeState.worktreeStatus?.exists ?? false,
    onLoadStart: () => loadingState.setIsLoadingPreview(true),
    onLoadEnd: () => loadingState.setIsLoadingPreview(false),
  });

  const logsState = useLogsState({
    projectId: selectedProject?.id ?? '',
    specId: task.specId,
    activeTab,
    taskLogs: task.logs,
    onLoadStart: () => loadingState.setIsLoadingLogs(true),
    onLoadEnd: () => loadingState.setIsLoadingLogs(false),
  });

  const dialogState = useDialogState();

  const scheduledRestartState = useScheduledRestartState({
    taskId: task.id,
    isRunning,
  });

  // Check if task is stuck (status says in_progress but no actual process)
  // Add a grace period to avoid false positives during process spawn
  useEffect(() => {
    let timeoutId: NodeJS.Timeout | undefined;

    if (isRunning && !hasCheckedRunning) {
      // Wait 2 seconds before checking - gives process time to spawn and register
      timeoutId = setTimeout(() => {
        checkTaskRunning(task.id).then((actuallyRunning) => {
          setIsStuck(!actuallyRunning);
          setHasCheckedRunning(true);
        });
      }, 2000);
    } else if (!isRunning) {
      setIsStuck(false);
      setHasCheckedRunning(false);
    }

    return () => {
      if (timeoutId) clearTimeout(timeoutId);
    };
  }, [task.id, isRunning, hasCheckedRunning]);

  return {
    // Simple state
    feedback,
    activeTab,
    isStuck,
    hasCheckedRunning,
    deleteError,
    selectedProject,
    isRunning,
    needsReview,
    executionPhase,
    hasActiveExecution,
    isIncomplete,
    taskProgress,

    // Loading state
    ...loadingState,

    // Worktree state
    ...worktreeState,

    // Preview state
    ...previewState,

    // Logs state
    ...logsState,

    // Dialog state
    ...dialogState,

    // Scheduled restart state
    ...scheduledRestartState,

    // Simple state setters
    setFeedback,
    setActiveTab,
    setIsStuck,
    setHasCheckedRunning,
    setDeleteError,
  };
}
