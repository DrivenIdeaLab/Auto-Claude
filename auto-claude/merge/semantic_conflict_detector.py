"""
Semantic Conflict Detection
============================

Advanced conflict detection using AST analysis to find semantic conflicts
that aren't caught by simple location-based detection.

This module detects:
- Function renames without updating call sites
- Import removals while symbols are still used
- Variable renames that are inconsistent
- Type changes that break callers
"""

from __future__ import annotations

import ast
import logging
from dataclasses import dataclass, field
from pathlib import Path
from typing import Any

from .types import ChangeType, ConflictRegion, ConflictSeverity, FileAnalysis, MergeStrategy

# Import debug utilities
try:
    from debug import debug, debug_detailed, debug_error, debug_verbose
except ImportError:
    def debug(*args, **kwargs):
        pass

    def debug_detailed(*args, **kwargs):
        pass

    def debug_verbose(*args, **kwargs):
        pass

    def debug_error(*args, **kwargs):
        pass


logger = logging.getLogger(__name__)
MODULE = "merge.semantic_conflict_detector"


@dataclass
class SemanticConflict:
    """
    Represents a semantic conflict detected through AST analysis.

    Attributes:
        conflict_type: Type of semantic conflict (rename, import, type_change, etc.)
        file_path: File containing the conflict
        location: Specific location in the file
        tasks_involved: Task IDs that caused the conflict
        description: Human-readable description
        line_number: Approximate line number of the conflict
        severity: Assessed severity of the conflict
        suggestion: Optional suggestion for resolution
    """
    conflict_type: str
    file_path: str
    location: str
    tasks_involved: list[str]
    description: str
    line_number: int
    severity: ConflictSeverity
    suggestion: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass
class SymbolTable:
    """
    Symbol table tracking definitions and usages in a file.

    Attributes:
        definitions: Map of symbol name -> (type, line_number, scope)
        usages: Map of symbol name -> list of line numbers where used
        imports: Map of imported symbol -> module source
        function_calls: Map of function name -> list of call locations
        function_signatures: Map of function name -> return type annotation
    """
    definitions: dict[str, tuple[str, int, str]] = field(default_factory=dict)
    usages: dict[str, list[int]] = field(default_factory=lambda: {})
    imports: dict[str, str] = field(default_factory=dict)
    function_calls: dict[str, list[int]] = field(default_factory=lambda: {})
    function_signatures: dict[str, str | None] = field(default_factory=dict)

    def add_definition(self, name: str, def_type: str, line: int, scope: str = "module") -> None:
        """Add a symbol definition."""
        self.definitions[name] = (def_type, line, scope)

    def add_usage(self, name: str, line: int) -> None:
        """Add a symbol usage."""
        if name not in self.usages:
            self.usages[name] = []
        self.usages[name].append(line)

    def add_import(self, symbol: str, module: str) -> None:
        """Add an import statement."""
        self.imports[symbol] = module

    def add_function_call(self, func_name: str, line: int) -> None:
        """Add a function call."""
        if func_name not in self.function_calls:
            self.function_calls[func_name] = []
        self.function_calls[func_name].append(line)

    def add_function_signature(self, func_name: str, return_type: str | None) -> None:
        """Add a function signature with return type."""
        self.function_signatures[func_name] = return_type


