"""
Linear Updater - Python-Orchestrated Linear Updates
====================================================

Provides reliable Linear updates via focused mini-agent calls.
Instead of relying on agents to remember Linear updates in long prompts,
the Python orchestrator triggers small, focused agents at key transitions.

Design Principles:
- ONE task per spec (not one issue per subtask)
- Python orchestrator controls when updates happen
- Small prompts that can't lose context
- Graceful degradation if Linear unavailable
- Robust error handling with retry and fallback

Status Flow:
  Todo -> In Progress -> In Review -> (human) -> Done
    |         |              |
    |         |              +-- QA approved, awaiting human merge
    |         +-- Planner/Coder working
    +-- Task created from spec

Error Handling:
- Retry with exponential backoff for transient failures
- Connection status caching to avoid repeated failures
- Never fail builds due to Linear unavailability
- Clear logging of Linear integration status
"""

import json
import logging
import os
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from typing import Optional

from claude_agent_sdk import ClaudeAgentOptions, ClaudeSDKClient

from .error_handling import (
    LinearAvailability,
    RetryConfig,
    get_linear_status,
    linear_operation_with_fallback,
    log_linear_status,
)

logger = logging.getLogger(__name__)

# Linear status constants (matching Valma AI team setup)
STATUS_TODO = "Todo"
STATUS_IN_PROGRESS = "In Progress"
STATUS_IN_REVIEW = "In Review"  # Custom status for QA phase
STATUS_DONE = "Done"
STATUS_CANCELED = "Canceled"

# State file name
LINEAR_TASK_FILE = ".linear_task.json"

# Linear MCP tools needed for updates
LINEAR_TOOLS = [
    "mcp__linear-server__list_teams",
    "mcp__linear-server__create_issue",
    "mcp__linear-server__update_issue",
    "mcp__linear-server__create_comment",
    "mcp__linear-server__list_issue_statuses",
]


@dataclass
class LinearTaskState:
    """State of a Linear task for an auto-claude spec."""

    task_id: str | None = None
    task_title: str | None = None
    team_id: str | None = None
    status: str = STATUS_TODO
    created_at: str | None = None

    def to_dict(self) -> dict:
        return {
            "task_id": self.task_id,
            "task_title": self.task_title,
            "team_id": self.team_id,
            "status": self.status,
            "created_at": self.created_at,
        }

    @classmethod
    def from_dict(cls, data: dict) -> "LinearTaskState":
        return cls(
            task_id=data.get("task_id"),
            task_title=data.get("task_title"),
            team_id=data.get("team_id"),
            status=data.get("status", STATUS_TODO),
            created_at=data.get("created_at"),
        )

    def save(self, spec_dir: Path) -> None:
        """Save state to the spec directory."""
        state_file = spec_dir / LINEAR_TASK_FILE
        with open(state_file, "w") as f:
            json.dump(self.to_dict(), f, indent=2)

    @classmethod
    def load(cls, spec_dir: Path) -> Optional["LinearTaskState"]:
        """Load state from the spec directory."""
        state_file = spec_dir / LINEAR_TASK_FILE
        if not state_file.exists():
            return None

        try:
            with open(state_file) as f:
                return cls.from_dict(json.load(f))
        except (OSError, json.JSONDecodeError):
            return None


def is_linear_enabled() -> bool:
    """Check if Linear integration is available."""
    return bool(os.environ.get("LINEAR_API_KEY"))


def get_linear_api_key() -> str:
    """Get the Linear API key from environment."""
    return os.environ.get("LINEAR_API_KEY", "")


def _create_linear_client() -> ClaudeSDKClient:
    """
    Create a minimal Claude client with only Linear MCP tools.
    Used for focused mini-agent calls.
    """
    from core.auth import (
        ensure_claude_code_oauth_token,
        get_sdk_env_vars,
        require_auth_token,
    )

    require_auth_token()  # Raises ValueError if no token found
    ensure_claude_code_oauth_token()

    linear_api_key = get_linear_api_key()
    if not linear_api_key:
        raise ValueError("LINEAR_API_KEY not set")

    sdk_env = get_sdk_env_vars()

    return ClaudeSDKClient(
        options=ClaudeAgentOptions(
            model="claude-haiku-4-5",  # Fast & cheap model for simple API calls
            system_prompt="You are a Linear API assistant. Execute the requested Linear operation precisely.",
            allowed_tools=LINEAR_TOOLS,
            mcp_servers={
                "linear": {
                    "type": "http",
                    "url": "https://mcp.linear.app/mcp",
                    "headers": {"Authorization": f"Bearer {linear_api_key}"},
                }
            },
            max_turns=10,  # Should complete in 1-3 turns
            env=sdk_env,  # Pass ANTHROPIC_BASE_URL etc. to subprocess
        )
    )


