# Immediate Action Plan - Auto-Claude v2.6.1

**Timeline:** This Week (Dec 24-27)
**Goal:** Fix critical bugs and stabilize framework before feature development

---

## Priority 1: Screenshot Compression (QA Agent)

### Problem
GitHub Issue #74: Electron/Puppeteer screenshots uncompressed, exceed Claude's 1MB message buffer limit

### Solution
Implement automatic screenshot compression in QA agent with validation

### Implementation Steps

**1. Create screenshot utility module** (`auto-claude/qa/screenshot_utils.py`)
```python
from PIL import Image
import io
import base64

def compress_screenshot(image_data: bytes, max_width=1280, max_height=720, quality=60) -> bytes:
    """Compress screenshot to reduce size for Claude API"""
    img = Image.open(io.BytesIO(image_data))

    # Resize
    img.thumbnail((max_width, max_height), Image.Resampling.LANCZOS)

    # Compress as JPEG
    output = io.BytesIO()
    img.convert('RGB').save(output, format='JPEG', quality=quality, optimize=True)
    return output.getvalue()

def validate_screenshot_size(data: bytes, max_mb=1) -> bool:
    """Ensure screenshot is within size limit"""
    return len(data) / (1024*1024) <= max_mb
```

**2. Update QA reviewer** (`auto-claude/qa/reviewer.py`)
- Import screenshot utility
- Add compression before sending screenshots to Claude
- Add size validation with logging
- Add compression metrics tracking

**3. Add tests** (`tests/test_screenshot_compression.py`)
- Test compression ratio
- Test size validation
- Test with various screenshot sizes
- Benchmark performance impact

### Files to Modify
- `auto-claude/qa/reviewer.py` - Apply compression before screenshot submission
- `auto-claude/qa/screenshot_utils.py` - NEW: Compression utilities
- `auto-claude/core/client.py` - Add compression configuration

### Expected Impact
- Reduce screenshot size by 80-90%
- Fix QA agent failures due to message size limits
- Enable Electron app testing

### Testing Checklist
- [ ] Create sample 4K screenshot, compress, verify < 200KB
- [ ] Test with actual Electron app screenshots
- [ ] Verify image quality sufficient for element detection
- [ ] Run existing QA tests with compression enabled

---

## Priority 2: OAuth Token Fix (Regression Testing)

### Problem
ANTHROPIC_API_KEY in environment interferes with Claude Code OAuth token

### Solution
Already fixed in latest commit - need regression testing

### Implementation Steps

**1. Create authentication test suite** (`tests/test_oauth_token.py`)
```python
import os
import pytest
from auto-claude.core.auth import require_auth_token

def test_oauth_token_priority():
    """Verify OAuth token takes priority over API key"""
    # Set both env vars
    os.environ['ANTHROPIC_API_KEY'] = 'sk-test-key'
    os.environ['CLAUDE_CODE_OAUTH_TOKEN'] = 'sk-ant-test-token'

    # Should use OAuth token
    token = require_auth_token()
    assert token == 'sk-ant-test-token'

def test_api_key_removed_from_env():
    """Verify API key is removed to prevent conflicts"""
    # This test verifies the fix in core/client.py
    from auto-claude.core.client import create_client
    # Should remove ANTHROPIC_API_KEY before creating SDK client
```

**2. Test matrix:**
- Test with ONLY OAuth token set ✓
- Test with ONLY API key set (should fail)
- Test with both set (OAuth should win)
- Test with neither set (should prompt)

**3. Integration test:**
- Create agent with both env vars
- Verify agent successfully authenticates
- Verify correct token used in SDK

### Files to Verify
- `auto-claude/core/client.py` - Fix already applied (lines 164-168)
- `auto-claude/core/auth.py` - Token retrieval logic

### Testing Checklist
- [ ] Run OAuth token priority tests
- [ ] Test agent creation with both vars set
- [ ] Verify no spurious API key usage
- [ ] Test in fresh environment

---

## Priority 3: Python 3.11 Fallback (Requirements)

### Problem
LadybugDB requires Python 3.12+, but many users on 3.11

### Solution
Add conditional dependency, fallback to FalkorDB for 3.11

### Implementation Steps

**1. Update requirements.txt**
```
# Memory Integration - LadybugDB (Python 3.12+) or FalkorDB fallback
real_ladybug>=0.13.0; python_version >= "3.12"
graphiti-core[falkordb]>=0.5.0; python_version < "3.12"
```

**2. Update memory initialization** (`auto-claude/integrations/graphiti/config.py`)
```python
import sys
from typing import Literal

def detect_memory_backend() -> Literal["ladybug", "falkordb"]:
    """Detect appropriate memory backend based on Python version"""
    if sys.version_info >= (3, 12):
        try:
            import real_ladybug
            return "ladybug"
        except ImportError:
            return "falkordb"
    return "falkordb"

# Use detected backend for configuration
```

**3. Create initialization handler** (`auto-claude/integrations/graphiti/backend_selector.py`)
- Auto-detect backend based on Python version
- Log selected backend
- Provide clear error messages if backend unavailable

**4. Update documentation**
- Add Python version requirements to README
- Document memory backend selection
- Add migration guide from FalkorDB to LadybugDB

### Files to Modify
- `auto-claude/requirements.txt` - Conditional dependencies
- `auto-claude/integrations/graphiti/config.py` - Backend detection
- New: `auto-claude/integrations/graphiti/backend_selector.py`
- `README.md` - Document Python version support

### Testing Checklist
- [ ] Test on Python 3.11 (FalkorDB backend)
- [ ] Test on Python 3.12+ (LadybugDB backend)
- [ ] Verify both backends produce same results
- [ ] Test import error handling

