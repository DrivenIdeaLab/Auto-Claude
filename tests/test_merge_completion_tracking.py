"""
Tests for merge completion tracking functionality.

Tests the _record_merge_completion function and related components that
track merge history in spec memory directories.
"""

import json
import subprocess
from datetime import datetime, timezone
from pathlib import Path
from unittest.mock import patch

import pytest

# Import after pytest since conftest sets up paths
from core.workspace import _record_merge_completion
from agents.tools_pkg.tools.memory import create_memory_tools


@pytest.fixture
def temp_project_dir(tmp_path: Path) -> Path:
    """Create a temporary project directory with git initialized."""
    project_dir = tmp_path / "test_project"
    project_dir.mkdir()

    # Initialize git repository
    subprocess.run(["git", "init"], cwd=project_dir, check=True, capture_output=True)
    subprocess.run(
        ["git", "config", "user.email", "test@example.com"],
        cwd=project_dir,
        check=True,
        capture_output=True,
    )
    subprocess.run(
        ["git", "config", "user.name", "Test User"],
        cwd=project_dir,
        check=True,
        capture_output=True,
    )

    # Create initial commit
    (project_dir / "README.md").write_text("# Test Project")
    subprocess.run(["git", "add", "."], cwd=project_dir, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Initial commit"],
        cwd=project_dir,
        check=True,
        capture_output=True,
    )

    return project_dir


@pytest.fixture
def spec_dir(temp_project_dir: Path) -> Path:
    """Create a spec directory structure."""
    spec_dir = temp_project_dir / ".auto-claude" / "specs" / "test-spec"
    spec_dir.mkdir(parents=True)
    return spec_dir


def test_record_merge_completion_basic(temp_project_dir: Path, spec_dir: Path):
    """Test basic merge completion recording."""
    resolved_files = [
        "src/main.py",
        "src/utils.py",
        "tests/test_main.py",
    ]
    conflicting_files = ["src/main.py"]
    stats = {
        "conflicts_resolved": 1,
        "ai_assisted": 1,
        "auto_merged": 2,
        "parallel_ai_merges": 1,
        "lock_files_excluded": 0,
    }

    _record_merge_completion(
        project_dir=temp_project_dir,
        spec_name="test-spec",
        resolved_files=resolved_files,
        conflicting_files=conflicting_files,
        stats=stats,
    )

    # Verify merge_history.json was created
    memory_dir = spec_dir / "memory"
    merge_history_file = memory_dir / "merge_history.json"

    assert merge_history_file.exists()

    with open(merge_history_file) as f:
        merge_history = json.load(f)

    assert "merges" in merge_history
    assert len(merge_history["merges"]) == 1

    merge_record = merge_history["merges"][0]

    # Verify merge record structure
    assert merge_record["spec_name"] == "test-spec"
    assert merge_record["files_merged"] == sorted(resolved_files)
    assert merge_record["conflicting_files"] == sorted(conflicting_files)
    assert "timestamp" in merge_record
    assert "merge_commit" in merge_record

    # Verify stats
    assert merge_record["stats"]["total_files"] == 3
    assert merge_record["stats"]["conflicts_resolved"] == 1
    assert merge_record["stats"]["ai_assisted"] == 1
    assert merge_record["stats"]["auto_merged"] == 2


def test_record_merge_completion_creates_summary(temp_project_dir: Path, spec_dir: Path):
    """Test that merge completion creates a human-readable summary."""
    resolved_files = ["src/main.py", "src/utils.py"]
    conflicting_files = ["src/main.py"]
    stats = {
        "conflicts_resolved": 1,
        "ai_assisted": 1,
        "auto_merged": 1,
    }

    _record_merge_completion(
        project_dir=temp_project_dir,
        spec_name="test-spec",
        resolved_files=resolved_files,
        conflicting_files=conflicting_files,
        stats=stats,
    )

    # Verify last_merge.md was created
    memory_dir = spec_dir / "memory"
    summary_file = memory_dir / "last_merge.md"

    assert summary_file.exists()

    summary_content = summary_file.read_text()

    # Verify summary contains expected information
    assert "# Last Merge: test-spec" in summary_content
    assert "Total files merged: 2" in summary_content
    assert "Conflicts resolved: 1" in summary_content
    assert "AI-assisted merges: 1" in summary_content
    assert "Auto-merged files: 1" in summary_content
    assert "src/main.py" in summary_content
    assert "Conflicting Files (Resolved)" in summary_content