async def _run_linear_agent_impl(prompt: str) -> str:
    """
    Internal implementation of Linear agent execution.

    This function performs the actual Linear API call and may raise exceptions.
    Use _run_linear_agent() for the error-handled version.

    Args:
        prompt: The focused prompt for the Linear operation

    Returns:
        The response text

    Raises:
        Exception: If Linear operation fails
    """
    client = _create_linear_client()

    async with client:
        await client.query(prompt)

        response_text = ""
        async for msg in client.receive_response():
            msg_type = type(msg).__name__
            if msg_type == "AssistantMessage" and hasattr(msg, "content"):
                for block in msg.content:
                    block_type = type(block).__name__
                    if block_type == "TextBlock" and hasattr(block, "text"):
                        response_text += block.text

        if not response_text:
            raise ValueError("Linear agent returned empty response")

        return response_text


async def _run_linear_agent(
    prompt: str, operation_name: str = "Linear operation"
) -> str | None:
    """
    Run a focused mini-agent for a Linear operation with error handling.

    This is the error-handled wrapper around _run_linear_agent_impl().
    It uses retry logic and graceful degradation.

    Args:
        prompt: The focused prompt for the Linear operation
        operation_name: Name of the operation for logging

    Returns:
        The response text, or None if failed after retries
    """
    # Custom retry config for Linear agents (longer timeout due to MCP overhead)
    config = RetryConfig(
        max_retries=3,
        initial_delay=2.0,
        max_delay=30.0,
        timeout=30.0,  # Linear MCP operations can take longer
    )

    result = await linear_operation_with_fallback(
        _run_linear_agent_impl,
        prompt,
        operation_name=operation_name,
        fallback_result=None,
        config=config,
    )

    return result


async def create_linear_task(
    spec_dir: Path,
    title: str,
    description: str | None = None,
) -> LinearTaskState | None:
    """
    Create a new Linear task for a spec with error handling.

    Called by spec_runner.py after requirements gathering.
    If Linear is unavailable, returns None and logs a warning.

    Args:
        spec_dir: Spec directory to save state
        title: Task title (the task name from user)
        description: Optional task description

    Returns:
        LinearTaskState if successful, None if Linear unavailable or failed
    """
    if not is_linear_enabled():
        logger.info("Linear integration disabled (no API key)")
        return None

    # Log Linear status
    log_linear_status(spec_dir)

    # Check if Linear is available
    status = get_linear_status()
    if status == LinearAvailability.UNAVAILABLE:
        logger.warning(
            f"Skipping Linear task creation - service unavailable. "
            f"Build will continue without Linear integration."
        )
        return None

    # Check if task already exists
    existing = LinearTaskState.load(spec_dir)
    if existing and existing.task_id:
        logger.info(f"Linear task already exists: {existing.task_id}")
        print(f"Linear task already exists: {existing.task_id}")
        return existing

    desc_part = f'\n   - description: "{description}"' if description else ""

    prompt = f"""Create a Linear task with these details:

1. First, use mcp__linear-server__list_teams to find the team ID
2. Then, use mcp__linear-server__create_issue with:
   - teamId: [the team ID from step 1]
   - title: "{title}"{desc_part}

After creating the issue, tell me:
- The issue ID (like "VAL-123")
- The team ID you used

Format your final response as:
TASK_ID: [the issue ID]
TEAM_ID: [the team ID]
"""

    response = await _run_linear_agent(prompt, operation_name="create Linear task")
    if not response:
        logger.warning(
            "Linear task creation failed, continuing build without Linear tracking"
        )
        return None

    # Parse response for task_id and team_id
    task_id = None
    team_id = None

    for line in response.split("\n"):
        line = line.strip()
        if line.startswith("TASK_ID:"):
            task_id = line.replace("TASK_ID:", "").strip()
        elif line.startswith("TEAM_ID:"):
            team_id = line.replace("TEAM_ID:", "").strip()

    if not task_id:
        print(f"Failed to parse task ID from response: {response[:200]}")
        return None

    # Create and save state
    state = LinearTaskState(
        task_id=task_id,
        task_title=title,
        team_id=team_id,
        status=STATUS_TODO,
        created_at=datetime.now().isoformat(),
    )
    state.save(spec_dir)

    print(f"Created Linear task: {task_id}")
    return state


