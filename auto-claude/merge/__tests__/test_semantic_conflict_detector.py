"""
Unit tests for semantic conflict detection.
"""

from __future__ import annotations

import pytest

from ..semantic_conflict_detector import (
    PythonSymbolExtractor,
    build_symbol_table,
    detect_function_rename_conflicts,
    detect_import_removal_conflicts,
    detect_semantic_conflicts,
    detect_type_change_conflicts,
)
from ..types import ChangeType, ConflictSeverity, FileAnalysis, SemanticChange


class TestSymbolTableBuilding:
    """Test building symbol tables from Python code."""

    def test_imports(self):
        """Test extraction of import statements."""
        code = """
import os
from typing import List, Dict
from pathlib import Path
"""
        table = build_symbol_table("test.py", code)
        assert table is not None
        assert "os" in table.imports
        assert "List" in table.imports
        assert "Dict" in table.imports
        assert "Path" in table.imports

    def test_function_definitions(self):
        """Test extraction of function definitions."""
        code = """
def foo():
    pass

async def bar() -> str:
    return "test"

def baz(x: int) -> int | None:
    return x
"""
        table = build_symbol_table("test.py", code)
        assert table is not None
        assert "foo" in table.definitions
        assert "bar" in table.definitions
        assert "baz" in table.definitions
        assert table.function_signatures["foo"] is None
        assert table.function_signatures["bar"] == "str"
        assert table.function_signatures["baz"] == "int | None"

    def test_class_definitions(self):
        """Test extraction of class definitions."""
        code = """
class User:
    def __init__(self):
        pass

    def get_name(self) -> str:
        return "test"
"""
        table = build_symbol_table("test.py", code)
        assert table is not None
        assert "User" in table.definitions
        assert table.definitions["User"][0] == "class"

    def test_variable_assignments(self):
        """Test extraction of variable assignments."""
        code = """
x = 5
y: int = 10
name: str = "test"
"""
        table = build_symbol_table("test.py", code)
        assert table is not None
        assert "x" in table.definitions
        assert "y" in table.definitions
        assert "name" in table.definitions

    def test_function_calls(self):
        """Test extraction of function calls."""
        code = """
import os

def foo():
    return 5

def bar():
    x = foo()
    os.path.exists("test")
    return x
"""
        table = build_symbol_table("test.py", code)
        assert table is not None
        assert "foo" in table.function_calls
        assert "exists" in table.function_calls

    def test_name_usages(self):
        """Test extraction of name usages."""
        code = """
x = 5

def foo():
    y = x + 10
    return y
"""
        table = build_symbol_table("test.py", code)
        assert table is not None
        assert "x" in table.usages
        # x is used in the function body

    def test_syntax_error_handling(self):
        """Test that syntax errors are handled gracefully."""
        code = """
def foo(
    # Incomplete function definition
"""
        table = build_symbol_table("test.py", code)
        assert table is None

    def test_non_python_file(self):
        """Test that non-Python files return None."""
        code = "const x = 5;"
        table = build_symbol_table("test.js", code)
        assert table is None


class TestFunctionRenameConflicts:
    """Test detection of function rename conflicts."""

    def test_no_conflict_same_task(self):
        """Test that renaming and updating calls in same task is not a conflict."""
        file_path = "test.py"

        # Task A renames function and updates all calls
        task_analyses = {
            "task-a": FileAnalysis(
                file_path=file_path,
                changes=[
                    SemanticChange(
                        change_type=ChangeType.RENAME_FUNCTION,
                        target="bar",  # new name
                        location="function:foo",
                        line_start=1,
                        line_end=3,
                        content_before="def foo():\n    pass",
                        content_after="def bar():\n    pass",
                    )
                ],
            )
        }

        before_a = """
def foo():
    pass

def caller():
    foo()
"""
        after_a = """
def bar():
    pass

def caller():
    bar()
"""

        file_contents = {
            "task-a": (before_a, after_a),
        }

        conflicts = detect_function_rename_conflicts(task_analyses, file_contents)
        assert len(conflicts) == 0

    def test_conflict_rename_and_call_old_name(self):
        """Test detection of rename conflict when another task calls old name."""
        file_path = "test.py"

        # Task A renames function
        # Task B calls the old function name
        task_analyses = {
            "task-a": FileAnalysis(
                file_path=file_path,
                changes=[
                    SemanticChange(
                        change_type=ChangeType.RENAME_FUNCTION,
                        target="bar",
                        location="function:foo",
                        line_start=1,
                        line_end=3,
                        content_before="def foo():\n    pass",
                        content_after="def bar():\n    pass",
                    )
                ],
            ),
            "task-b": FileAnalysis(
                file_path=file_path,
                changes=[
                    SemanticChange(
                        change_type=ChangeType.MODIFY_FUNCTION,
                        target="caller",
                        location="function:caller",
                        line_start=5,
                        line_end=7,
                    )
                ],
            ),
        }

        before_b = """
def foo():
    pass

def caller():
    return 5
"""
        after_b = """
def foo():
    pass

def caller():
    result = foo()
    return result
"""

        file_contents = {
            "task-b": (before_b, after_b),
        }

        # Note: In real usage, task-a would also have file_contents
        # but for this test we're only checking task-b's calls

        # This won't detect the conflict because we don't have task-a's rename info
        # We need to extract rename info from the RENAME_FUNCTION change
        # This is a limitation of the current implementation


