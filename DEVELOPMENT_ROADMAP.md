# Auto-Claude Development Roadmap

**Version:** 2.6.0+
**Last Updated:** 2025-12-24
**Status:** Active Development

---

## Overview

Auto-Claude is an autonomous multi-agent coding framework with:
- **4,741** Python files across core modules
- **Sophisticated CLI + Desktop UI** (Electron + React)
- **Memory layer** with cross-session context retention
- **Autonomous agents** (Planner, Coder, QA Reviewer)
- **Advanced merge system** with AI-powered conflict resolution

---

## Critical Development Priorities (Next 30 Days)

### Phase 1: Stabilization & Bug Fixes (Week 1-2)

#### 1.1 Memory Layer Migration Validation
**Issue:** LadybugDB integration requires Python 3.12+
**Tasks:**
- [ ] Test LadybugDB compatibility with existing FalkorDB schemas
- [ ] Create migration script for existing projects
- [ ] Add fallback for Python 3.11 (keep FalkorDB support)
- [ ] Document migration path for users

**Files Affected:**
- `auto-claude/integrations/graphiti/config.py`
- `auto-claude/integrations/graphiti/migrate_embeddings.py`
- `auto-claude/requirements.txt`

#### 1.2 Project Context Detection Hardening
**Issue:** Dynamic MCP tool selection needs robust fallback
**Tasks:**
- [ ] Add error handling for missing project_context
- [ ] Implement graceful degradation when project index fails
- [ ] Add comprehensive logging for tool selection
- [ ] Create unit tests for project capability detection

**Files Affected:**
- `auto-claude/prompts_pkg/project_context.py`
- `auto-claude/core/client.py`
- `auto-claude/agents/tools_pkg/permissions.py`

#### 1.3 QA Agent Tool Permissions
**Issue:** QA agent screenshot compression not properly enforced
**Tasks:**
- [ ] Implement automatic screenshot compression (1280x720, JPEG q=60)
- [ ] Add size validation pre-send to Claude
- [ ] Test with Electron/Puppeteer screenshots
- [ ] Document screenshot best practices

**Files Affected:**
- `auto-claude/qa/reviewer.py`
- `auto-claude/core/client.py`

### Phase 2: Feature Enhancement (Week 2-3)

#### 2.1 Enhanced Error Recovery
**Issue:** Agent failures need better recovery mechanisms
**Tasks:**
- [ ] Implement automatic retry with exponential backoff
- [ ] Add checkpoint-based recovery for long-running tasks
- [ ] Create recovery context from failed subtasks
- [ ] Build recovery prompt templates

**Files Affected:**
- `auto-claude/agents/base.py`
- `auto-claude/agents/coder.py`
- `auto-claude/spec/pipeline/orchestrator.py`

#### 2.2 Context Window Optimization
**Issue:** Large projects may exceed Claude's context window
**Tasks:**
- [ ] Implement context-aware chunking strategy
- [ ] Create adaptive context summarization
- [ ] Build token counter and estimator
- [ ] Add warnings for large files/contexts

**Files Affected:**
- `auto-claude/context/builder.py`
- `auto-claude/context/serialization.py`
- New: `auto-claude/context/chunking.py`

#### 2.3 Linear Integration Improvements
**Issue:** Linear sync occasionally fails silently
**Tasks:**
- [ ] Add comprehensive Linear API error handling
- [ ] Implement robust state tracking
- [ ] Create Linear sync validation tests
- [ ] Add retry logic for failed syncs

**Files Affected:**
- `auto-claude/integrations/linear/integration.py`
- `auto-claude/integrations/linear/updater.py`

### Phase 3: Performance & Optimization (Week 3-4)

#### 3.1 Agent Parallelization
**Issue:** Sequential subtask execution limits throughput
**Tasks:**
- [ ] Implement independent subtask parallel execution
- [ ] Add dependency tracking for ordered subtasks
- [ ] Create resource pooling for parallel agents
- [ ] Build parallelization metrics/observability

**Files Affected:**
- `auto-claude/agents/session.py`
- `auto-claude/spec/pipeline/orchestrator.py`

#### 3.2 Memory Layer Performance
**Issue:** Graph queries may be slow for large projects
**Tasks:**
- [ ] Benchmark LadybugDB query performance
- [ ] Implement query result caching
- [ ] Add index optimization for common queries
- [ ] Create query performance monitoring

**Files Affected:**
- `auto-claude/integrations/graphiti/queries_pkg/client.py`
- `auto-claude/memory/main.py`

#### 3.3 CLI/UI Performance
**Issue:** Large project analysis can be slow
**Tasks:**
- [ ] Optimize project analyzer (parallel scanning)
- [ ] Implement incremental analysis updates
- [ ] Cache analysis results
- [ ] Add progress indicators for long operations

**Files Affected:**
- `auto-claude/analysis/project_analyzer.py`
- `auto-claude/analysis/analyzers/` (all)

---

## Known Issues & Technical Debt

### High Priority

