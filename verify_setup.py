#!/usr/bin/env python3
"""
Auto Claude Setup Verification Script
Checks all configuration and dependencies are correctly set up
"""

import os
import sys
from pathlib import Path

# Fix for Windows encoding issues with emojis
if sys.platform == "win32":
    os.environ["PYTHONIOENCODING"] = "utf-8"
    import io
    sys.stdout = io.TextIOWrapper(sys.stdout.buffer, encoding="utf-8")

def check_env_file():
    """Check if .env file exists and has required settings"""
    env_path = Path("auto-claude/.env")

    print("📋 Checking .env file...")
    if not env_path.exists():
        print("  ❌ .env file not found")
        return False

    print(f"  ✅ .env file found at {env_path}")

    with open(env_path) as f:
        content = f.read()

    required_keys = [
        "CLAUDE_CODE_OAUTH_TOKEN",
        "GRAPHITI_ENABLED",
        "GRAPHITI_FALKORDB_HOST",
        "GRAPHITI_FALKORDB_PORT",
    ]

    missing = []
    for key in required_keys:
        if key not in content:
            missing.append(key)
        else:
            # Check if it has a value
            for line in content.split("\n"):
                if line.startswith(key + "="):
                    value = line.split("=", 1)[1].strip()
                    if value and not value.startswith("#"):
                        print(f"  ✅ {key} configured")
                    else:
                        print(f"  ⚠️  {key} found but not set")

    if missing:
        print(f"  ❌ Missing keys: {', '.join(missing)}")
        return False

    return True

def check_python_packages():
    """Check if required Python packages are installed"""
    print("\n📦 Checking Python packages...")

    required_packages = [
        ("anthropic", "Anthropic SDK"),
        ("graphiti", "Graphiti Memory"),
        ("falkordb", "FalkorDB Client"),
    ]

    all_present = True
    for package, name in required_packages:
        try:
            __import__(package)
            print(f"  ✅ {name} ({package})")
        except ImportError:
            print(f"  ❌ {name} ({package}) - NOT INSTALLED")
            all_present = False

    return all_present

def check_cli_available():
    """Check if claude CLI is available"""
    print("\n🔐 Checking Claude CLI...")

    try:
        result = os.system("claude --version > /dev/null 2>&1")
        if result == 0:
            print("  ✅ Claude CLI available")
            return True
        else:
            print("  ❌ Claude CLI not found in PATH")
            return False
    except Exception as e:
        print(f"  ❌ Error checking Claude CLI: {e}")
        return False

def check_docker():
    """Check if Docker is available"""
    print("\n🐳 Checking Docker...")

    try:
        result = os.system("docker --version > /dev/null 2>&1")
        if result == 0:
            print("  ✅ Docker available")
            return True
        else:
            print("  ❌ Docker not installed")
            return False
    except Exception as e:
        print(f"  ❌ Error checking Docker: {e}")
        return False

def main():
    """Run all checks"""
    print("=" * 60)
    print("Auto Claude Setup Verification")
    print("=" * 60)

    # Change to project root
    if os.path.exists("auto-claude"):
        os.chdir(Path.cwd())

    checks = [
        ("Environment File", check_env_file),
        ("Python Packages", check_python_packages),
        ("Claude CLI", check_cli_available),
        ("Docker", check_docker),
    ]

    results = {}
    for name, check_fn in checks:
        try:
            results[name] = check_fn()
        except Exception as e:
            print(f"\n❌ Error during {name} check: {e}")
            results[name] = False

    print("\n" + "=" * 60)
    print("Summary")
    print("=" * 60)

    for name, passed in results.items():
        status = "✅" if passed else "❌"
        print(f"{status} {name}")

    print("\n" + "=" * 60)

    if all(results.values()):
        print("✅ All checks passed! Auto Claude is ready to use.")
        print("\nNext steps:")
        print("  1. Start FalkorDB (if not already running):")
        print("     docker-compose up -d falkordb")
        print("  2. Create your first spec:")
        print("     python auto-claude/spec_runner.py --interactive")
        print("  3. Run a build:")
        print("     python auto-claude/run.py --spec 001")
        return 0
    else:
        print("❌ Some checks failed. Please review the output above.")
        print("\nCommon fixes:")
        print("  - Missing packages: pip install -r auto-claude/requirements.txt")
        print("  - Missing .env: Copy from auto-claude/.env.example")
        print("  - Claude CLI: Visit https://claude.com/claude-code")
        return 1

if __name__ == "__main__":
    sys.exit(main())
