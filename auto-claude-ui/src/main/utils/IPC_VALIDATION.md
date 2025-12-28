# IPC Input Validation

## Overview

This document describes the IPC input validation system added to prevent cryptic errors from invalid input parameters.

## Validation Functions

All validation functions are located in `auto-claude-ui/src/main/utils/ipc-validation.ts`.

### Core Validators

- **`validateProjectId(id: unknown): string`** - Validates project IDs (non-empty strings)
- **`validateTaskId(id: unknown): string`** - Validates task/spec IDs (non-empty strings)
- **`validateSpecId(id: unknown): string`** - Validates spec IDs (non-empty strings)
- **`validatePath(path: unknown, options?): string`** - Validates file paths
- **`validateEnum(value: unknown, allowed: string[], fieldName?): string`** - Validates enum values
- **`validateOptionalString(value: unknown, fieldName): string | undefined`** - Validates optional strings
- **`validateBoolean(value: unknown, fieldName): boolean`** - Validates booleans
- **`validateOptionalBoolean(value: unknown, fieldName): boolean | undefined`** - Validates optional booleans
- **`validateNumber(value: unknown, fieldName, options?): number`** - Validates numbers with constraints
- **`validateArray(value: unknown, fieldName, options?): T[]`** - Validates arrays

### Helper Functions

- **`withValidation(handler: Function): Function`** - Wraps IPC handlers to catch `ValidationError` and return user-friendly error responses

### Custom Error

- **`ValidationError`** - Custom error class for validation failures

## Usage Patterns

### Pattern 1: Using `withValidation` wrapper (for `ipcMain.handle`)

```typescript
ipcMain.handle(
  IPC_CHANNELS.TASK_DELETE,
  withValidation(async (_, taskId: unknown): Promise<IPCResult> => {
    const validTaskId = validateTaskId(taskId);
    // ... handler logic
  })
);
```

### Pattern 2: Manual validation (for `ipcMain.on`)

```typescript
ipcMain.on(IPC_CHANNELS.TASK_STOP, (_, taskId: unknown) => {
  try {
    const validTaskId = validateTaskId(taskId);
    // ... handler logic
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Invalid task ID';
    console.error('[TASK_STOP] Validation error:', errorMsg);
    // Send error to renderer if needed
  }
});
```

## Files Updated

### Completed

1. **`auto-claude-ui/src/main/ipc-handlers/task/crud-handlers.ts`**
   - `TASK_LIST`: Added `validateProjectId`
   - `TASK_CREATE`: Added validation for `projectId`, `title`, `description`
   - `TASK_DELETE`: Added `validateTaskId`
   - `TASK_UPDATE`: Added validation for `taskId`, `title`, `description`

2. **`auto-claude-ui/src/main/ipc-handlers/task/execution-handlers.ts`**
   - `TASK_START`: Added `validateTaskId`
   - `TASK_STOP`: Added `validateTaskId`
   - `TASK_REVIEW`: Added validation for `taskId`, `approved`, `feedback`

### Remaining Handlers (To Be Updated)

The following handlers still need validation added:

#### Task Execution Handlers
- `TASK_UPDATE_STATUS` - Validate `taskId`, `status`
- `TASK_CHECK_RUNNING` - Validate `taskId`
- `TASK_RECOVER_STUCK` - Validate `taskId`, `options`
- `task:get-scheduled-restart` - Validate `taskId`
- `task:cancel-scheduled-restart` - Validate `taskId`
- `task:run-scheduled-now` - Validate `taskId`

#### Worktree Handlers
- `TASK_WORKTREE_STATUS` - Validate `taskId`
- `TASK_WORKTREE_DIFF` - Validate `taskId`
- `TASK_WORKTREE_MERGE` - Validate `taskId`, `options`
- `TASK_WORKTREE_MERGE_PREVIEW` - Validate `taskId`
- `TASK_WORKTREE_DISCARD` - Validate `taskId`
- `TASK_LIST_WORKTREES` - Validate `projectId`

#### Other Handlers
- Project handlers - Validate `projectId`, `projectPath`
- GitHub handlers - Validate repository names, issue numbers
- Linear handlers - Validate issue IDs
- Insights handlers - Validate project IDs, insight parameters

## Error Messages

All validation errors return user-friendly messages:

- **Invalid project ID**: "Invalid project ID: must be a non-empty string"
- **Invalid task ID**: "Invalid task ID: must be a non-empty string"
- **Invalid enum**: "Invalid status: must be one of [backlog, in_progress, done], received 'invalid'"
- **Invalid type**: "Invalid approved: must be a boolean, received number"

## Testing

Tests are located in `auto-claude-ui/src/main/utils/__tests__/ipc-validation.test.ts`.

Run tests with:
```bash
npm test -- ipc-validation.test.ts
```

## Benefits

1. **User-Friendly Errors**: Instead of cryptic errors like "Cannot read property 'length' of undefined", users see "Invalid task ID: must be a non-empty string"

2. **Type Safety**: Validation functions provide runtime type checking that complements TypeScript's compile-time checks

3. **Centralized Logic**: All validation logic is in one place, making it easy to update and maintain

4. **Consistent Error Handling**: The `withValidation` wrapper ensures consistent error response format across all handlers

## Migration Guide

To add validation to an existing IPC handler:

1. Import validation functions:
   ```typescript
   import { validateTaskId, withValidation } from '../../utils';
   ```

2. For `ipcMain.handle` handlers, wrap with `withValidation`:
   ```typescript
   ipcMain.handle(
     IPC_CHANNELS.HANDLER_NAME,
     withValidation(async (_, param: unknown) => {
       const validParam = validateTaskId(param);
       // ... rest of handler
     })
   );
   ```

3. For `ipcMain.on` handlers, use try-catch:
   ```typescript
   ipcMain.on(IPC_CHANNELS.HANDLER_NAME, (_, param: unknown) => {
     try {
       const validParam = validateTaskId(param);
       // ... rest of handler
     } catch (error) {
       console.error('Validation error:', error);
       // Handle error appropriately
     }
   });
   ```

4. Update parameter types from specific types to `unknown`

5. Replace all uses of the original parameter with the validated version

## Future Enhancements

Potential improvements:

1. **Schema Validation**: Use a library like Zod or Yup for complex object validation
2. **Custom Validators**: Add domain-specific validators (e.g., `validateGitBranch`, `validateGitHubRepo`)
3. **Async Validation**: Support validators that need to check against databases or filesystems
4. **Validation Middleware**: Create a middleware system for automatic validation based on handler metadata