def test_record_merge_completion_multiple_merges(temp_project_dir: Path, spec_dir: Path):
    """Test recording multiple merges in sequence."""


    # First merge
    _record_merge_completion(
        project_dir=temp_project_dir,
        spec_name="test-spec",
        resolved_files=["file1.py"],
        conflicting_files=[],
        stats={"ai_assisted": 0},
    )

    # Second merge
    _record_merge_completion(
        project_dir=temp_project_dir,
        spec_name="test-spec",
        resolved_files=["file2.py", "file3.py"],
        conflicting_files=["file2.py"],
        stats={"ai_assisted": 1, "conflicts_resolved": 1},
    )

    memory_dir = spec_dir / "memory"
    merge_history_file = memory_dir / "merge_history.json"

    with open(merge_history_file) as f:
        merge_history = json.load(f)

    assert len(merge_history["merges"]) == 2

    # Verify first merge
    assert merge_history["merges"][0]["files_merged"] == ["file1.py"]

    # Verify second merge
    assert merge_history["merges"][1]["files_merged"] == ["file2.py", "file3.py"]
    assert merge_history["merges"][1]["conflicting_files"] == ["file2.py"]


def test_record_merge_completion_limits_history(temp_project_dir: Path, spec_dir: Path):
    """Test that merge history is limited to last 50 merges."""


    # Record 60 merges
    for i in range(60):
        _record_merge_completion(
            project_dir=temp_project_dir,
            spec_name="test-spec",
            resolved_files=[f"file{i}.py"],
            conflicting_files=[],
            stats={},
        )

    memory_dir = spec_dir / "memory"
    merge_history_file = memory_dir / "merge_history.json"

    with open(merge_history_file) as f:
        merge_history = json.load(f)

    # Should only keep last 50
    assert len(merge_history["merges"]) == 50

    # Verify we kept the most recent ones (10-59)
    assert merge_history["merges"][0]["files_merged"] == ["file10.py"]
    assert merge_history["merges"][-1]["files_merged"] == ["file59.py"]


def test_record_merge_completion_captures_commit_hash(temp_project_dir: Path, spec_dir: Path):
    """Test that merge completion captures the current commit hash."""


    # Create a new commit
    test_file = temp_project_dir / "test.txt"
    test_file.write_text("test content")
    subprocess.run(["git", "add", "."], cwd=temp_project_dir, check=True, capture_output=True)
    subprocess.run(
        ["git", "commit", "-m", "Test commit"],
        cwd=temp_project_dir,
        check=True,
        capture_output=True,
    )

    # Get current commit hash
    result = subprocess.run(
        ["git", "rev-parse", "HEAD"],
        cwd=temp_project_dir,
        capture_output=True,
        text=True,
        check=True,
    )
    expected_commit = result.stdout.strip()

    _record_merge_completion(
        project_dir=temp_project_dir,
        spec_name="test-spec",
        resolved_files=["test.txt"],
        conflicting_files=[],
        stats={},
    )

    memory_dir = spec_dir / "memory"
    merge_history_file = memory_dir / "merge_history.json"

    with open(merge_history_file) as f:
        merge_history = json.load(f)

    merge_record = merge_history["merges"][0]
    assert merge_record["merge_commit"] == expected_commit


def test_record_merge_completion_handles_missing_spec_dir(temp_project_dir: Path):
    """Test that merge completion creates spec directory if it doesn't exist."""


    # Don't create spec_dir beforehand
    _record_merge_completion(
        project_dir=temp_project_dir,
        spec_name="new-spec",
        resolved_files=["file.py"],
        conflicting_files=[],
        stats={},
    )

    # Verify directory and files were created
    spec_dir = temp_project_dir / ".auto-claude" / "specs" / "new-spec"
    memory_dir = spec_dir / "memory"

    assert spec_dir.exists()
    assert memory_dir.exists()
    assert (memory_dir / "merge_history.json").exists()


