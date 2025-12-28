# Linear Integration Error Handling

## Overview

The Linear integration includes robust error handling and graceful degradation to ensure builds never fail due to Linear API unavailability. This document describes the error recovery mechanisms.

## Key Features

### 1. Retry with Exponential Backoff

All Linear API operations use retry logic with exponential backoff for transient failures:

- **Initial delay**: 1-2 seconds
- **Max delay**: 30 seconds between retries
- **Max retries**: 3 attempts
- **Timeout**: 10-30 seconds per request

```python
from auto_claude.integrations.linear import create_linear_task

# Automatically retries on transient failures
task = await create_linear_task(
    spec_dir=spec_dir,
    title="Implement feature",
    description="Feature description"
)
# Returns None if Linear unavailable, continues build
```

### 2. Error Classification

Errors are classified as transient or non-transient:

**Transient Errors** (will retry):
- Network errors (connection timeout, DNS failure)
- Rate limit errors (429)
- Server errors (500, 502, 503)
- Request timeouts
- Unknown errors (safe default)

**Non-Transient Errors** (fail fast, no retry):
- Authentication errors (invalid API key)
- Authorization errors (insufficient permissions)
- Validation errors (invalid request data)

```python
from auto_claude.integrations.linear.error_handling import classify_error

try:
    result = await linear_operation()
except Exception as e:
    error_info = classify_error(e)
    if error_info.is_transient:
        # Will retry automatically
        pass
    else:
        # Will fail fast
        pass
```

### 3. Connection Status Caching

The system caches Linear availability status to avoid repeated failures:

- **Failure threshold**: 3 consecutive failures → mark as unavailable
- **Cache duration**: 5 minutes
- **Auto-recovery**: Cache expires, retry allowed

```python
from auto_claude.integrations.linear import (
    is_linear_available,
    get_linear_status,
    LinearAvailability
)

# Check if Linear is available before attempting operations
if is_linear_available():
    await create_linear_task(...)
else:
    print("Linear unavailable, skipping")

# Get detailed status
status = get_linear_status()
if status == LinearAvailability.UNAVAILABLE:
    print("Linear is down")
elif status == LinearAvailability.DEGRADED:
    print("Linear is experiencing issues")
elif status == LinearAvailability.AVAILABLE:
    print("Linear is healthy")
```

### 4. Graceful Degradation

**Builds never fail due to Linear unavailability.** All Linear functions:
- Return `False` or `None` on failure
- Log warnings instead of raising exceptions
- Allow the build to continue without Linear tracking

```python
# Example: QA validation continues even if Linear fails
await linear_qa_started(spec_dir)  # Returns False if Linear down
# QA loop continues regardless of result

# Example: Subtask completion is logged locally
await linear_subtask_completed(spec_dir, subtask_id, 3, 10)
# Build continues with local tracking only
```

### 5. Comprehensive Logging

The system logs Linear integration status at appropriate verbosity levels:

```python
import logging

# Configure logging
logging.basicConfig(level=logging.INFO)

# Linear operations log their status
# INFO: Linear integration: AVAILABLE
# WARNING: Linear integration: DEGRADED - experiencing intermittent issues
# WARNING: Linear integration: UNAVAILABLE - continuing build without Linear
```

## Usage Examples

### Basic Usage

```python
from auto_claude.integrations.linear import (
    create_linear_task,
    linear_task_started,
    linear_subtask_completed,
    linear_qa_started,
    linear_qa_approved
)

# Create task (with automatic retry and fallback)
task = await create_linear_task(
    spec_dir=spec_dir,
    title="Implement authentication",
    description="Add JWT-based auth"
)
if not task:
    print("Linear unavailable, continuing without tracking")

# Update status (graceful degradation on failure)
await linear_task_started(spec_dir)

# Record progress (never fails the build)
await linear_subtask_completed(
    spec_dir=spec_dir,
    subtask_id="subtask-1-1",
    completed_count=1,
    total_count=5
)

# QA phase (continues even if Linear fails)
await linear_qa_started(spec_dir)
await linear_qa_approved(spec_dir)
```

### Advanced: Manual Error Handling

```python
from auto_claude.integrations.linear.error_handling import (
    LinearAvailability,
    get_linear_status,
    get_last_linear_error,
    reset_connection_cache,
    log_linear_status
)

# Check status before critical operations
status = get_linear_status()
if status == LinearAvailability.UNAVAILABLE:
    last_error = get_last_linear_error()
    print(f"Linear unavailable: {last_error.message}")
    print("Continuing build without Linear tracking")

# Log current Linear integration status
log_linear_status(spec_dir)

# Manual recovery: reset cache if you know Linear is back up
reset_connection_cache()
```

### Custom Retry Configuration

```python
from auto_claude.integrations.linear.error_handling import (
    RetryConfig,
    linear_operation_with_fallback
)

async def my_linear_operation():
    # Your Linear operation
    pass

# Custom retry config
config = RetryConfig(
    max_retries=5,          # Try 5 times
    initial_delay=2.0,      # Start with 2s delay
    max_delay=60.0,         # Max 60s between retries
    timeout=30.0            # 30s timeout per request
)

result = await linear_operation_with_fallback(
    my_linear_operation,
    operation_name="custom operation",
    fallback_result=None,
    config=config
)
```

## Error Scenarios

### Scenario 1: Transient Network Failure

```
Attempt 1: Network error (retries in 1s)
Attempt 2: Network error (retries in 2s)
Attempt 3: Success ✓
```

**Result**: Operation succeeds, no build impact

### Scenario 2: Linear Service Outage