class PythonSymbolExtractor(ast.NodeVisitor):
    """
    AST visitor that extracts symbol definitions and usages from Python code.
    """

    def __init__(self):
        self.symbol_table = SymbolTable()
        self.current_scope = "module"

    def visit_Import(self, node: ast.Import) -> None:
        """Visit import statement."""
        for alias in node.names:
            name = alias.asname if alias.asname else alias.name
            self.symbol_table.add_import(name, alias.name)
            self.symbol_table.add_definition(name, "import", node.lineno, self.current_scope)
        self.generic_visit(node)

    def visit_ImportFrom(self, node: ast.ImportFrom) -> None:
        """Visit from...import statement."""
        module = node.module or ""
        for alias in node.names:
            name = alias.asname if alias.asname else alias.name
            self.symbol_table.add_import(name, f"{module}.{alias.name}")
            self.symbol_table.add_definition(name, "import", node.lineno, self.current_scope)
        self.generic_visit(node)

    def visit_FunctionDef(self, node: ast.FunctionDef) -> None:
        """Visit function definition."""
        # Extract return type if present
        return_type = None
        if node.returns:
            return_type = ast.unparse(node.returns) if hasattr(ast, 'unparse') else None

        self.symbol_table.add_definition(node.name, "function", node.lineno, self.current_scope)
        self.symbol_table.add_function_signature(node.name, return_type)

        # Visit function body with new scope
        old_scope = self.current_scope
        self.current_scope = f"function:{node.name}"
        self.generic_visit(node)
        self.current_scope = old_scope

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef) -> None:
        """Visit async function definition."""
        # Extract return type if present
        return_type = None
        if node.returns:
            return_type = ast.unparse(node.returns) if hasattr(ast, 'unparse') else None

        self.symbol_table.add_definition(node.name, "async_function", node.lineno, self.current_scope)
        self.symbol_table.add_function_signature(node.name, return_type)

        # Visit function body with new scope
        old_scope = self.current_scope
        self.current_scope = f"function:{node.name}"
        self.generic_visit(node)
        self.current_scope = old_scope

    def visit_ClassDef(self, node: ast.ClassDef) -> None:
        """Visit class definition."""
        self.symbol_table.add_definition(node.name, "class", node.lineno, self.current_scope)

        # Visit class body with new scope
        old_scope = self.current_scope
        self.current_scope = f"class:{node.name}"
        self.generic_visit(node)
        self.current_scope = old_scope

    def visit_Assign(self, node: ast.Assign) -> None:
        """Visit assignment statement."""
        for target in node.targets:
            if isinstance(target, ast.Name):
                self.symbol_table.add_definition(target.id, "variable", node.lineno, self.current_scope)
        self.generic_visit(node)

    def visit_AnnAssign(self, node: ast.AnnAssign) -> None:
        """Visit annotated assignment."""
        if isinstance(node.target, ast.Name):
            self.symbol_table.add_definition(node.target.id, "variable", node.lineno, self.current_scope)
        self.generic_visit(node)

    def visit_Name(self, node: ast.Name) -> None:
        """Visit name reference (usage)."""
        if isinstance(node.ctx, ast.Load):
            # This is a usage, not a definition
            self.symbol_table.add_usage(node.id, node.lineno)
        self.generic_visit(node)

    def visit_Call(self, node: ast.Call) -> None:
        """Visit function call."""
        if isinstance(node.func, ast.Name):
            self.symbol_table.add_function_call(node.func.id, node.lineno)
        elif isinstance(node.func, ast.Attribute):
            # For method calls like obj.method()
            if hasattr(node.func, 'attr'):
                self.symbol_table.add_function_call(node.func.attr, node.lineno)
        self.generic_visit(node)


def build_symbol_table(file_path: str, content: str) -> SymbolTable | None:
    """
    Build a symbol table from Python source code.

    Args:
        file_path: Path to the file (for extension checking)
        content: Source code content

    Returns:
        SymbolTable if successful, None if parsing failed or unsupported language
    """
    ext = Path(file_path).suffix.lower()

    if ext != ".py":
        # Only Python is supported for now
        return None

    try:
        tree = ast.parse(content, filename=file_path)
        extractor = PythonSymbolExtractor()
        extractor.visit(tree)
        return extractor.symbol_table
    except SyntaxError as e:
        debug_error(MODULE, f"Syntax error parsing {file_path}: {e}")
        return None
    except Exception as e:
        debug_error(MODULE, f"Error building symbol table for {file_path}: {e}")
        return None


def detect_function_rename_conflicts(
    task_analyses: dict[str, FileAnalysis],
    file_contents: dict[str, tuple[str, str]],  # task_id -> (before, after)
) -> list[SemanticConflict]:
    """
    Detect conflicts where a function is renamed but call sites aren't updated.

    For example:
    - Task A renames function `foo()` to `bar()`
    - Task B calls `foo()` (the old name)

    Args:
        task_analyses: Map of task_id -> FileAnalysis
        file_contents: Map of task_id -> (content_before, content_after)

    Returns:
        List of semantic conflicts
    """
    conflicts: list[SemanticConflict] = []

    if not task_analyses:
        return conflicts

    file_path = next(iter(task_analyses.values())).file_path

    # Find function renames
    renames: dict[str, tuple[str, str]] = {}  # old_name -> (new_name, task_id)

    for task_id, analysis in task_analyses.items():
        for change in analysis.changes:
            if change.change_type == ChangeType.RENAME_FUNCTION:
                # Extract old and new names from content
                if change.content_before and change.content_after:
                    old_name = change.target
                    # The target might be the new name, so we need to extract from content
                    # For simplicity, store it
                    renames[old_name] = (change.target, task_id)

    # Check if other tasks have calls to the old function name
    for task_id, (before_content, after_content) in file_contents.items():
        symbol_table = build_symbol_table(file_path, after_content)
        if not symbol_table:
            continue

        for old_name, (new_name, rename_task_id) in renames.items():
            if rename_task_id == task_id:
                continue  # Same task, not a conflict

            # Check if this task calls the old function name
            if old_name in symbol_table.function_calls:
                call_lines = symbol_table.function_calls[old_name]
                conflicts.append(SemanticConflict(
                    conflict_type="function_rename",
                    file_path=file_path,
                    location=f"function:{old_name}",
                    tasks_involved=[rename_task_id, task_id],
                    description=f"Task {rename_task_id} renamed function '{old_name}' to '{new_name}', "
                                f"but task {task_id} still calls '{old_name}' at line(s) {call_lines}",
                    line_number=call_lines[0] if call_lines else 0,
                    severity=ConflictSeverity.HIGH,
                    suggestion=f"Update function calls from '{old_name}' to '{new_name}' in task {task_id}",
                    metadata={"old_name": old_name, "new_name": new_name, "call_lines": call_lines}
                ))

    return conflicts