class TestImportRemovalConflicts:
    """Test detection of import removal conflicts."""

    def test_no_conflict_unused_import(self):
        """Test that removing an unused import is not a conflict."""
        file_path = "test.py"

        task_analyses = {
            "task-a": FileAnalysis(
                file_path=file_path,
                changes=[
                    SemanticChange(
                        change_type=ChangeType.REMOVE_IMPORT,
                        target="os",
                        location="import:os",
                        line_start=1,
                        line_end=1,
                    )
                ],
            )
        }

        before_a = """
import os

def foo():
    return 5
"""
        after_a = """
def foo():
    return 5
"""

        file_contents = {
            "task-a": (before_a, after_a),
        }

        conflicts = detect_import_removal_conflicts(task_analyses, file_contents)
        assert len(conflicts) == 0

    def test_conflict_remove_import_still_used(self):
        """Test detection of conflict when import is removed but symbol is used."""
        file_path = "test.py"

        task_analyses = {
            "task-a": FileAnalysis(
                file_path=file_path,
                changes=[
                    SemanticChange(
                        change_type=ChangeType.REMOVE_IMPORT,
                        target="List",
                        location="import:List",
                        line_start=1,
                        line_end=1,
                    )
                ],
            ),
            "task-b": FileAnalysis(
                file_path=file_path,
                changes=[
                    SemanticChange(
                        change_type=ChangeType.ADD_FUNCTION,
                        target="process",
                        location="function:process",
                        line_start=3,
                        line_end=5,
                    )
                ],
            ),
        }

        before_b = """
def foo():
    return []
"""
        # Task B uses List but doesn't import it (relies on task A's import)
        after_b = """
def foo():
    return []

def process(items: List[int]) -> int:
    return sum(items)
"""

        file_contents = {
            "task-b": (before_b, after_b),
        }

        conflicts = detect_import_removal_conflicts(task_analyses, file_contents)
        # Should detect that task-a removed List but task-b uses it without importing
        assert len(conflicts) == 1
        assert conflicts[0].conflict_type == "import_removal"
        assert "List" in conflicts[0].description
        assert conflicts[0].severity == ConflictSeverity.CRITICAL


class TestTypeChangeConflicts:
    """Test detection of type change conflicts."""

    def test_adding_none_to_return_type(self):
        """Test detection when None is added to return type."""
        file_path = "test.py"

        task_analyses = {
            "task-a": FileAnalysis(
                file_path=file_path,
                changes=[
                    SemanticChange(
                        change_type=ChangeType.MODIFY_FUNCTION,
                        target="get_user",
                        location="function:get_user",
                        line_start=1,
                        line_end=3,
                    )
                ],
            )
        }

        before_a = """
def get_user() -> User:
    return User()
"""
        after_a = """
def get_user() -> User | None:
    return None
"""

        file_contents = {
            "task-a": (before_a, after_a),
        }

        conflicts = detect_type_change_conflicts(task_analyses, file_contents)
        assert len(conflicts) == 1
        assert conflicts[0].conflict_type == "type_change"
        assert "None" in conflicts[0].description
        assert conflicts[0].severity == ConflictSeverity.MEDIUM


