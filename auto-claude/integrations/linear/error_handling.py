"""
Linear Error Handling and Recovery
===================================

Provides robust error handling, retry logic, and graceful degradation
for Linear API integration. Ensures build continues even if Linear is unavailable.

Design Principles:
- Never fail the build because Linear is down
- Use exponential backoff for transient failures
- Cache connection status to avoid repeated failures
- Log warnings but continue execution
- Provide clear feedback about Linear availability
"""

import asyncio
import logging
import time
from dataclasses import dataclass
from enum import Enum
from pathlib import Path
from typing import Any, Callable, Optional, TypeVar

logger = logging.getLogger(__name__)

# Type variable for generic retry function
T = TypeVar("T")


class LinearErrorType(Enum):
    """Types of Linear API errors."""

    NETWORK_ERROR = "network"  # Connection timeout, DNS failure
    AUTH_ERROR = "auth"  # Invalid API key, permissions
    RATE_LIMIT = "rate_limit"  # Too many requests
    SERVER_ERROR = "server"  # 5xx errors from Linear
    VALIDATION_ERROR = "validation"  # Invalid request data
    TIMEOUT = "timeout"  # Request timeout
    UNKNOWN = "unknown"  # Unclassified error


class LinearAvailability(Enum):
    """Linear service availability states."""

    AVAILABLE = "available"
    DEGRADED = "degraded"  # Working but experiencing issues
    UNAVAILABLE = "unavailable"
    DISABLED = "disabled"  # Not configured (no API key)


@dataclass
class LinearErrorInfo:
    """Information about a Linear API error."""

    error_type: LinearErrorType
    message: str
    is_transient: bool  # Whether retry might help
    original_error: Optional[Exception] = None


@dataclass
class RetryConfig:
    """Configuration for retry behavior."""

    max_retries: int = 3
    initial_delay: float = 1.0  # Initial delay in seconds
    max_delay: float = 30.0  # Maximum delay between retries
    exponential_base: float = 2.0  # Exponential backoff multiplier
    timeout: float = 10.0  # Timeout for individual requests


class LinearConnectionCache:
    """
    Caches Linear connection status to avoid repeated failures.

    If Linear fails multiple times, we cache the failure status
    and skip attempts for a period of time.
    """

    def __init__(
        self,
        failure_threshold: int = 3,
        cache_duration: float = 300.0,  # 5 minutes
    ):
        """
        Initialize connection cache.

        Args:
            failure_threshold: Number of consecutive failures before caching
            cache_duration: How long to cache unavailable status (seconds)
        """
        self.failure_threshold = failure_threshold
        self.cache_duration = cache_duration

        self._consecutive_failures = 0
        self._availability = LinearAvailability.AVAILABLE
        self._cached_at: Optional[float] = None
        self._last_error: Optional[LinearErrorInfo] = None

    def record_success(self) -> None:
        """Record a successful Linear API call."""
        self._consecutive_failures = 0
        self._availability = LinearAvailability.AVAILABLE
        self._cached_at = None
        self._last_error = None

    def record_failure(self, error_info: LinearErrorInfo) -> None:
        """
        Record a failed Linear API call.

        Args:
            error_info: Information about the failure
        """
        self._consecutive_failures += 1
        self._last_error = error_info

        # Update availability based on failure count and error type
        if not error_info.is_transient:
            # Non-transient errors (auth, validation) = unavailable immediately
            self._availability = LinearAvailability.UNAVAILABLE
            self._cached_at = time.time()
        elif self._consecutive_failures >= self.failure_threshold:
            # Multiple transient failures = temporarily unavailable
            self._availability = LinearAvailability.UNAVAILABLE
            self._cached_at = time.time()
        elif self._consecutive_failures >= 1:
            # Some failures but not threshold = degraded
            self._availability = LinearAvailability.DEGRADED

    def is_available(self) -> bool:
        """
        Check if Linear is currently available.

        Returns:
            True if we should attempt Linear operations
        """
        # Check if cached unavailable status has expired
        if (
            self._availability == LinearAvailability.UNAVAILABLE
            and self._cached_at is not None
        ):
            elapsed = time.time() - self._cached_at
            if elapsed > self.cache_duration:
                # Cache expired, reset to degraded and allow retry
                logger.info("Linear unavailable cache expired, allowing retry")
                self._availability = LinearAvailability.DEGRADED
                self._consecutive_failures = 1  # Start with cautious retry

        return self._availability in (
            LinearAvailability.AVAILABLE,
            LinearAvailability.DEGRADED,
        )

    def get_status(self) -> LinearAvailability:
        """Get current availability status."""
        return self._availability

    def get_last_error(self) -> Optional[LinearErrorInfo]:
        """Get information about the last error."""
        return self._last_error