def test_record_merge_completion_groups_files_by_directory(temp_project_dir: Path, spec_dir: Path):
    """Test that merge summary groups files by directory."""


    resolved_files = [
        "src/core/main.py",
        "src/core/utils.py",
        "src/api/routes.py",
        "src/api/models.py",
        "tests/test_main.py",
        "README.md",
    ]

    _record_merge_completion(
        project_dir=temp_project_dir,
        spec_name="test-spec",
        resolved_files=resolved_files,
        conflicting_files=[],
        stats={},
    )

    memory_dir = spec_dir / "memory"
    summary_file = memory_dir / "last_merge.md"
    summary_content = summary_file.read_text()

    # Verify directories are shown
    assert "src/core/" in summary_content
    assert "src/api/" in summary_content
    assert "tests/" in summary_content
    assert "./" in summary_content or "README.md" in summary_content


def test_get_merge_history_tool(temp_project_dir: Path, spec_dir: Path):
    """Test the get_merge_history agent tool."""
    # Record a merge first
    _record_merge_completion(
        project_dir=temp_project_dir,
        spec_name="test-spec",
        resolved_files=["file1.py", "file2.py"],
        conflicting_files=["file1.py"],
        stats={
            "conflicts_resolved": 1,
            "ai_assisted": 1,
            "auto_merged": 1,
        },
    )

    # Verify merge_history.json was created
    memory_dir = spec_dir / "memory"
    merge_history_file = memory_dir / "merge_history.json"
    assert merge_history_file.exists()

    # Read and verify directly (skip tool test if SDK not available)
    try:
        tools = create_memory_tools(spec_dir=spec_dir, project_dir=temp_project_dir)
        if not tools:
            pytest.skip("SDK tools not available")

        # Find get_merge_history tool
        get_merge_history_tool = None
        for tool in tools:
            if hasattr(tool, "__name__") and tool.__name__ == "get_merge_history":
                get_merge_history_tool = tool
                break

        if get_merge_history_tool is None:
            pytest.skip("get_merge_history tool not available")

        # Call the tool
        import asyncio

        result = asyncio.run(get_merge_history_tool({}))

        # Verify result contains expected information
        content_text = result["content"][0]["text"]

        assert "Merge History" in content_text
        assert "Total merges: 1" in content_text
        assert "Total files merged: 2" in content_text
        assert "Conflicts resolved: 1" in content_text
        assert "AI-assisted merges: 1" in content_text
    except ImportError:
        pytest.skip("SDK not available for tool testing")


def test_get_merge_history_tool_no_history(temp_project_dir: Path, spec_dir: Path):
    """Test get_merge_history tool when no history exists."""
    try:
        tools = create_memory_tools(spec_dir=spec_dir, project_dir=temp_project_dir)
        if not tools:
            pytest.skip("SDK tools not available")

        get_merge_history_tool = None
        for tool in tools:
            if hasattr(tool, "__name__") and tool.__name__ == "get_merge_history":
                get_merge_history_tool = tool
                break

        if get_merge_history_tool is None:
            pytest.skip("get_merge_history tool not available")

        import asyncio

        result = asyncio.run(get_merge_history_tool({}))

        content_text = result["content"][0]["text"]
        assert "No merge history found" in content_text
    except ImportError:
        pytest.skip("SDK not available for tool testing")


def test_record_merge_completion_error_handling(temp_project_dir: Path):
    """Test that merge completion handles errors gracefully."""


    # This should not raise an exception even if git commands fail
    with patch("subprocess.run", side_effect=Exception("Git error")):
        _record_merge_completion(
            project_dir=temp_project_dir,
            spec_name="test-spec",
            resolved_files=["file.py"],
            conflicting_files=[],
            stats={},
        )

    # Verify files were still created (commit hash will be None)
    spec_dir = temp_project_dir / ".auto-claude" / "specs" / "test-spec"
    memory_dir = spec_dir / "memory"
    merge_history_file = memory_dir / "merge_history.json"

    assert merge_history_file.exists()

    with open(merge_history_file) as f:
        merge_history = json.load(f)

    merge_record = merge_history["merges"][0]
    assert merge_record["merge_commit"] is None
