# Task Detail Hooks Refactoring

## Overview

The `useTaskDetail` hook has been refactored to reduce state complexity from **17 separate `useState` calls** to a composable architecture using **custom hooks** grouped by logical concern.

## Architecture

### Before (17 useState calls)
```typescript
const [feedback, setFeedback] = useState('');
const [isSubmitting, setIsSubmitting] = useState(false);
const [activeTab, setActiveTab] = useState('overview');
const [isUserScrolledUp, setIsUserScrolledUp] = useState(false);
const [isStuck, setIsStuck] = useState(false);
const [isRecovering, setIsRecovering] = useState(false);
// ... 11 more useState calls
```

### After (Composed hooks)
```typescript
const loadingState = useLoadingState();
const worktreeState = useWorktreeState({ taskId, needsReview });
const previewState = usePreviewState({ taskId, needsReview, worktreeExists });
const logsState = useLogsState({ projectId, specId, activeTab, taskLogs });
const dialogState = useDialogState();
const scheduledRestartState = useScheduledRestartState({ taskId, isRunning });
```

## Custom Hooks

### 1. `useLoadingState`
**Purpose**: Manages all async operation loading flags

**State**:
- `isLoadingWorktree` - Loading worktree status
- `isLoadingPreview` - Loading merge preview
- `isLoadingLogs` - Loading phase logs
- `isMerging` - Merging worktree
- `isDiscarding` - Discarding worktree
- `isSubmitting` - Submitting review
- `isDeleting` - Deleting task
- `isRecovering` - Recovering stuck task

**Methods**:
- Individual setters for each loading state
- `resetLoadingState()` - Reset all to false

### 2. `useWorktreeState`
**Purpose**: Manages worktree-related state and loading

**State**:
- `worktreeStatus` - Current worktree status
- `worktreeDiff` - Diff information
- `workspaceError` - Error messages
- `stageOnly` - Stage-only merge mode
- `stagedSuccess` - Stage success message
- `stagedProjectPath` - Path to staged project
- `suggestedCommitMessage` - AI-generated commit message

**Features**:
- Auto-loads worktree status when task needs review
- Calls `onLoadStart`/`onLoadEnd` callbacks for loading state integration

### 3. `usePreviewState`
**Purpose**: Manages merge preview and conflict detection

**State**:
- `mergePreview` - Preview data with files, conflicts, summary

**Features**:
- Auto-loads preview when worktree exists
- Persists to sessionStorage (survives HMR reloads)
- Auto-restore from sessionStorage on mount

**Methods**:
- `loadMergePreview()` - Manually trigger preview
- `setMergePreview()` - Update preview data
- `clearMergePreview()` - Clear preview and storage

### 4. `useLogsState`
**Purpose**: Manages phase logs, expansion state, and auto-scrolling

**State**:
- `phaseLogs` - Phase-based logs
- `expandedPhases` - Set of expanded phases
- `isUserScrolledUp` - User scroll position tracking

**Features**:
- Auto-loads and watches phase logs
- Auto-expands active phase
- Auto-scrolls to bottom (unless user scrolled up)
- Resets scroll state when switching to logs tab

**Methods**:
- `togglePhase()` - Toggle phase expansion
- `handleLogsScroll()` - Handle scroll events

**Refs**:
- `logsEndRef` - Ref for scroll target
- `logsContainerRef` - Ref for container

### 5. `useDialogState`
**Purpose**: Manages modal/dialog visibility state

**State**:
- `showDeleteDialog`
- `showDiscardDialog`
- `showDiffDialog`
- `showConflictDialog`
- `isEditDialogOpen`

**Methods**:
- Individual setters for each dialog
- `closeAllDialogs()` - Close all at once

### 6. `useScheduledRestartState`
**Purpose**: Manages scheduled restart polling and state

**State**:
- `scheduledRestart` - Scheduled restart info

**Features**:
- Auto-polls for restart status every 5 seconds when task is running
- Clears state when task stops

**Methods**:
- `setScheduledRestart()` - Update restart info
- `clearScheduledRestart()` - Clear restart

## Benefits

### 1. **Reduced Complexity**
- From 17 useState calls to 6 custom hooks
- Clear separation of concerns
- Easier to understand and maintain

### 2. **Better Code Organization**
- Related state grouped together
- Each hook has a single responsibility
- Easier to test individual concerns

### 3. **Type Safety**
- Comprehensive TypeScript types for each state group
- Type definitions in `types.ts`
- Proper return types for all hooks

### 4. **Reusability**
- Each hook can be used independently
- Can be reused in other components if needed
- Testable in isolation

### 5. **Performance**
- Uses `useCallback` for stable function references
- Proper dependency arrays
- Minimizes re-renders

### 6. **State Coordination**
- Hooks can communicate via callbacks (`onLoadStart`, `onLoadEnd`)
- Maintains proper loading state coordination
- Prevents race conditions

## Backward Compatibility

The refactored `useTaskDetail` exports the **exact same interface** as before:

```typescript
const state = useTaskDetail({ task });

// All original properties available via destructuring:
state.feedback
state.isLoadingWorktree
state.worktreeStatus
state.mergePreview
state.phaseLogs
state.showDeleteDialog
state.scheduledRestart
// ... etc
```

The component consuming `useTaskDetail` (`TaskDetailPanel.tsx`) requires **no changes**.

## File Structure

```
hooks/
├── index.ts                      # Centralized exports
├── types.ts                      # Type definitions
├── useTaskDetail.ts              # Main orchestrator hook
├── useLoadingState.ts            # Loading state hook
├── useWorktreeState.ts           # Worktree state hook
├── usePreviewState.ts            # Preview state hook
├── useLogsState.ts               # Logs state hook
├── useDialogState.ts             # Dialog state hook
├── useScheduledRestartState.ts   # Scheduled restart hook
└── README.md                     # This file
```

## Usage Example

```typescript
import { useTaskDetail } from './hooks/useTaskDetail';

function TaskDetailPanel({ task }: { task: Task }) {
  const state = useTaskDetail({ task });

  // Access any state as before
  const {
    isLoadingWorktree,
    worktreeStatus,
    mergePreview,
    loadMergePreview,
    phaseLogs,
    togglePhase,
    showDeleteDialog,
    setShowDeleteDialog,
    scheduledRestart
  } = state;

  // ... component logic
}
```

## Testing

Each hook can be tested independently:

```typescript
import { renderHook } from '@testing-library/react-hooks';
import { useLoadingState } from './useLoadingState';

test('useLoadingState manages loading flags', () => {
  const { result } = renderHook(() => useLoadingState());

  expect(result.current.isLoadingWorktree).toBe(false);

  act(() => {
    result.current.setIsLoadingWorktree(true);
  });

  expect(result.current.isLoadingWorktree).toBe(true);
});
```

## Migration Notes

- No changes required to `TaskDetailPanel.tsx`
- All existing functionality preserved
- Same API surface
- Enhanced type safety
- Better organization for future maintenance

## Future Enhancements

Possible future improvements:

1. **Zustand Store** - Convert some hooks to Zustand stores for global state
2. **State Persistence** - Add persistence for user preferences (expanded phases, active tab)
3. **Undo/Redo** - Add state history for complex operations
4. **Optimistic Updates** - Add optimistic UI updates for better UX
5. **State Machines** - Use XState for complex state transitions (merge workflows)