# Global connection cache instance
_connection_cache = LinearConnectionCache()


def classify_error(error: Exception) -> LinearErrorInfo:
    """
    Classify an exception into a LinearErrorInfo.

    Args:
        error: The exception to classify

    Returns:
        LinearErrorInfo with error classification
    """
    error_str = str(error).lower()
    error_type = error.__class__.__name__.lower()

    # Network errors (transient)
    if any(
        keyword in error_str
        for keyword in ["network", "connection", "dns", "unreachable"]
    ):
        return LinearErrorInfo(
            error_type=LinearErrorType.NETWORK_ERROR,
            message=f"Network error: {error}",
            is_transient=True,
            original_error=error,
        )

    # Timeout errors (transient)
    if "timeout" in error_str or isinstance(error, asyncio.TimeoutError):
        return LinearErrorInfo(
            error_type=LinearErrorType.TIMEOUT,
            message=f"Request timeout: {error}",
            is_transient=True,
            original_error=error,
        )

    # Rate limit errors (transient)
    if "rate limit" in error_str or "429" in error_str:
        return LinearErrorInfo(
            error_type=LinearErrorType.RATE_LIMIT,
            message=f"Rate limit exceeded: {error}",
            is_transient=True,
            original_error=error,
        )

    # Server errors (transient)
    if "500" in error_str or "502" in error_str or "503" in error_str:
        return LinearErrorInfo(
            error_type=LinearErrorType.SERVER_ERROR,
            message=f"Linear server error: {error}",
            is_transient=True,
            original_error=error,
        )

    # Auth errors (not transient)
    if any(keyword in error_str for keyword in ["auth", "unauthorized", "forbidden"]):
        return LinearErrorInfo(
            error_type=LinearErrorType.AUTH_ERROR,
            message=f"Authentication error: {error}",
            is_transient=False,
            original_error=error,
        )

    # Validation errors (not transient)
    if "validation" in error_str or "invalid" in error_str:
        return LinearErrorInfo(
            error_type=LinearErrorType.VALIDATION_ERROR,
            message=f"Invalid request: {error}",
            is_transient=False,
            original_error=error,
        )

    # Unknown error - assume transient to allow retries
    return LinearErrorInfo(
        error_type=LinearErrorType.UNKNOWN,
        message=f"Unknown error: {error}",
        is_transient=True,
        original_error=error,
    )


async def retry_with_backoff(
    func: Callable[..., Any],
    *args: Any,
    config: Optional[RetryConfig] = None,
    operation_name: str = "Linear operation",
    **kwargs: Any,
) -> tuple[bool, Optional[Any]]:
    """
    Execute a function with exponential backoff retry logic.

    Args:
        func: Async function to execute
        *args: Positional arguments for func
        config: Retry configuration (uses default if None)
        operation_name: Name of the operation for logging
        **kwargs: Keyword arguments for func

    Returns:
        Tuple of (success: bool, result: Any or None)
    """
    if config is None:
        config = RetryConfig()

    delay = config.initial_delay
    last_error_info: Optional[LinearErrorInfo] = None

    for attempt in range(config.max_retries + 1):
        try:
            # Execute with timeout
            result = await asyncio.wait_for(func(*args, **kwargs), timeout=config.timeout)
            _connection_cache.record_success()
            return (True, result)

        except Exception as e:
            last_error_info = classify_error(e)

            # Log the error
            if attempt == 0:
                logger.warning(
                    f"{operation_name} failed (attempt {attempt + 1}/{config.max_retries + 1}): "
                    f"{last_error_info.message}"
                )
            else:
                logger.warning(
                    f"{operation_name} retry {attempt}/{config.max_retries} failed: "
                    f"{last_error_info.message}"
                )

            # Don't retry non-transient errors
            if not last_error_info.is_transient:
                logger.error(
                    f"{operation_name} failed with non-transient error, not retrying"
                )
                _connection_cache.record_failure(last_error_info)
                return (False, None)

            # Don't retry if we've exhausted attempts
            if attempt >= config.max_retries:
                break

            # Wait before retry with exponential backoff
            await asyncio.sleep(delay)
            delay = min(delay * config.exponential_base, config.max_delay)

    # All retries exhausted
    if last_error_info:
        _connection_cache.record_failure(last_error_info)

    logger.error(
        f"{operation_name} failed after {config.max_retries + 1} attempts, "
        f"giving up"
    )
    return (False, None)


