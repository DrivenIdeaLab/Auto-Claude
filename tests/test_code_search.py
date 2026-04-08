import pytest
from pathlib import Path
import shutil
import os
import sys

# Ensure auto-claude is in path
sys.path.append(os.path.join(os.getcwd(), "auto-claude"))

from context.search import CodeSearcher
from context.constants import SKIP_DIRS, CODE_EXTENSIONS

@pytest.fixture
def temp_project(tmp_path):
    # Create a dummy project structure
    project_dir = tmp_path / "project"
    project_dir.mkdir()

    # Root files
    (project_dir / "main.py").touch()
    (project_dir / "README.md").touch() # Not a code file extension usually

    # Src files
    src_dir = project_dir / "src"
    src_dir.mkdir()
    (src_dir / "app.ts").touch()
    (src_dir / "styles.css").touch() # Not a code file

    # Skip directory at root
    node_modules = project_dir / "node_modules"
    node_modules.mkdir()
    (node_modules / "lib.js").touch()

    # Nested skip directory
    nested_skip = src_dir / "__pycache__"
    nested_skip.mkdir()
    (nested_skip / "cache.pyc").touch()
    (nested_skip / "some_code.py").touch() # Should be skipped because parent is in SKIP_DIRS

    return project_dir

def test_iter_code_files(temp_project):
    searcher = CodeSearcher(temp_project)
    files = list(searcher._iter_code_files(temp_project))

    filenames = {f.name for f in files}

    # Should find these
    assert "main.py" in filenames
    assert "app.ts" in filenames

    # Should NOT find these (wrong extension)
    assert "README.md" not in filenames
    assert "styles.css" not in filenames

    # Should NOT find these (in skip dirs)
    assert "lib.js" not in filenames
    assert "cache.pyc" not in filenames
    assert "some_code.py" not in filenames

    # Verify we got exactly what we expected
    # Depending on CODE_EXTENSIONS, .py and .ts should be there.
    expected_files = {temp_project / "main.py", temp_project / "src" / "app.ts"}
    assert set(files) == expected_files

def test_skip_dirs_at_all_levels(temp_project):
    # Ensure nested skip dirs are also skipped
    searcher = CodeSearcher(temp_project)

    # Create another nested skip dir
    deep_dir = temp_project / "src" / "deep"
    deep_dir.mkdir()
    venv_dir = deep_dir / "venv"
    venv_dir.mkdir()
    (venv_dir / "active.py").touch()

    files = list(searcher._iter_code_files(temp_project))
    filenames = {f.name for f in files}
    assert "active.py" not in filenames
