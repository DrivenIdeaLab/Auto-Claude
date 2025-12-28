/**
 * Task detail hooks
 * Centralized exports for all task detail state management hooks
 */

export { useTaskDetail } from './useTaskDetail';
export type { UseTaskDetailOptions } from './useTaskDetail';

export { useLoadingState } from './useLoadingState';
export type { UseLoadingStateReturn } from './useLoadingState';

export { useWorktreeState } from './useWorktreeState';
export type { UseWorktreeStateReturn, UseWorktreeStateOptions } from './useWorktreeState';

export { usePreviewState } from './usePreviewState';
export type { UsePreviewStateReturn, UsePreviewStateOptions } from './usePreviewState';

export { useLogsState } from './useLogsState';
export type { UseLogsStateReturn, UseLogsStateOptions } from './useLogsState';

export { useDialogState } from './useDialogState';
export type { UseDialogStateReturn } from './useDialogState';

export { useScheduledRestartState } from './useScheduledRestartState';
export type { UseScheduledRestartStateReturn, UseScheduledRestartStateOptions } from './useScheduledRestartState';

export type {
  LoadingState,
  WorktreeState,
  PreviewState,
  LogsState,
  DialogState,
  ScheduledRestartState,
  ExecutionState,
} from './types';