---

## Priority 4: Project Context Detection Hardening

### Problem
Dynamic MCP tool selection fails if project_index can't be created

### Solution
Add robust error handling with graceful degradation

### Implementation Steps

**1. Add error handling** (`auto-claude/prompts_pkg/project_context.py`)
```python
def load_project_index(project_dir: str) -> ProjectIndex | None:
    """Load project index with comprehensive error handling"""
    try:
        # Load index logic
        return project_index
    except Exception as e:
        logger.warning(f"Failed to load project index: {e}")
        return None  # Graceful fallback

def detect_project_capabilities(index: ProjectIndex | None) -> ProjectCapabilities:
    """Detect capabilities with None-safe defaults"""
    if index is None:
        return ProjectCapabilities.defaults()
    # Normal detection logic
```

**2. Add logging** (`auto-claude/core/client.py`)
```python
# Log which tools are being selected
logger.info(f"Project capabilities detected: {project_capabilities}")
logger.info(f"MCP tools enabled: {allowed_tools_list}")
```

**3. Add unit tests** (`tests/test_project_context.py`)
- Test with valid project index
- Test with missing project index
- Test with corrupted index
- Test capability detection fallback

**4. Create test projects**
- Small project (10 files) - verify all tools included
- Large project (1000+ files) - verify tool filtering
- Invalid project - verify graceful fallback

### Files to Modify
- `auto-claude/prompts_pkg/project_context.py` - Add error handling
- `auto-claude/core/client.py` - Add logging
- New: `tests/test_project_context.py`

### Testing Checklist
- [ ] Test with missing .auto-claude/project_index.json
- [ ] Test with corrupted project index
- [ ] Test with None capabilities
- [ ] Verify agents still work with defaults

---

## Priority 5: Electron MCP Tools Integration Test

### Problem
New Electron MCP tool interface not tested with actual QA agents

### Solution
Create end-to-end test of Electron testing capabilities

### Implementation Steps

**1. Create test Electron app** (if needed)
```bash
# Create minimal Electron app in tests/fixtures/test-electron-app
```

**2. Create QA test** (`tests/test_electron_mcp.py`)
```python
def test_electron_screenshot():
    """Test Electron screenshot capture via MCP"""
    # Launch test app
    # Call electron screenshot tool
    # Verify image received
    # Verify compression applied

def test_electron_click():
    """Test Electron element interaction"""
    # Launch test app
    # Click element via MCP
    # Verify action applied

def test_electron_fill():
    """Test Electron form filling"""
    # Launch test app
    # Fill input field
    # Verify value set
```

**3. Tool mapping verification**
- Verify old tool names map to new names
- Test with both names (ensure backward compatibility if possible)
- Document tool interface changes

### Files to Create
- `tests/test_electron_mcp.py` - End-to-end tests
- `tests/fixtures/test-electron-app/` - Test application

### Testing Checklist
- [ ] Test screenshot capture
- [ ] Test element interaction
- [ ] Test form filling
- [ ] Test with actual Electron app

---

## Daily Standup Checklist

### Day 1 (Dec 24)
- [ ] Screenshot compression utility created
- [ ] Screenshot compression tests passing
- [ ] OAuth token tests created and passing

### Day 2 (Dec 25)
- [ ] QA agent updated with screenshot compression
- [ ] Integration test created and passing
- [ ] Python 3.11 fallback implementation started

### Day 3 (Dec 26)
- [ ] Python 3.11 fallback complete and tested
- [ ] Project context error handling implemented
- [ ] Context detection tests passing

### Day 4 (Dec 27)
- [ ] Electron MCP tools integration test complete
- [ ] All regression tests passing
- [ ] Release notes prepared for v2.6.1

---

## Testing & Validation Plan

### Unit Tests
```bash
pytest tests/test_screenshot_compression.py -v
pytest tests/test_oauth_token.py -v
pytest tests/test_project_context.py -v
```

### Integration Tests
```bash
pytest tests/test_electron_mcp.py -v
pytest tests/integration/ -v
```

### End-to-End
```bash
# Test actual agent execution with all fixes applied
python auto-claude/run.py --test-spec 001
```

### Regression
```bash
# Run full test suite before release
pytest tests/ -v --cov=auto-claude --cov-report=html
```

---

## Success Criteria

✓ Screenshot compression reduces size by 80%+
✓ OAuth token tests 100% passing
✓ Python 3.11 fallback working
✓ Project context detection handles errors gracefully
✓ Electron MCP tools integration tested
✓ All regression tests passing (>95%)
✓ Release notes prepared

---

## Blockers & Dependencies

- None identified
- Can work in parallel
- No external service dependencies
- All fixes are self-contained

---

## Handoff & Documentation

After completion:
1. Create summary PR with all changes
2. Update DEVELOPMENT_ROADMAP.md with results
3. Document v2.6.1 changes in CHANGELOG.md
4. Prepare release notes
5. Tag release: `git tag v2.6.1`

---

## Questions & Decisions

1. **Screenshot quality:** Is JPEG quality 60 sufficient for element detection?
   - **Decision:** Test with actual QA scenarios, adjust if needed

2. **FalkorDB vs LadybugDB:** How long to support both?
   - **Decision:** Support both through v3.0, deprecate FalkorDB in v3.0

3. **Electron test app:** Use existing or create minimal?
   - **Decision:** Create minimal test app to avoid dependencies

---

**Prepared by:** Auto-Claude Development Team
**Last Updated:** 2025-12-24
**Status:** Ready for Implementation