async def update_linear_status(
    spec_dir: Path,
    new_status: str,
) -> bool:
    """
    Update the Linear task status with error handling.

    If Linear is unavailable, logs a warning and continues gracefully.

    Args:
        spec_dir: Spec directory with .linear_task.json
        new_status: New status (STATUS_TODO, STATUS_IN_PROGRESS, STATUS_IN_REVIEW, STATUS_DONE)

    Returns:
        True if successful, False if failed or Linear unavailable
    """
    if not is_linear_enabled():
        logger.debug("Linear integration disabled, skipping status update")
        return False

    state = LinearTaskState.load(spec_dir)
    if not state or not state.task_id:
        logger.info("No Linear task found for this spec, skipping status update")
        return False

    # Don't update if already at this status
    if state.status == new_status:
        logger.debug(f"Linear task already at status: {new_status}")
        return True

    prompt = f"""Update Linear issue status:

1. First, use mcp__linear-server__list_issue_statuses with teamId: "{state.team_id}" to find the state ID for "{new_status}"
2. Then, use mcp__linear-server__update_issue with:
   - issueId: "{state.task_id}"
   - stateId: [the state ID for "{new_status}" from step 1]

Confirm when done.
"""

    response = await _run_linear_agent(
        prompt, operation_name=f"update Linear status to {new_status}"
    )
    if response:
        state.status = new_status
        state.save(spec_dir)
        logger.info(f"Updated Linear task {state.task_id} to: {new_status}")
        print(f"Updated Linear task {state.task_id} to: {new_status}")
        return True

    logger.warning(
        f"Failed to update Linear task status to {new_status}, continuing build"
    )
    return False


async def add_linear_comment(
    spec_dir: Path,
    comment: str,
) -> bool:
    """
    Add a comment to the Linear task with error handling.

    If Linear is unavailable, logs a warning and continues gracefully.

    Args:
        spec_dir: Spec directory with .linear_task.json
        comment: Comment text to add

    Returns:
        True if successful, False if failed or Linear unavailable
    """
    if not is_linear_enabled():
        logger.debug("Linear integration disabled, skipping comment")
        return False

    state = LinearTaskState.load(spec_dir)
    if not state or not state.task_id:
        logger.info("No Linear task found for this spec, skipping comment")
        return False

    # Escape any quotes in the comment
    safe_comment = comment.replace('"', '\\"').replace("\n", "\\n")

    prompt = f"""Add a comment to Linear issue:

Use mcp__linear-server__create_comment with:
- issueId: "{state.task_id}"
- body: "{safe_comment}"

Confirm when done.
"""

    response = await _run_linear_agent(prompt, operation_name="add Linear comment")
    if response:
        logger.info(f"Added comment to Linear task {state.task_id}")
        print(f"Added comment to Linear task {state.task_id}")
        return True

    logger.warning("Failed to add Linear comment, continuing build")
    return False


# === Convenience functions for specific transitions ===
# These functions wrap the core functions with graceful error handling


async def linear_task_started(spec_dir: Path) -> bool:
    """
    Mark task as started (In Progress) with error handling.

    Called when planner session begins.
    If Linear is unavailable, logs a warning and continues gracefully.

    Args:
        spec_dir: Spec directory

    Returns:
        True if successful, False if failed or Linear unavailable
    """
    try:
        success = await update_linear_status(spec_dir, STATUS_IN_PROGRESS)
        if success:
            await add_linear_comment(
                spec_dir, "Build started - planning phase initiated"
            )
        return success
    except Exception as e:
        logger.warning(
            f"Failed to mark Linear task as started: {e}. Continuing build."
        )
        return False


async def linear_subtask_completed(
    spec_dir: Path,
    subtask_id: str,
    completed_count: int,
    total_count: int,
) -> bool:
    """
    Record subtask completion as a comment with error handling.

    Called after each successful coder session.
    If Linear is unavailable, logs a warning and continues gracefully.

    Args:
        spec_dir: Spec directory
        subtask_id: ID of completed subtask
        completed_count: Number of completed subtasks
        total_count: Total number of subtasks

    Returns:
        True if successful, False if failed or Linear unavailable
    """
    try:
        comment = (
            f"Completed {subtask_id} ({completed_count}/{total_count} subtasks done)"
        )
        return await add_linear_comment(spec_dir, comment)
    except Exception as e:
        logger.warning(
            f"Failed to record subtask completion in Linear: {e}. Continuing build."
        )
        return False