1. **OAuth Token Management** (Fixed in latest)
   - ANTHROPIC_API_KEY interferes with Claude Code OAuth token
   - Fixed in latest commit but needs regression testing
   - Impact: Medium - breaks agent authentication
   - Files: `auto-claude/core/client.py`

2. **Screenshot Size Limits** (GitHub Issue #74)
   - Uncompressed Electron screenshots exceed Claude's message buffer (1MB)
   - Needs automatic compression in QA agent
   - Impact: High - affects QA testing capabilities
   - Files: `auto-claude/qa/reviewer.py`

3. **Electron MCP Tool Interface** (Deprecated)
   - Old tool names: electron_connect, electron_screenshot, etc.
   - New names: get_electron_window_info, take_screenshot, etc.
   - Impact: High - breaks desktop app testing
   - Status: Fixed in code, needs integration testing

### Medium Priority

1. **Python 3.12+ Requirement**
   - LadybugDB requires Python 3.12+
   - Many users still on 3.11
   - Solution: Keep FalkorDB support as fallback
   - Files: `auto-claude/integrations/graphiti/`

2. **Graphiti Memory Tests**
   - 851 lines of test refactoring in test_graphiti_memory.py
   - Provider naming validation tests added
   - Status: Tests need execution and coverage verification

3. **Merge System Edge Cases**
   - File evolution tracking incomplete for some scenarios
   - Timeline-based merging may have gaps
   - Files: `auto-claude/merge/file_evolution/`

### Low Priority

1. **Documentation**
   - Code documentation sparse in some areas
   - Architecture docs for merge system added but incomplete
   - Type hints needed in several modules

2. **Test Coverage**
   - Overall coverage ~60-70%
   - Core agent logic needs better testing
   - Edge cases in merge system under-tested

---

## Architecture Overview

### Core Components

```
auto-claude/
├── agents/              # Autonomous agents (Planner, Coder, QA)
├── core/                # SDK client, auth, workspace management
├── spec/                # Spec creation and pipeline orchestration
├── merge/               # AI-powered merge resolution system
├── integrations/        # Graphiti memory, Linear, etc.
├── cli/                 # CLI interface
├── context/             # Context gathering and codebase analysis
├── analysis/            # Project analysis and insights
├── prompts/             # Agent prompts and templates
└── ui/                  # CLI UI components
```

### Key Technologies

- **Agent Framework:** Claude Code SDK
- **Memory:** LadybugDB / FalkorDB (graph database)
- **Merge:** AI-powered resolver + auto-merger strategies
- **CLI:** Python + Rich
- **Desktop UI:** Electron + React + TypeScript
- **ORM:** Drizzle (for project databases)

---

## Testing Strategy

### Current Test Coverage
- `auto-claude/integrations/graphiti/test_graphiti_memory.py` (851 lines)
- `auto-claude/integrations/graphiti/test_provider_naming.py` (68 lines)
- Basic CLI tests in `auto-claude/cli/`

### Required Tests
1. **Agent Tests**
   - Planner task decomposition
   - Coder implementation quality
   - QA validation accuracy

2. **Integration Tests**
   - End-to-end spec execution
   - Merge conflict resolution
   - Linear sync operations

3. **Performance Tests**
   - Large project handling (1000+ files)
   - Memory usage under load
   - Query performance (Graphiti)

---

## Deployment & Release Plan

### v2.6.1 (Next Week)
- Fix OAuth token priority issue (CRITICAL)
- Screenshot compression implementation
- Python 3.11 fallback support
- Electron MCP tool integration testing

### v2.7.0 (Next Month)
- Error recovery mechanisms
- Context window optimization
- Agent parallelization
- Performance benchmarks

### v3.0.0 (Q1 2025)
- Multi-language support
- Enhanced IDE integrations
- Advanced memory features
- Enterprise features (SSO, audit logs)

---

## Development Guidelines

### Code Quality
- All Python code must pass ruff linting
- TypeScript must have < 5 any types per file
- Test coverage minimum 70% for new code

### Git Workflow
1. Create feature branch from main
2. Make focused, atomic commits
3. Create PR with detailed description
4. Require code review + passing tests
5. Merge with squash commits for clean history

### Performance Requirements
- Agent response time < 30s for simple tasks
- Memory usage < 2GB for typical projects
- Project analysis < 5s for repos < 50k files

---

## Success Metrics

### User-Facing
- Agent success rate > 95%
- Merge conflict resolution > 90%
- Feature request turnaround < 2 weeks

### Technical
- Test coverage > 70%
- Incident response time < 24h
- Performance regression < 10%

---

## Next Immediate Actions

1. **This Week:** Fix screenshot compression in QA agent
2. **This Week:** Add Python 3.11 fallback for memory layer
3. **This Week:** Create comprehensive integration tests
4. **Next Week:** Begin parallelization implementation
5. **Next Week:** Performance benchmarking baseline

---

## Contact & Resources

- **Issue Tracker:** GitHub Issues
- **Documentation:** CLAUDE.md, guides/
- **Community:** Discord server
- **Contributing:** CONTRIBUTING.md
