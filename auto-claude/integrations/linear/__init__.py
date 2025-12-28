"""
Linear Integration
==================

Integration with Linear issue tracking with robust error handling.
"""

from .config import LinearConfig
from .error_handling import (
    LinearAvailability,
    LinearErrorInfo,
    LinearErrorType,
    get_last_linear_error,
    get_linear_status,
    is_linear_available,
    log_linear_status,
    reset_connection_cache,
)
from .integration import LinearManager
from .updater import (
    STATUS_CANCELED,
    STATUS_DONE,
    STATUS_IN_PROGRESS,
    STATUS_IN_REVIEW,
    STATUS_TODO,
    LinearTaskState,
    create_linear_task,
    get_linear_api_key,
    is_linear_enabled,
    update_linear_status,
)

# Aliases for backward compatibility
LinearIntegration = LinearManager
LinearUpdater = LinearTaskState  # Alias - old code may expect this name

__all__ = [
    # Core
    "LinearConfig",
    "LinearManager",
    "LinearIntegration",
    "LinearTaskState",
    "LinearUpdater",
    "is_linear_enabled",
    "get_linear_api_key",
    "create_linear_task",
    "update_linear_status",
    # Status constants
    "STATUS_TODO",
    "STATUS_IN_PROGRESS",
    "STATUS_IN_REVIEW",
    "STATUS_DONE",
    "STATUS_CANCELED",
    # Error handling
    "LinearAvailability",
    "LinearErrorType",
    "LinearErrorInfo",
    "is_linear_available",
    "get_linear_status",
    "get_last_linear_error",
    "log_linear_status",
    "reset_connection_cache",
]