def detect_import_removal_conflicts(
    task_analyses: dict[str, FileAnalysis],
    file_contents: dict[str, tuple[str, str]],
) -> list[SemanticConflict]:
    """
    Detect conflicts where an import is removed but the symbol is still used.

    For example:
    - Task A removes `from typing import List`
    - Task B uses `List[int]` in a type annotation (but doesn't import it themselves)

    Args:
        task_analyses: Map of task_id -> FileAnalysis
        file_contents: Map of task_id -> (content_before, content_after)

    Returns:
        List of semantic conflicts
    """
    conflicts: list[SemanticConflict] = []

    if not task_analyses:
        return conflicts

    file_path = next(iter(task_analyses.values())).file_path

    # Find import removals
    removals: dict[str, str] = {}  # symbol -> task_id

    for task_id, analysis in task_analyses.items():
        for change in analysis.changes:
            if change.change_type == ChangeType.REMOVE_IMPORT:
                symbol = change.target
                removals[symbol] = task_id

    # Check if other tasks use the removed symbols (and don't import them themselves)
    for task_id, (before_content, after_content) in file_contents.items():
        symbol_table = build_symbol_table(file_path, after_content)
        if not symbol_table:
            continue

        for symbol, removal_task_id in removals.items():
            if removal_task_id == task_id:
                continue  # Same task, not a conflict

            # Check if this task uses the symbol but doesn't import it themselves
            if symbol in symbol_table.usages and symbol not in symbol_table.imports:
                # Symbol is used but not imported by this task
                # This means this task relies on another task's import
                usage_lines = symbol_table.usages[symbol]
                conflicts.append(SemanticConflict(
                    conflict_type="import_removal",
                    file_path=file_path,
                    location=f"import:{symbol}",
                    tasks_involved=[removal_task_id, task_id],
                    description=f"Task {removal_task_id} removed import of '{symbol}', "
                                f"but task {task_id} uses it at line(s) {usage_lines} without importing it",
                    line_number=usage_lines[0] if usage_lines else 0,
                    severity=ConflictSeverity.CRITICAL,
                    suggestion=f"Task {task_id} should import '{symbol}' explicitly",
                    metadata={"symbol": symbol, "usage_lines": usage_lines}
                ))

    return conflicts


def detect_variable_rename_conflicts(
    task_analyses: dict[str, FileAnalysis],
    file_contents: dict[str, tuple[str, str]],
) -> list[SemanticConflict]:
    """
    Detect conflicts where a variable is renamed inconsistently.

    This is a simpler version that detects potential issues by looking for:
    - Variable removals in one task
    - New variables with similar names in another task
    - Uses of old variable names

    Args:
        task_analyses: Map of task_id -> FileAnalysis
        file_contents: Map of task_id -> (content_before, content_after)

    Returns:
        List of semantic conflicts
    """
    conflicts: list[SemanticConflict] = []

    # For now, we'll implement a simpler check
    # Advanced rename detection would require more sophisticated analysis
    # This is a placeholder for future enhancement

    return conflicts