async def linear_subtask_failed(
    spec_dir: Path,
    subtask_id: str,
    attempt: int,
    error_summary: str,
) -> bool:
    """
    Record subtask failure as a comment with error handling.

    Called after failed coder session.
    If Linear is unavailable, logs a warning and continues gracefully.

    Args:
        spec_dir: Spec directory
        subtask_id: ID of failed subtask
        attempt: Attempt number
        error_summary: Summary of the error

    Returns:
        True if successful, False if failed or Linear unavailable
    """
    try:
        comment = (
            f"Subtask {subtask_id} failed (attempt {attempt}): {error_summary[:200]}"
        )
        return await add_linear_comment(spec_dir, comment)
    except Exception as e:
        logger.warning(
            f"Failed to record subtask failure in Linear: {e}. Continuing build."
        )
        return False


async def linear_build_complete(spec_dir: Path) -> bool:
    """
    Record build completion, moving to QA, with error handling.

    Called when all subtasks are completed.
    If Linear is unavailable, logs a warning and continues gracefully.

    Args:
        spec_dir: Spec directory

    Returns:
        True if successful, False if failed or Linear unavailable
    """
    try:
        comment = "All subtasks completed - moving to QA validation"
        return await add_linear_comment(spec_dir, comment)
    except Exception as e:
        logger.warning(
            f"Failed to record build completion in Linear: {e}. Continuing build."
        )
        return False


async def linear_qa_started(spec_dir: Path) -> bool:
    """
    Mark task as In Review for QA phase with error handling.

    Called when QA validation loop starts.
    If Linear is unavailable, logs a warning and continues gracefully.

    Args:
        spec_dir: Spec directory

    Returns:
        True if successful, False if failed or Linear unavailable
    """
    try:
        success = await update_linear_status(spec_dir, STATUS_IN_REVIEW)
        if success:
            await add_linear_comment(spec_dir, "QA validation started")
        return success
    except Exception as e:
        logger.warning(
            f"Failed to mark Linear task as In Review: {e}. Continuing build."
        )
        return False


async def linear_qa_approved(spec_dir: Path) -> bool:
    """
    Record QA approval (stays In Review for human) with error handling.

    Called when QA approves the build.
    If Linear is unavailable, logs a warning and continues gracefully.

    Args:
        spec_dir: Spec directory

    Returns:
        True if successful, False if failed or Linear unavailable
    """
    try:
        comment = "QA approved - awaiting human review for merge"
        return await add_linear_comment(spec_dir, comment)
    except Exception as e:
        logger.warning(
            f"Failed to record QA approval in Linear: {e}. Continuing build."
        )
        return False


async def linear_qa_rejected(
    spec_dir: Path,
    issues_count: int,
    iteration: int,
) -> bool:
    """
    Record QA rejection with error handling.

    Called when QA rejects the build.
    If Linear is unavailable, logs a warning and continues gracefully.

    Args:
        spec_dir: Spec directory
        issues_count: Number of issues found
        iteration: Current QA iteration

    Returns:
        True if successful, False if failed or Linear unavailable
    """
    try:
        comment = (
            f"QA iteration {iteration}: Found {issues_count} issues - applying fixes"
        )
        return await add_linear_comment(spec_dir, comment)
    except Exception as e:
        logger.warning(
            f"Failed to record QA rejection in Linear: {e}. Continuing build."
        )
        return False


async def linear_qa_max_iterations(spec_dir: Path, iterations: int) -> bool:
    """
    Record QA max iterations reached with error handling.

    Called when QA loop exhausts retries.
    If Linear is unavailable, logs a warning and continues gracefully.

    Args:
        spec_dir: Spec directory
        iterations: Number of iterations performed

    Returns:
        True if successful, False if failed or Linear unavailable
    """
    try:
        comment = (
            f"QA reached max iterations ({iterations}) - needs human intervention"
        )
        return await add_linear_comment(spec_dir, comment)
    except Exception as e:
        logger.warning(
            f"Failed to record QA max iterations in Linear: {e}. Continuing build."
        )
        return False


async def linear_task_stuck(
    spec_dir: Path,
    subtask_id: str,
    attempt_count: int,
) -> bool:
    """
    Record that a subtask is stuck with error handling.

    Called when subtask exceeds retry limit.
    If Linear is unavailable, logs a warning and continues gracefully.

    Args:
        spec_dir: Spec directory
        subtask_id: ID of stuck subtask
        attempt_count: Number of attempts made

    Returns:
        True if successful, False if failed or Linear unavailable
    """
    try:
        comment = f"Subtask {subtask_id} is STUCK after {attempt_count} attempts - needs human review"
        return await add_linear_comment(spec_dir, comment)
    except Exception as e:
        logger.warning(
            f"Failed to record stuck subtask in Linear: {e}. Continuing build."
        )
        return False
