/**
 * Type definitions for task detail state management
 */

import type {
  WorktreeStatus,
  WorktreeDiff,
  TaskLogs,
  TaskLogPhase,
  MergeConflict,
  MergeStats,
  GitConflictInfo
} from '../../../../shared/types';

/**
 * Loading states for async operations
 */
export interface LoadingState {
  readonly isLoadingWorktree: boolean;
  readonly isLoadingPreview: boolean;
  readonly isLoadingLogs: boolean;
  readonly isMerging: boolean;
  readonly isDiscarding: boolean;
  readonly isSubmitting: boolean;
  readonly isDeleting: boolean;
  readonly isRecovering: boolean;
}

/**
 * Worktree-related state
 */
export interface WorktreeState {
  readonly worktreeStatus: WorktreeStatus | null;
  readonly worktreeDiff: WorktreeDiff | null;
  readonly workspaceError: string | null;
  readonly stageOnly: boolean;
  readonly stagedSuccess: string | null;
  readonly stagedProjectPath: string | undefined;
  readonly suggestedCommitMessage: string | undefined;
}

/**
 * Merge preview state
 */
export interface PreviewState {
  readonly mergePreview: {
    readonly files: string[];
    readonly conflicts: MergeConflict[];
    readonly summary: MergeStats;
    readonly gitConflicts?: GitConflictInfo;
  } | null;
}

/**
 * Logs state
 */
export interface LogsState {
  readonly phaseLogs: TaskLogs | null;
  readonly expandedPhases: Set<TaskLogPhase>;
  readonly isUserScrolledUp: boolean;
}

/**
 * Dialog visibility state
 */
export interface DialogState {
  readonly showDeleteDialog: boolean;
  readonly showDiscardDialog: boolean;
  readonly showDiffDialog: boolean;
  readonly showConflictDialog: boolean;
  readonly isEditDialogOpen: boolean;
}

/**
 * Scheduled restart state
 */
export interface ScheduledRestartState {
  readonly scheduledRestart: {
    readonly scheduled: boolean;
    readonly fireAt?: string;
  } | null;
}

/**
 * Task execution state
 */
export interface ExecutionState {
  readonly isStuck: boolean;
  readonly hasCheckedRunning: boolean;
  readonly deleteError: string | null;
  readonly feedback: string;
  readonly activeTab: string;
}