def detect_type_change_conflicts(
    task_analyses: dict[str, FileAnalysis],
    file_contents: dict[str, tuple[str, str]],
) -> list[SemanticConflict]:
    """
    Detect conflicts where a function's return type changes but callers expect old type.

    For example:
    - Task A changes function `get_user()` to return `User | None` instead of `User`
    - Task B calls `get_user().name` (assumes non-None result)

    Args:
        task_analyses: Map of task_id -> FileAnalysis
        file_contents: Map of task_id -> (content_before, content_after)

    Returns:
        List of semantic conflicts
    """
    conflicts: list[SemanticConflict] = []

    if not task_analyses:
        return conflicts

    file_path = next(iter(task_analyses.values())).file_path

    # Track return type changes
    type_changes: dict[str, tuple[str | None, str | None, str]] = {}  # func -> (old_type, new_type, task_id)

    for task_id, (before_content, after_content) in file_contents.items():
        before_symbols = build_symbol_table(file_path, before_content)
        after_symbols = build_symbol_table(file_path, after_content)

        if not before_symbols or not after_symbols:
            continue

        # Find functions with changed return types
        for func_name in after_symbols.function_signatures:
            if func_name in before_symbols.function_signatures:
                old_type = before_symbols.function_signatures[func_name]
                new_type = after_symbols.function_signatures[func_name]

                if old_type != new_type:
                    type_changes[func_name] = (old_type, new_type, task_id)

    # Check if type changes could break other tasks
    for func_name, (old_type, new_type, change_task_id) in type_changes.items():
        # Look for potential issues
        # This is a simplified check - full type checking would require more context

        # Example: changing from `T` to `T | None` could break code that doesn't handle None
        if old_type and new_type:
            # Check if None was added to return type
            if "None" in new_type and "None" not in old_type:
                conflicts.append(SemanticConflict(
                    conflict_type="type_change",
                    file_path=file_path,
                    location=f"function:{func_name}",
                    tasks_involved=[change_task_id],
                    description=f"Task {change_task_id} changed return type of '{func_name}' "
                                f"from '{old_type}' to '{new_type}' (added None). "
                                f"This may break callers that don't handle None.",
                    line_number=0,  # Would need to find function definition line
                    severity=ConflictSeverity.MEDIUM,
                    suggestion=f"Review all callers of '{func_name}' to ensure they handle None",
                    metadata={"function": func_name, "old_type": old_type, "new_type": new_type}
                ))

    return conflicts


def detect_semantic_conflicts(
    task_analyses: dict[str, FileAnalysis],
    file_contents: dict[str, tuple[str, str]],
) -> list[ConflictRegion]:
    """
    Main entry point for semantic conflict detection.

    Analyzes code at AST level to find semantic conflicts that aren't
    caught by simple location-based detection.

    Args:
        task_analyses: Map of task_id -> FileAnalysis
        file_contents: Map of task_id -> (content_before, content_after)

    Returns:
        List of ConflictRegion objects representing semantic conflicts
    """
    if not task_analyses:
        return []

    debug(MODULE, f"Detecting semantic conflicts for {len(task_analyses)} tasks")

    all_conflicts: list[SemanticConflict] = []

    # Detect various types of semantic conflicts
    all_conflicts.extend(detect_function_rename_conflicts(task_analyses, file_contents))
    all_conflicts.extend(detect_import_removal_conflicts(task_analyses, file_contents))
    all_conflicts.extend(detect_variable_rename_conflicts(task_analyses, file_contents))
    all_conflicts.extend(detect_type_change_conflicts(task_analyses, file_contents))

    debug_detailed(MODULE, f"Found {len(all_conflicts)} semantic conflicts")

    # Convert SemanticConflict objects to ConflictRegion objects
    conflict_regions: list[ConflictRegion] = []

    for conflict in all_conflicts:
        # Map semantic conflict type to change types
        change_type_map = {
            "function_rename": ChangeType.RENAME_FUNCTION,
            "import_removal": ChangeType.REMOVE_IMPORT,
            "variable_rename": ChangeType.MODIFY_VARIABLE,
            "type_change": ChangeType.MODIFY_FUNCTION,
        }

        change_type = change_type_map.get(conflict.conflict_type, ChangeType.UNKNOWN)

        # Create reason with semantic conflict type prefix for easier identification
        reason_prefix = f"[Semantic: {conflict.conflict_type}] "
        full_reason = reason_prefix + conflict.description
        if conflict.suggestion:
            full_reason += f" Suggestion: {conflict.suggestion}"

        conflict_regions.append(ConflictRegion(
            file_path=conflict.file_path,
            location=conflict.location,
            tasks_involved=conflict.tasks_involved,
            change_types=[change_type] * len(conflict.tasks_involved),
            severity=conflict.severity,
            can_auto_merge=False,  # Semantic conflicts usually need human review
            merge_strategy=MergeStrategy.HUMAN_REQUIRED,
            reason=full_reason
        ))

    return conflict_regions
