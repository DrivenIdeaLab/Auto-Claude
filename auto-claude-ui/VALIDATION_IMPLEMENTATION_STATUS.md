# IPC Validation Implementation Status

## Summary

IPC input validation has been added to prevent cryptic errors from invalid input. This document tracks the implementation status across all IPC handlers.

## Core Implementation

### Validation Utility (`auto-claude-ui/src/main/utils/ipc-validation.ts`)
- ✅ **COMPLETED** - Full validation utility module with comprehensive validators
- ✅ **TESTED** - Unit tests in `__tests__/ipc-validation.test.ts`
- ✅ **EXPORTED** - Exported from `utils/index.ts`
- ✅ **DOCUMENTED** - Documentation in `IPC_VALIDATION.md`

## Handler Updates

### Task CRUD Handlers (`task/crud-handlers.ts`)
✅ **COMPLETED** - All handlers validated

- ✅ `TASK_LIST` - Validates `projectId`
- ✅ `TASK_CREATE` - Validates `projectId`, `title`, `description`
- ✅ `TASK_DELETE` - Validates `taskId`
- ✅ `TASK_UPDATE` - Validates `taskId`, `title`, `description`

### Task Execution Handlers (`task/execution-handlers.ts`)
🟡 **PARTIAL** - Core handlers validated, some need completion

#### Completed
- ✅ `TASK_START` - Validates `taskId` (manual validation with try-catch)
- ✅ `TASK_STOP` - Validates `taskId` (manual validation with try-catch)
- ✅ `TASK_REVIEW` - Validates `taskId`, `approved`, `feedback`
- 🟡 `TASK_UPDATE_STATUS` - Started validation for `taskId`, `status` (needs completion)

#### Remaining
- ⏳ `TASK_CHECK_RUNNING` - Need to add `validateTaskId`
- ⏳ `TASK_RECOVER_STUCK` - Need to add validation for `taskId`, `options.targetStatus`, `options.autoRestart`
- ⏳ `task:get-scheduled-restart` - Need to add `validateTaskId`
- ⏳ `task:cancel-scheduled-restart` - Need to add `validateTaskId`
- ⏳ `task:run-scheduled-now` - Need to add `validateTaskId`

### Worktree Handlers (`task/worktree-handlers.ts`)
⏳ **NOT STARTED** - All handlers need validation

- ⏳ `TASK_WORKTREE_STATUS` - Need `validateTaskId`
- ⏳ `TASK_WORKTREE_DIFF` - Need `validateTaskId`
- ⏳ `TASK_WORKTREE_MERGE` - Need `validateTaskId`, `validateOptionalBoolean` for `options.noCommit`
- ⏳ `TASK_WORKTREE_MERGE_PREVIEW` - Need `validateTaskId`
- ⏳ `TASK_WORKTREE_DISCARD` - Need `validateTaskId`
- ⏳ `TASK_LIST_WORKTREES` - Need `validateProjectId`

### Other Handlers
⏳ **NOT STARTED** - Systematic review needed

- ⏳ Project handlers
- ⏳ GitHub handlers
- ⏳ Linear handlers
- ⏳ Insights handlers
- ⏳ Approval handlers
- ⏳ Context handlers

## Implementation Guidelines

### For `ipcMain.handle` Handlers

```typescript
import { validateTaskId, withValidation } from '../../utils';

ipcMain.handle(
  IPC_CHANNELS.HANDLER_NAME,
  withValidation(async (_, param: unknown): Promise<IPCResult> => {
    const validParam = validateTaskId(param);
    // Use validParam throughout the handler
    // ...
  })
);
```

### For `ipcMain.on` Handlers

```typescript
import { validateTaskId } from '../../utils';

ipcMain.on(IPC_CHANNELS.HANDLER_NAME, (_, param: unknown) => {
  const mainWindow = getMainWindow();

  try {
    const validParam = validateTaskId(param);
    // Use validParam throughout the handler
    // ...
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Validation error';
    console.error('[HANDLER_NAME] Validation error:', errorMsg);
    if (mainWindow) {
      mainWindow.webContents.send(IPC_CHANNELS.ERROR, param, errorMsg);
    }
  }
});
```

## Next Steps

1. **Complete TASK_UPDATE_STATUS handler** - Replace all uses of `status` and `taskId` with validated versions
2. **Add validation to remaining execution handlers** - TASK_CHECK_RUNNING, TASK_RECOVER_STUCK, etc.
3. **Update worktree handlers** - All 6 handlers need validation
4. **Systematic review of all other IPC handlers** - Project, GitHub, Linear, Insights, etc.
5. **Integration testing** - Test with invalid inputs to verify error handling
6. **Documentation** - Update API documentation with validation requirements

## Benefits Achieved

- **User-Friendly Errors**: Clear error messages instead of cryptic runtime errors
- **Type Safety**: Runtime validation complements TypeScript's compile-time checks
- **Centralized Logic**: All validation in one maintainable module
- **Consistent Error Handling**: Uniform error response format
- **Testing**: Comprehensive unit tests for all validators

## Testing

Run validation tests:
```bash
cd auto-claude-ui
npm test -- ipc-validation.test.ts
```

Test coverage:
- ✅ All core validators
- ✅ ValidationError handling
- ✅ withValidation wrapper
- ✅ Edge cases (null, undefined, empty strings, etc.)

## Migration Checklist

For each handler:

- [ ] Import validation functions
- [ ] Change parameter types to `unknown`
- [ ] Add validation at start of handler
- [ ] Replace all uses of original parameter with validated version
- [ ] Wrap handler with `withValidation` (for `handle`) or add try-catch (for `on`)
- [ ] Test with invalid inputs
- [ ] Update any error messages to use validated names

## Known Issues

None currently - implementation is working as expected.

## Future Enhancements

1. **Schema Validation** - Use Zod or Yup for complex object validation
2. **Custom Validators** - Add domain-specific validators (git branches, GitHub repos, etc.)
3. **Async Validation** - Support validators that check databases or filesystems
4. **Validation Middleware** - Automatic validation based on handler metadata
5. **Error Aggregation** - Collect multiple validation errors instead of failing on first error