```
Attempt 1: 503 Server Error (retries in 1s)
Attempt 2: 503 Server Error (retries in 2s)
Attempt 3: 503 Server Error (retries in 4s)
Attempt 4: 503 Server Error (max retries)
```

**Result**:
- Operation fails gracefully
- Connection cache marks Linear as UNAVAILABLE
- Build continues without Linear tracking
- Future operations skipped for 5 minutes

### Scenario 3: Invalid API Key

```
Attempt 1: 401 Unauthorized (auth error)
```

**Result**:
- Operation fails fast (no retries)
- Connection cache marks Linear as UNAVAILABLE
- Build continues without Linear tracking
- User notified to check LINEAR_API_KEY

### Scenario 4: Rate Limit

```
Attempt 1: 429 Rate Limit (retries in 1s)
Attempt 2: 429 Rate Limit (retries in 2s)
Attempt 3: 429 Rate Limit (retries in 4s)
Attempt 4: Success ✓
```

**Result**: Operation succeeds after backoff

## Configuration

### Environment Variables

```bash
# Required for Linear integration
LINEAR_API_KEY=your-api-key-here

# Optional: Override default retry behavior (future enhancement)
LINEAR_RETRY_MAX_ATTEMPTS=5
LINEAR_RETRY_TIMEOUT=30
LINEAR_CACHE_DURATION=300
```

### Logging Configuration

```python
import logging

# Enable detailed Linear logging
logging.getLogger("auto_claude.integrations.linear").setLevel(logging.DEBUG)

# Or just warnings
logging.getLogger("auto_claude.integrations.linear").setLevel(logging.WARNING)
```

## Testing

Run the error handling test suite:

```bash
# Install test dependencies
cd auto-claude && uv pip install -r ../tests/requirements-test.txt

# Run Linear error handling tests
pytest tests/test_linear_error_handling.py -v

# Run with coverage
pytest tests/test_linear_error_handling.py --cov=auto_claude.integrations.linear.error_handling
```

## Monitoring

### Status Queries

```python
from auto_claude.integrations.linear import (
    is_linear_available,
    get_linear_status,
    get_last_linear_error,
    LinearAvailability
)

# Quick availability check
if is_linear_available():
    print("✓ Linear is operational")

# Detailed status
status = get_linear_status()
if status == LinearAvailability.DEGRADED:
    print("⚠ Linear is experiencing issues")
    last_error = get_last_linear_error()
    if last_error:
        print(f"Last error: {last_error.message}")
```

### Log Analysis

Watch for these log patterns:

```
# Normal operation
INFO: Linear integration: AVAILABLE for 001-feature

# Degraded performance
WARNING: Linear integration: DEGRADED - experiencing intermittent issues

# Service outage
WARNING: Linear integration: UNAVAILABLE - continuing build without Linear
WARNING: Skipping Linear task creation - service unavailable
WARNING: Failed to update Linear status, continuing build

# Recovery
INFO: Linear unavailable cache expired, allowing retry
INFO: Linear integration: AVAILABLE for 001-feature
```

## Best Practices

1. **Never require Linear for builds**: Always treat Linear as optional enhancement
2. **Log degradation**: Warn users when Linear is unavailable but continue
3. **Use connection cache**: Avoid hammering Linear when it's down
4. **Monitor logs**: Watch for degraded/unavailable status
5. **Test without Linear**: Ensure builds work with `LINEAR_API_KEY` unset

## Troubleshooting

### Linear operations always fail

**Check API key**:
```bash
echo $LINEAR_API_KEY
# Should output your API key
```

**Test connectivity**:
```python
from auto_claude.integrations.linear import log_linear_status
from pathlib import Path

log_linear_status(Path("test"))
```

**Reset cache**:
```python
from auto_claude.integrations.linear import reset_connection_cache
reset_connection_cache()
```

### Builds fail when Linear is down

This should **never** happen. If it does:

1. Check you're using the latest version with error handling
2. Ensure you're using the async functions (`await linear_*`)
3. Report as a bug with stack trace

### Too many retries slowing builds

Reduce retry attempts:
```python
from auto_claude.integrations.linear.error_handling import RetryConfig

config = RetryConfig(max_retries=1, initial_delay=0.5)
# Pass to linear_operation_with_fallback
```

## Architecture

```
┌─────────────────────────────────────────────────┐
│            Auto-Claude Build Loop               │
│  (never fails due to Linear unavailability)     │
└─────────────┬───────────────────────────────────┘
              │
              │ calls Linear functions
              ▼
┌─────────────────────────────────────────────────┐
│     linear_task_started() / linear_qa_started() │
│     (public API with graceful degradation)      │
└─────────────┬───────────────────────────────────┘
              │
              │ wraps with error handling
              ▼
┌─────────────────────────────────────────────────┐
│    linear_operation_with_fallback()             │
│    - Checks connection cache                    │
│    - Retries with exponential backoff           │
│    - Returns fallback on failure                │
└─────────────┬───────────────────────────────────┘
              │
              │ uses
              ▼
┌─────────────────────────────────────────────────┐
│    LinearConnectionCache                        │
│    - Tracks consecutive failures                │
│    - Caches unavailable status (5 min)          │
│    - Auto-expires and retries                   │
└─────────────────────────────────────────────────┘
```

## Future Enhancements

- [ ] Configurable retry parameters via environment variables
- [ ] Metrics export (success rate, retry count, latency)
- [ ] Health check endpoint for monitoring
- [ ] Circuit breaker pattern for aggressive rate limiting
- [ ] Persistent cache across process restarts