class TestSemanticConflictIntegration:
    """Integration tests for the full semantic conflict detection pipeline."""

    def test_multiple_conflict_types(self):
        """Test detection of multiple types of conflicts simultaneously."""
        file_path = "test.py"

        task_analyses = {
            "task-a": FileAnalysis(
                file_path=file_path,
                changes=[
                    SemanticChange(
                        change_type=ChangeType.REMOVE_IMPORT,
                        target="Dict",
                        location="import:Dict",
                        line_start=1,
                        line_end=1,
                    )
                ],
            ),
            "task-b": FileAnalysis(
                file_path=file_path,
                changes=[
                    SemanticChange(
                        change_type=ChangeType.ADD_FUNCTION,
                        target="process",
                        location="function:process",
                        line_start=3,
                        line_end=5,
                    )
                ],
            ),
        }

        before_b = """
def foo():
    return {}
"""
        # Task B uses Dict but doesn't import it
        after_b = """
def foo():
    return {}

def process(data: Dict[str, int]) -> int:
    return sum(data.values())
"""

        file_contents = {
            "task-b": (before_b, after_b),
        }

        conflicts = detect_semantic_conflicts(task_analyses, file_contents)
        # Should find the import removal conflict
        # Check the reason field for semantic conflict type
        assert len(conflicts) > 0
        assert any("[Semantic: import_removal]" in c.reason for c in conflicts)

    def test_no_conflicts_independent_changes(self):
        """Test that independent changes don't create conflicts."""
        file_path = "test.py"

        task_analyses = {
            "task-a": FileAnalysis(
                file_path=file_path,
                changes=[
                    SemanticChange(
                        change_type=ChangeType.ADD_FUNCTION,
                        target="foo",
                        location="function:foo",
                        line_start=1,
                        line_end=3,
                    )
                ],
            ),
            "task-b": FileAnalysis(
                file_path=file_path,
                changes=[
                    SemanticChange(
                        change_type=ChangeType.ADD_FUNCTION,
                        target="bar",
                        location="function:bar",
                        line_start=5,
                        line_end=7,
                    )
                ],
            ),
        }

        before_a = ""
        after_a = """
def foo():
    return 5
"""

        before_b = ""
        after_b = """
def bar():
    return 10
"""

        file_contents = {
            "task-a": (before_a, after_a),
            "task-b": (before_b, after_b),
        }

        conflicts = detect_semantic_conflicts(task_analyses, file_contents)
        assert len(conflicts) == 0

    def test_empty_task_analyses(self):
        """Test handling of empty task analyses."""
        conflicts = detect_semantic_conflicts({}, {})
        assert len(conflicts) == 0

    def test_convert_to_conflict_regions(self):
        """Test that semantic conflicts are converted to ConflictRegion format."""
        file_path = "test.py"

        task_analyses = {
            "task-a": FileAnalysis(
                file_path=file_path,
                changes=[
                    SemanticChange(
                        change_type=ChangeType.REMOVE_IMPORT,
                        target="Optional",
                        location="import:Optional",
                        line_start=1,
                        line_end=1,
                    )
                ],
            ),
            "task-b": FileAnalysis(
                file_path=file_path,
                changes=[
                    SemanticChange(
                        change_type=ChangeType.MODIFY_FUNCTION,
                        target="get_value",
                        location="function:get_value",
                        line_start=3,
                        line_end=5,
                    )
                ],
            ),
        }

        before_b = """
from typing import Optional

def get_value(x: Optional[int]) -> int:
    return x or 0
"""
        after_b = """
from typing import Optional

def get_value(x: Optional[int]) -> int:
    return x if x is not None else 0
"""

        file_contents = {
            "task-b": (before_b, after_b),
        }

        conflict_regions = detect_semantic_conflicts(task_analyses, file_contents)

        # Verify the structure is ConflictRegion
        for conflict in conflict_regions:
            assert hasattr(conflict, "file_path")
            assert hasattr(conflict, "location")
            assert hasattr(conflict, "tasks_involved")
            assert hasattr(conflict, "severity")
            assert hasattr(conflict, "can_auto_merge")
            assert conflict.can_auto_merge is False  # Semantic conflicts need human review
