# Utils Directory

Utility modules for Auto Claude UI main process.

## Table of Contents

- [IPC Validation](#ipc-validation) - Input validation for IPC handlers
- [ProcessManager](#processmanager) - Centralized process management with timeout protection
- [Path Resolver](#path-resolver) - Auto-claude source path resolution

## IPC Validation (`ipc-validation.ts`)

Comprehensive input validation system for IPC handlers to prevent cryptic errors from invalid parameters.

### Quick Start

```typescript
import { validateTaskId, validateProjectId, withValidation } from '../utils';

// For ipcMain.handle handlers - use withValidation wrapper
ipcMain.handle(
  IPC_CHANNELS.TASK_DELETE,
  withValidation(async (_, taskId: unknown): Promise<IPCResult> => {
    const validTaskId = validateTaskId(taskId);
    // ValidationError automatically converted to { success: false, error: "message" }
  })
);

// For ipcMain.on handlers - use try-catch
ipcMain.on(IPC_CHANNELS.TASK_STOP, (_, taskId: unknown) => {
  try {
    const validTaskId = validateTaskId(taskId);
    // Use validTaskId throughout handler
  } catch (error) {
    console.error('Validation error:', error);
  }
});
```

### Validators

#### Core ID Validators
- `validateProjectId(id)` - Non-empty string project IDs
- `validateTaskId(id)` - Non-empty string task/spec IDs
- `validateSpecId(id)` - Non-empty string spec IDs

#### Type Validators
- `validateBoolean(value, fieldName)` - Boolean values
- `validateOptionalBoolean(value, fieldName)` - Optional booleans
- `validateNumber(value, fieldName, options)` - Numbers with constraints
- `validateOptionalString(value, fieldName)` - Optional strings
- `validatePath(path, options)` - File paths
- `validateEnum(value, allowed, fieldName)` - Enum values
- `validateArray(value, fieldName, options)` - Arrays with element validation

#### Helper Functions
- `withValidation(handler)` - Wraps handlers to catch ValidationError
- `ValidationError` - Custom error class

### Error Messages

User-friendly messages instead of cryptic runtime errors:

**Before:**
```
TypeError: Cannot read property 'length' of undefined
```

**After:**
```
Invalid project ID: must be a non-empty string
```

### Examples

```typescript
// Validate project ID
const projectId = validateProjectId(input);
// Throws: "Invalid project ID: must be a non-empty string"

// Validate status enum
const status = validateEnum(input, ['backlog', 'in_progress', 'done'], 'status');
// Throws: "Invalid status: must be one of [backlog, in_progress, done], received 'invalid'"

// Validate number with constraints
const workers = validateNumber(input, 'workers', { min: 1, max: 10, integer: true });
// Throws: "Invalid workers: must be at least 1, received 0"

// Validate array
const tags = validateArray(input, 'tags', {
  minLength: 1,
  validator: (item) => validateNonEmptyString(item, 'tag')
});
// Throws: "Invalid tags: must have at least 1 items, received 0"
```

### Testing

```bash
npm test ipc-validation
```

34 tests covering all validators, edge cases, and error handling.

### Documentation

See [IPC_VALIDATION.md](./IPC_VALIDATION.md) for comprehensive documentation.

---

## Path Resolver (`path-resolver.ts`)

Centralized path resolution for auto-claude Python source in both development and production environments.

### Usage

```typescript
import { getEffectiveSourcePath, validateAutoBuildSource } from './utils/path-resolver';

// Get the auto-claude source path
const sourcePath = getEffectiveSourcePath();

if (sourcePath && validateAutoBuildSource(sourcePath)) {
  // Use the source path
}
```

### Path Resolution Flow

```
┌─────────────────────────────────────┐
│   getEffectiveSourcePath()          │
└──────────────┬──────────────────────┘
               │
               ▼
       ┌───────────────┐
       │ Is Packaged?  │
       └───┬───────┬───┘
           │       │
     Yes ──┘       └── No
       │               │
       ▼               ▼
┌──────────────┐  ┌──────────────────┐
│ PRODUCTION   │  │ DEVELOPMENT      │
└──────┬───────┘  └────────┬─────────┘
       │                   │
       ▼                   ▼
   ┌────────────────┐  ┌──────────────────────┐
   │ 1. userData/   │  │ 1. __dirname/../../  │
   │    auto-claude-│  │    auto-claude       │
   │    source      │  ├──────────────────────┤
   ├────────────────┤  │ 2. getAppPath()/../  │
   │ 2. resources/  │  │    auto-claude       │
   │    auto-claude │  ├──────────────────────┤
   ├────────────────┤  │ 3. cwd()/auto-claude │
   │ 3. app.asar.   │  ├──────────────────────┤
   │    unpacked/   │  │ 4. cwd()/../         │
   │    auto-claude │  │    auto-claude       │
   └────────────────┘  └──────────────────────┘
```

### Functions

#### `getAutoBuildSourcePath(): string | null`
Get the path to auto-claude Python source.

**Returns**: Path to auto-claude source, or null if not found

#### `getEffectiveSourcePath(): string | null`
Get the effective source path, considering update overrides.

In production, checks for user-updated source before falling back to bundled version.

**Returns**: Effective auto-claude source path

#### `getUpdateTargetPath(): string`
Get the path where auto-claude updates should be installed.

**Returns**: Update installation path

#### `getUpdateCachePath(): string`
Get the path for storing downloaded updates.

**Returns**: Update cache path

#### `validateAutoBuildSource(sourcePath: string): boolean`
Validate that a path contains a valid auto-claude installation.

**Parameters**:
- `sourcePath` - Path to validate

**Returns**: True if path contains valid auto-claude source

#### `getDiagnosticPaths(): Record<string, string>`
Get all path information for debugging.

**Returns**: Object with diagnostic path information

#### `isProduction(): boolean`
Determine if running in packaged production build.

**Returns**: True if app is packaged

### Debug Mode

Enable debug logging with environment variable:

```bash
DEBUG=true npm run dev
```

### Migration from Old Code

**Before**:
```typescript
const possiblePaths = [
  path.resolve(__dirname, '..', '..', '..', 'auto-claude'),
  path.resolve(app.getAppPath(), '..', 'auto-claude'),
  path.resolve(process.cwd(), 'auto-claude')
];

for (const p of possiblePaths) {
  if (existsSync(p) && existsSync(path.join(p, 'requirements.txt'))) {
    return p;
  }
}
```

**After**:
```typescript
import { getEffectiveSourcePath } from '../utils/path-resolver';

const sourcePath = getEffectiveSourcePath();
```

### Production Considerations

1. **Bundle Python Source**: Ensure `auto-claude/` is included in resources directory during packaging
2. **Update Overrides**: User updates install to `userData/auto-claude-source` (takes precedence over bundled)
3. **ASAR Unpacking**: If needed, configure `app.asar.unpacked/auto-claude` in electron-builder
4. **Validation**: Always validate paths with `validateAutoBuildSource()` before use

### Troubleshooting

If path detection fails:

1. **Check bundling**: Verify auto-claude is packaged in resources
2. **Enable debug mode**: Set `DEBUG=true` to see detailed path checking
3. **Get diagnostics**: Call `getDiagnosticPaths()` to see all path information
4. **Manual override**: Configure path in settings UI

### Example: Full Usage Pattern

```typescript
import {
  getEffectiveSourcePath,
  validateAutoBuildSource,
  getDiagnosticPaths
} from '../utils/path-resolver';

class MyService {
  private sourcePath: string | null = null;

  async initialize(): Promise<boolean> {
    // Detect source path
    this.sourcePath = getEffectiveSourcePath();

    if (!this.sourcePath) {
      console.error('[MyService] Failed to detect auto-claude source');
      console.error('[MyService] Diagnostics:', getDiagnosticPaths());
      return false;
    }

    // Validate it contains required files
    if (!validateAutoBuildSource(this.sourcePath)) {
      console.error('[MyService] Invalid auto-claude source:', this.sourcePath);
      return false;
    }

    console.log('[MyService] Using auto-claude source:', this.sourcePath);
    return true;
  }
}
```

---

## ProcessManager

Centralized process manager for Python subprocess calls with timeout protection and proper cleanup.

### Features

- **Configurable Timeouts**: Automatically kill processes that exceed their timeout
- **Process Tracking**: Track all spawned processes by unique IDs
- **App Exit Cleanup**: Automatically kills all processes on app shutdown
- **Graceful Termination**: Handles SIGTERM/SIGINT with cleanup
- **Event Emission**: Stream stdout/stderr via EventEmitter
- **Debug Logging**: Optional debug output for troubleshooting

### Basic Usage

```typescript
import { getProcessManager } from '../utils/process-manager';

const processManager = getProcessManager();

// Execute a process with timeout
const result = await processManager.execute({
  id: 'unique-process-id',
  command: 'python',
  args: ['script.py', '--arg', 'value'],
  spawnOptions: {
    cwd: '/path/to/working/dir',
    env: { ...process.env }
  },
  timeout: 5 * 60 * 1000, // 5 minutes
  description: 'Python script execution'
});

console.log('Exit code:', result.exitCode);
console.log('Output:', result.stdout);
console.log('Duration:', result.duration);
```

### Listening to Events

```typescript
processManager.on('stdout', (id: string, data: string) => {
  console.log(`Process ${id} stdout:`, data);
});

processManager.on('stderr', (id: string, data: string) => {
  console.error(`Process ${id} stderr:`, data);
});
```

### Process Lifecycle Management

```typescript
// Check if a process is running
if (processManager.isRunning('my-process')) {
  console.log('Process is still running');
}

// Get process info
const info = processManager.getProcessInfo('my-process');
console.log('Uptime:', info?.uptime);

// Kill a specific process
processManager.kill('my-process');

// Kill all processes (called automatically on app exit)
processManager.killAll();
```

### Timeout Behavior

When a process exceeds its timeout:

1. Process receives SIGTERM
2. ProcessManager waits 5 seconds for graceful shutdown
3. If still running, process receives SIGKILL (force kill)
4. Promise rejects with timeout error

### Error Handling

```typescript
try {
  const result = await processManager.execute({
    id: 'my-process',
    command: 'python',
    args: ['script.py'],
    timeout: 60000 // 1 minute
  });
  // Handle success
} catch (err) {
  if (err.message.includes('timed out')) {
    // Handle timeout
  } else {
    // Handle other errors (spawn failure, non-zero exit code, etc.)
  }
}
```

### Default Timeouts by Operation

| Operation | Timeout | Rationale |
|-----------|---------|-----------|
| Insights query | 5 minutes | AI processing can be slow for large codebases |
| Changelog generation | 2 minutes | Typically quick with Claude Haiku |
| Version suggestion | 1 minute | Simple AI analysis |
| Project analyzer | 2 minutes | File scanning and indexing |

### Integration Examples

#### Insights Executor

```typescript
// insights-executor.ts
const processManager = getProcessManager();

await processManager.execute({
  id: `insights-${projectId}`,
  command: pythonPath,
  args: [runnerPath, '--project-dir', projectPath],
  timeout: 5 * 60 * 1000, // 5 minutes
  description: `Insights query for project ${projectId}`
});
```

#### Changelog Generator

```typescript
// generator.ts
const processManager = getProcessManager();

await processManager.execute({
  id: `changelog-${projectId}`,
  command: pythonCommand,
  args: [...pythonBaseArgs, '-c', script],
  timeout: 2 * 60 * 1000, // 2 minutes
  description: `Changelog generation for project ${projectId}`
});
```

### Architecture Notes

#### Singleton Pattern

ProcessManager uses a singleton pattern to ensure all parts of the application share the same process tracking state:

```typescript
// Multiple calls return the same instance
const pm1 = getProcessManager();
const pm2 = getProcessManager();
console.log(pm1 === pm2); // true
```

#### Why Centralized?

Before ProcessManager, each service managed its own processes:

**Problems:**
- No timeout protection (processes could hang forever)
- No cleanup on app exit (orphaned processes)
- Duplicated process management logic
- Difficult to debug (no central tracking)

**Solutions:**
- Single source of truth for all processes
- Guaranteed cleanup on app shutdown
- Consistent timeout behavior
- Centralized logging and debugging

#### Event-Driven Architecture

ProcessManager extends EventEmitter to allow streaming stdout/stderr without blocking:

```typescript
// Services can still stream output in real-time
processManager.on('stdout', (id, data) => {
  if (id === 'my-process') {
    // Process stdout chunks as they arrive
    handleStreamingData(data);
  }
});
```

### Contributing

When adding new Python subprocess calls:

1. Use ProcessManager instead of raw `spawn()`
2. Set appropriate timeout based on operation type
3. Use unique, descriptive process IDs
4. Add description for debugging
5. Handle timeout errors gracefully

### Migration Checklist

Migrating from raw `spawn()` to ProcessManager:

- [ ] Import `getProcessManager`
- [ ] Replace `spawn()` with `processManager.execute()`
- [ ] Set appropriate timeout
- [ ] Add unique process ID
- [ ] Update event listeners to use process manager events
- [ ] Remove manual process tracking (Map<string, ChildProcess>)
- [ ] Remove manual cleanup code
- [ ] Update tests to mock ProcessManager

### Testing

```bash
# Run ProcessManager tests
npm test -- process-manager.test.ts
```
