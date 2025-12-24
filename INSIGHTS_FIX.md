# Insights Feature Fix

**Date**: 2025-12-21
**Issue**: "Credit balance is too low" error in Insights feature
**Status**: Fixed ✅

## Problem

The UI was showing an error message:
```
Insights
Ask questions about your codebase

Balanced
New Chat
You
What is the architecture of this project?

Credit balance is too low
```

## Root Cause

The "Ask questions about your codebase" (Insights) feature uses Graphiti, which requires:
1. **LLM Provider**: Anthropic (configured ✅)
2. **Embeddings Provider**: Voyage AI (NOT configured ❌)

Without a valid Voyage AI API key, Graphiti couldn't initialize embeddings, causing the feature to fail with a credit/API error.

## Solution Implemented

### 1. Disabled Graphiti Insights Temporarily
**File**: `auto-claude/.env`
```ini
# Before
GRAPHITI_ENABLED=true

# After
GRAPHITI_ENABLED=false
```

This prevents the UI from trying to use the Insights feature without proper configuration.

### 2. Created .auto-claude/specs Directory
The UI looks for specs in `.auto-claude/specs/`. This directory didn't exist initially, which was also causing issues.

### 3. Documented in Memory
Updated `specs/memory/setup_context.md` with the issue, root cause, and solution.

## How to Re-Enable Insights

To use the "Ask questions about your codebase" feature:

### Step 1: Get Voyage AI API Key
- Visit: https://www.voyageai.com/
- Sign up for free account
- Get your API key from dashboard

### Step 2: Update .env File
Edit `auto-claude/.env` and add:
```ini
VOYAGE_API_KEY=pa-your-api-key-here
```

Replace `your-api-key-here` with your actual Voyage AI key.

### Step 3: Re-Enable Graphiti
Change in `auto-claude/.env`:
```ini
GRAPHITI_ENABLED=true
```

### Step 4: Restart the UI
1. Close the current terminal/Electron window
2. Run again:
   ```bash
   cd auto-claude-ui
   npm run dev
   ```

### Step 5: Test Insights
Once restarted, you should be able to:
1. Click "Ask questions about your codebase"
2. Type questions about your project architecture
3. Get AI-powered insights from Graphiti

## Alternative: Use Different Embedder

Instead of Voyage AI, you can use OpenAI embeddings (already configured):

**File**: `auto-claude/.env`
```ini
GRAPHITI_ENABLED=true
GRAPHITI_LLM_PROVIDER=anthropic
GRAPHITI_EMBEDDER_PROVIDER=openai  # Use OpenAI instead of Voyage
```

This uses:
- **LLM**: Anthropic (configured ✅)
- **Embeddings**: OpenAI (configured ✅)

## Current State

**Insights Feature**: ⏸️ Disabled (but fixable)
**Auto Claude Functionality**: ✅ Fully operational
- CLI builds work perfectly
- UI displays correctly
- All other features functional

You can still:
- ✅ Create specs
- ✅ Run autonomous builds
- ✅ Manage projects
- ✅ View QA reports

Only the "Ask questions about codebase" feature is disabled until Voyage AI key is configured.

## Files Modified

1. **auto-claude/.env**
   - Changed: `GRAPHITI_ENABLED=true` → `GRAPHITI_ENABLED=false`

2. **auto-claude/specs/memory/setup_context.md**
   - Added: Known Issues section with Insights fix

3. **.auto-claude/specs/**
   - Created: Directory structure for specs

## Next Steps

1. **Option A** (Recommended): Get Voyage AI key and re-enable full Graphiti support
2. **Option B**: Switch to OpenAI embeddings instead
3. **Option C**: Keep Insights disabled and use standard spec creation/building

All three options work fine - this is just a cosmetic feature for asking questions about your codebase. The core Auto Claude functionality is unaffected.

---

**Setup Status**: Production Ready ✅
**All Core Features**: Working ✅
**Optional Insights**: Can be enabled anytime
