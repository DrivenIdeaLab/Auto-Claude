"""
Example demonstrating semantic conflict detection.

This script shows how semantic conflict detection can catch issues
that simple line-based diff analysis would miss.
"""

import sys
from pathlib import Path

# Add parent directories to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent.parent))

from merge.semantic_conflict_detector import (
    detect_semantic_conflicts,
    build_symbol_table,
)
from merge.types import ChangeType, FileAnalysis, SemanticChange


def example_import_removal_conflict():
    """
    Example: Task A removes an import, Task B uses it.

    This is a critical error that would cause a runtime failure,
    but might not be caught by simple diff analysis if the changes
    are in different parts of the file.
    """
    print("=" * 60)
    print("Example 1: Import Removal Conflict")
    print("=" * 60)

    file_path = "example.py"

    # Task A removes an unused import
    task_a_changes = FileAnalysis(
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
    )

    # Task B adds a function that uses Dict
    task_b_changes = FileAnalysis(
        file_path=file_path,
        changes=[
            SemanticChange(
                change_type=ChangeType.ADD_FUNCTION,
                target="process_data",
                location="function:process_data",
                line_start=10,
                line_end=15,
            )
        ],
    )

    # File contents
    before_b = """
def existing_function():
    return []
"""

    after_b = """
def existing_function():
    return []

def process_data(config: Dict[str, str]) -> None:
    for key, value in config.items():
        print(f"{key}: {value}")
"""

    # Detect conflicts
    task_analyses = {
        "task-a": task_a_changes,
        "task-b": task_b_changes,
    }

    file_contents = {
        "task-b": (before_b, after_b),
    }

    conflicts = detect_semantic_conflicts(task_analyses, file_contents)

    print("\nDetected conflicts:")
    for conflict in conflicts:
        print(f"\n  Severity: {conflict.severity.value.upper()}")
        print(f"  Location: {conflict.location}")
        print(f"  Tasks: {', '.join(conflict.tasks_involved)}")
        print(f"  Description: {conflict.reason}")

    if not conflicts:
        print("\n  No conflicts detected!")

    print()


def example_type_change_conflict():
    """
    Example: Function return type changes from T to T | None.

    This could break code that doesn't handle None, but wouldn't
    be caught by diff analysis unless you manually review all callers.
    """
    print("=" * 60)
    print("Example 2: Type Change Conflict")
    print("=" * 60)

    file_path = "user_service.py"

    task_changes = FileAnalysis(
        file_path=file_path,
        changes=[
            SemanticChange(
                change_type=ChangeType.MODIFY_FUNCTION,
                target="get_user_by_id",
                location="function:get_user_by_id",
                line_start=5,
                line_end=8,
            )
        ],
    )

    before = """
from models import User

def get_user_by_id(user_id: int) -> User:
    user = database.query(User).get(user_id)
    return user
"""

    after = """
from models import User

def get_user_by_id(user_id: int) -> User | None:
    user = database.query(User).get(user_id)
    return user  # Can be None now
"""

    task_analyses = {
        "task-a": task_changes,
    }

    file_contents = {
        "task-a": (before, after),
    }

    conflicts = detect_semantic_conflicts(task_analyses, file_contents)

    print("\nDetected conflicts:")
    for conflict in conflicts:
        print(f"\n  Severity: {conflict.severity.value.upper()}")
        print(f"  Location: {conflict.location}")
        print(f"  Description: {conflict.reason}")

    if not conflicts:
        print("\n  No conflicts detected!")

    print()


def example_symbol_table():
    """
    Example: Building and inspecting a symbol table.

    Shows what information is extracted from Python code.
    """
    print("=" * 60)
    print("Example 3: Symbol Table Inspection")
    print("=" * 60)

    code = """
from typing import List, Dict
import os

class UserService:
    def __init__(self):
        self.cache: Dict[int, str] = {}

    def get_users(self) -> List[str]:
        return list(self.cache.values())

def process_users(users: List[str]) -> None:
    for user in users:
        print(user)

service = UserService()
all_users = service.get_users()
process_users(all_users)
"""

    table = build_symbol_table("example.py", code)

    print("\nExtracted Information:")
    print("\n1. Imports:")
    for symbol, module in table.imports.items():
        print(f"   - {symbol} from {module}")

    print("\n2. Definitions:")
    for name, (def_type, line, scope) in table.definitions.items():
        print(f"   - {name}: {def_type} at line {line} (scope: {scope})")

    print("\n3. Function Signatures:")
    for func, return_type in table.function_signatures.items():
        if return_type:
            print(f"   - {func}() -> {return_type}")
        else:
            print(f"   - {func}() -> (no annotation)")

    print("\n4. Function Calls:")
    for func, lines in table.function_calls.items():
        print(f"   - {func}() called at line(s): {lines}")

    print()


def main():
    """Run all examples."""
    print("\n" + "=" * 60)
    print("SEMANTIC CONFLICT DETECTION EXAMPLES")
    print("=" * 60 + "\n")

    example_import_removal_conflict()
    example_type_change_conflict()
    example_symbol_table()

    print("=" * 60)
    print("Examples complete!")
    print("=" * 60 + "\n")


if __name__ == "__main__":
    main()
