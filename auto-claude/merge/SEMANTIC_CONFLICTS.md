# Semantic Conflict Detection

## Overview

The semantic conflict detector analyzes code at the AST (Abstract Syntax Tree) level to find conflicts that aren't caught by simple location-based detection. It uses Python's `ast` module to understand the actual semantics of code changes.

## Supported Conflict Types

### 1. Function Rename Conflicts

Detects when a function is renamed but call sites aren't updated.

**Example:**
```python
# Task A renames function
- def foo():
+ def bar():
    pass

# Task B calls the old name
def caller():
    result = foo()  # ERROR: foo doesn't exist anymore!
    return result
```

### 2. Import Removal Conflicts

Detects when an import is removed but the imported symbol is still used.

**Example:**
```python
# Task A removes import
- from typing import List

# Task B uses the symbol (without importing it)
def process(items: List[int]) -> int:  # ERROR: List not defined!
    return sum(items)
```

### 3. Type Change Conflicts

Detects when a function's return type changes in ways that could break callers.

**Example:**
```python
# Task A changes return type
- def get_user() -> User:
+ def get_user() -> User | None:
    return None

# This could break callers that don't handle None
user = get_user()
print(user.name)  # Potential AttributeError!
```

### 4. Variable Rename Conflicts (Planned)

Future enhancement to detect inconsistent variable renames.

## Usage

### Basic Usage

```python
from auto_claude.merge.semantic_conflict_detector import detect_semantic_conflicts
from auto_claude.merge.types import FileAnalysis, SemanticChange, ChangeType

# Prepare task analyses
task_analyses = {
    "task-a": FileAnalysis(...),
    "task-b": FileAnalysis(...),
}

# Provide file contents for each task
file_contents = {
    "task-a": (before_content_a, after_content_a),
    "task-b": (before_content_b, after_content_b),
}

# Detect conflicts
conflicts = detect_semantic_conflicts(task_analyses, file_contents)

# Process results
for conflict in conflicts:
    print(f"Conflict: {conflict.reason}")
    print(f"Severity: {conflict.severity.value}")
    print(f"Tasks involved: {conflict.tasks_involved}")
```

### Integration with Conflict Analysis

The semantic conflict detector is automatically integrated into the main conflict detection pipeline:

```python
from auto_claude.merge.conflict_detector import ConflictDetector

detector = ConflictDetector()

# Pass file_contents to enable semantic detection
conflicts = detector.detect_conflicts(
    task_analyses=task_analyses,
    file_contents=file_contents  # Optional but enables semantic analysis
)
```

## Symbol Table Building

The detector builds symbol tables for each file to track:

- **Definitions**: Functions, classes, variables, imports
- **Usages**: Where symbols are referenced
- **Function Calls**: Where functions are called
- **Function Signatures**: Return type annotations
- **Imports**: What symbols are imported from where

### Example Symbol Table

```python
from auto_claude.merge.semantic_conflict_detector import build_symbol_table

code = """
from typing import List

def process(items: List[int]) -> int:
    return sum(items)

x = process([1, 2, 3])
"""

table = build_symbol_table("example.py", code)

# table.definitions:
# {
#     'List': ('import', 1, 'module'),
#     'process': ('function', 3, 'module'),
#     'x': ('variable', 6, 'module')
# }

# table.function_signatures:
# {
#     'process': 'int'
# }

# table.imports:
# {
#     'List': 'typing.List'
# }
```

## Language Support

Currently supports:
- **Python** (.py files) - Full AST-based analysis

Future support planned for:
- JavaScript/TypeScript (.js, .jsx, .ts, .tsx)
- Other languages via extensible analyzer framework

## Architecture

### Components

1. **SymbolTable**: Tracks definitions, usages, and metadata
2. **PythonSymbolExtractor**: AST visitor that builds symbol tables
3. **Conflict Detection Functions**: Specialized detectors for each conflict type
4. **ConflictRegion Converter**: Transforms semantic conflicts into standard format

### Data Flow

```
FileAnalysis + file_contents
    ↓
Build Symbol Tables (AST parsing)
    ↓
Detect Conflicts (compare symbol tables)
    ↓
SemanticConflict objects
    ↓
Convert to ConflictRegion
    ↓
Integrate with main conflict detection
```

## Performance

- **AST Parsing**: O(n) where n = file size
- **Symbol Table Building**: O(n) single pass through AST
- **Conflict Detection**: O(t²) where t = number of tasks (pairwise comparison)
- **Overall**: Typically <100ms per file for normal-sized files

## Error Handling

- Syntax errors in source code are caught and logged
- Unsupported file types return `None` gracefully
- Missing dependencies don't crash the system
- Invalid AST nodes are skipped

## Testing

Comprehensive test suite covering:
- Symbol table building for all Python constructs
- Each conflict type detection
- Edge cases (syntax errors, empty files, etc.)
- Integration with main conflict detection system

Run tests:
```bash
python -m pytest auto-claude/merge/__tests__/test_semantic_conflict_detector.py -v
```

## Future Enhancements

1. **JavaScript/TypeScript Support**: Extend to JS/TS files using tree-sitter
2. **Variable Rename Detection**: Track variable renames across the file
3. **Cross-File Analysis**: Detect conflicts across multiple files
4. **Data Flow Analysis**: Track how data flows through functions
5. **Control Flow Analysis**: Detect unreachable code introduced by merges
6. **Performance Optimization**: Cache symbol tables between runs

## Implementation Notes

### Why AST Instead of Regex?

AST parsing provides:
- **Accuracy**: Understanding of actual code structure
- **Context Awareness**: Knows scope, nesting, etc.
- **Robustness**: Handles complex syntax correctly
- **Future-Proof**: Easy to extend with new conflict types

### Integration Philosophy

The semantic detector is:
- **Optional**: Works without it, enhanced with it
- **Non-Invasive**: Doesn't modify existing conflict detection logic
- **Extensible**: Easy to add new conflict types
- **Testable**: Each component is independently tested

## Conflict Resolution Recommendations

When semantic conflicts are detected:

1. **Import Removal + Usage**: Add missing import to dependent task
2. **Function Rename + Calls**: Update all call sites to use new name
3. **Type Changes**: Review callers and add None-handling if needed
4. **Variable Rename**: Ensure consistent naming across tasks

All semantic conflicts are marked with `can_auto_merge=False` and `merge_strategy=HUMAN_REQUIRED` because they require careful review and understanding of the code's intent.