async def linear_operation_with_fallback(
    func: Callable[..., Any],
    *args: Any,
    operation_name: str = "Linear operation",
    fallback_result: Optional[Any] = None,
    config: Optional[RetryConfig] = None,
    **kwargs: Any,
) -> Any:
    """
    Execute a Linear operation with retry and graceful fallback.

    This is the main interface for executing Linear operations.
    It handles:
    - Connection cache check (skip if known unavailable)
    - Retry with exponential backoff
    - Graceful degradation on failure
    - Logging and error reporting

    Args:
        func: Async function to execute
        *args: Positional arguments for func
        operation_name: Name of the operation for logging
        fallback_result: Value to return if operation fails
        config: Retry configuration (uses default if None)
        **kwargs: Keyword arguments for func

    Returns:
        Result from func on success, fallback_result on failure
    """
    # Check connection cache
    if not _connection_cache.is_available():
        last_error = _connection_cache.get_last_error()
        error_detail = f": {last_error.message}" if last_error else ""
        logger.info(
            f"Skipping {operation_name} - Linear is cached as unavailable{error_detail}"
        )
        return fallback_result

    # Attempt operation with retry
    success, result = await retry_with_backoff(
        func, *args, config=config, operation_name=operation_name, **kwargs
    )

    if success:
        return result

    # Operation failed - log and return fallback
    logger.warning(
        f"{operation_name} failed, continuing build without Linear update"
    )
    return fallback_result


def is_linear_available() -> bool:
    """
    Check if Linear is currently available.

    Returns:
        True if Linear operations should be attempted
    """
    return _connection_cache.is_available()


def get_linear_status() -> LinearAvailability:
    """
    Get current Linear availability status.

    Returns:
        Current LinearAvailability state
    """
    return _connection_cache.get_status()


def get_last_linear_error() -> Optional[LinearErrorInfo]:
    """
    Get information about the last Linear error.

    Returns:
        LinearErrorInfo if there was an error, None otherwise
    """
    return _connection_cache.get_last_error()


def reset_connection_cache() -> None:
    """Reset the connection cache (for testing or manual recovery)."""
    global _connection_cache
    _connection_cache = LinearConnectionCache()
    logger.info("Linear connection cache reset")


def log_linear_status(spec_dir: Path) -> None:
    """
    Log current Linear integration status.

    Args:
        spec_dir: Spec directory for context
    """
    status = get_linear_status()
    last_error = get_last_linear_error()

    if status == LinearAvailability.AVAILABLE:
        logger.info(f"Linear integration: AVAILABLE for {spec_dir.name}")
    elif status == LinearAvailability.DEGRADED:
        logger.warning(
            f"Linear integration: DEGRADED for {spec_dir.name} - "
            f"experiencing intermittent issues"
        )
    elif status == LinearAvailability.UNAVAILABLE:
        error_msg = f": {last_error.message}" if last_error else ""
        logger.warning(
            f"Linear integration: UNAVAILABLE for {spec_dir.name}{error_msg} - "
            f"continuing build without Linear updates"
        )
    elif status == LinearAvailability.DISABLED:
        logger.info(f"Linear integration: DISABLED for {spec_dir.name}")
