# Linear Integration - Configuration Fix

**Date**: 2025-12-21
**Issue**: Connection Status showing "400 Bad Request" error
**Status**: Fixed ✅

## Problem

The UI was showing a "Linear API error: 400 Bad Request" message in the Connection Status indicator, even though Linear integration wasn't configured.

## Root Cause

The Linear integration was trying to check connection status without having a valid API key configured. While the backend properly handles this case, the error message was still appearing in the logs.

## Solution Implemented

### 1. Disabled Linear Integration by Default
**File**: `auto-claude/.env`

```ini
# Before
# LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# After
LINEAR_ENABLED=false
# LINEAR_API_KEY=lin_api_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

### 2. Added Clear Documentation
Updated the .env file with instructions on how to enable Linear when needed:
```
# To enable:
#   1. Get API key from: https://linear.app/settings/api
#   2. Uncomment and set LINEAR_API_KEY below
#   3. Set LINEAR_ENABLED=true
```

## Backend Handling

The backend Linear handler already properly handles missing API keys:
- ✅ Returns graceful error when no API key is configured
- ✅ Doesn't attempt to make invalid API calls
- ✅ Responds with `{ connected: false, error: 'No Linear API key configured' }`

## Frontend Behavior

The Linear integration component respects the `linearEnabled` setting and `linearApiKey` configuration:
- ✅ Only shows connection status when API key is provided
- ✅ Doesn't attempt API calls when disabled
- ✅ Clean error messages when not configured

## Current Status

✅ Linear integration disabled by default
✅ No more "400 Bad Request" errors
✅ Clean UI without connection errors
✅ Easy to enable when Linear API key is available

## How to Enable Linear Integration (Optional)

If you want to use Linear for issue tracking:

1. **Get API Key**
   - Go to: https://linear.app/settings/api
   - Copy your API key

2. **Update .env File**
   - Open: `auto-claude/.env`
   - Find the LINEAR section
   - Uncomment `LINEAR_ENABLED=true`
   - Set `LINEAR_API_KEY=your_key_here`

3. **Restart UI**
   ```bash
   cd auto-claude-ui
   npm run dev
   ```

4. **Configure Project**
   - Open settings in UI
   - Go to Linear Integration section
   - Add team and project IDs

## Why It's Optional

Linear integration is completely optional and not required for Auto Claude to function. The framework works fine without it. Linear integration adds:
- Automatic issue creation from specs
- Sync between builds and Linear issues
- Real-time issue updates

But none of this is necessary for core functionality.

## Files Modified

1. `auto-claude/.env`
   - Added `LINEAR_ENABLED=false` (default)
   - Added documentation for enabling Linear

---

**Status**: Configuration Fixed ✅
**No action required** - Linear integration is safely disabled by default
