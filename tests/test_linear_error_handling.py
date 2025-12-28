"""
Tests for Linear Integration Error Handling
============================================

Tests retry logic, exponential backoff, graceful degradation,
and connection status caching.
"""

import asyncio
import sys
from pathlib import Path
from unittest.mock import AsyncMock, MagicMock, patch

import pytest

# Add auto-claude to path for imports
sys.path.insert(0, str(Path(__file__).parent.parent / "auto-claude"))

from integrations.linear.error_handling import (
    LinearAvailability,
    LinearConnectionCache,
    LinearErrorInfo,
    LinearErrorType,
    RetryConfig,
    classify_error,
    get_last_linear_error,
    get_linear_status,
    is_linear_available,
    linear_operation_with_fallback,
    reset_connection_cache,
    retry_with_backoff,
)


class TestErrorClassification:
    """Test error classification into LinearErrorInfo."""

    def test_classify_network_error(self):
        """Test classification of network errors as transient."""
        error = Exception("Network connection failed")
        info = classify_error(error)

        assert info.error_type == LinearErrorType.NETWORK_ERROR
        assert info.is_transient is True
        assert "network" in info.message.lower()

    def test_classify_timeout_error(self):
        """Test classification of timeout errors as transient."""
        error = asyncio.TimeoutError("Request timeout")
        info = classify_error(error)

        assert info.error_type == LinearErrorType.TIMEOUT
        assert info.is_transient is True

    def test_classify_rate_limit_error(self):
        """Test classification of rate limit errors as transient."""
        error = Exception("Rate limit exceeded (429)")
        info = classify_error(error)

        assert info.error_type == LinearErrorType.RATE_LIMIT
        assert info.is_transient is True

    def test_classify_server_error(self):
        """Test classification of server errors as transient."""
        error = Exception("Server error: 500 Internal Server Error")
        info = classify_error(error)

        assert info.error_type == LinearErrorType.SERVER_ERROR
        assert info.is_transient is True

    def test_classify_auth_error(self):
        """Test classification of auth errors as non-transient."""
        error = Exception("Unauthorized: Invalid API key")
        info = classify_error(error)

        assert info.error_type == LinearErrorType.AUTH_ERROR
        assert info.is_transient is False

    def test_classify_validation_error(self):
        """Test classification of validation errors as non-transient."""
        error = Exception("Validation error: Invalid team ID")
        info = classify_error(error)

        assert info.error_type == LinearErrorType.VALIDATION_ERROR
        assert info.is_transient is False

    def test_classify_unknown_error(self):
        """Test classification of unknown errors as transient (safe default)."""
        error = Exception("Something weird happened")
        info = classify_error(error)

        assert info.error_type == LinearErrorType.UNKNOWN
        assert info.is_transient is True


class TestConnectionCache:
    """Test connection status caching."""

    def test_initial_state(self):
        """Test cache starts in available state."""
        cache = LinearConnectionCache()

        assert cache.is_available() is True
        assert cache.get_status() == LinearAvailability.AVAILABLE
        assert cache.get_last_error() is None

    def test_record_single_failure(self):
        """Test single failure doesn't mark as unavailable."""
        cache = LinearConnectionCache(failure_threshold=3)
        error_info = LinearErrorInfo(
            error_type=LinearErrorType.NETWORK_ERROR,
            message="Network error",
            is_transient=True,
        )

        cache.record_failure(error_info)

        assert cache.is_available() is True
        assert cache.get_status() == LinearAvailability.DEGRADED

    def test_record_multiple_failures_reaches_threshold(self):
        """Test multiple failures mark as unavailable."""
        cache = LinearConnectionCache(failure_threshold=3)
        error_info = LinearErrorInfo(
            error_type=LinearErrorType.NETWORK_ERROR,
            message="Network error",
            is_transient=True,
        )

        # Record failures up to threshold
        cache.record_failure(error_info)
        cache.record_failure(error_info)
        cache.record_failure(error_info)

        assert cache.is_available() is False
        assert cache.get_status() == LinearAvailability.UNAVAILABLE

    def test_non_transient_error_immediate_unavailable(self):
        """Test non-transient errors immediately mark as unavailable."""
        cache = LinearConnectionCache(failure_threshold=3)
        error_info = LinearErrorInfo(
            error_type=LinearErrorType.AUTH_ERROR,
            message="Auth error",
            is_transient=False,
        )

        cache.record_failure(error_info)

        assert cache.is_available() is False
        assert cache.get_status() == LinearAvailability.UNAVAILABLE

    def test_success_resets_failures(self):
        """Test successful operation resets failure count."""
        cache = LinearConnectionCache(failure_threshold=3)
        error_info = LinearErrorInfo(
            error_type=LinearErrorType.NETWORK_ERROR,
            message="Network error",
            is_transient=True,
        )

        # Build up some failures
        cache.record_failure(error_info)
        cache.record_failure(error_info)

        # Success should reset
        cache.record_success()

        assert cache.is_available() is True
        assert cache.get_status() == LinearAvailability.AVAILABLE

    def test_cache_expiration(self):
        """Test unavailable cache expires after duration."""
        cache = LinearConnectionCache(failure_threshold=2, cache_duration=0.1)
        error_info = LinearErrorInfo(
            error_type=LinearErrorType.NETWORK_ERROR,
            message="Network error",
            is_transient=True,
        )

        # Mark as unavailable
        cache.record_failure(error_info)
        cache.record_failure(error_info)
        assert cache.is_available() is False

        # Wait for cache to expire
        import time

        time.sleep(0.15)

        # Should be degraded (available but cautious)
        assert cache.is_available() is True
        assert cache.get_status() == LinearAvailability.DEGRADED


class TestRetryWithBackoff:
    """Test retry logic with exponential backoff."""

    @pytest.mark.asyncio
    async def test_success_on_first_attempt(self):
        """Test successful operation on first attempt."""
        mock_func = AsyncMock(return_value="success")

        success, result = await retry_with_backoff(
            mock_func, operation_name="test operation"
        )

        assert success is True
        assert result == "success"
        assert mock_func.call_count == 1

    @pytest.mark.asyncio
    async def test_success_after_retries(self):
        """Test successful operation after some failures."""
        mock_func = AsyncMock(
            side_effect=[
                Exception("Transient error"),
                Exception("Another transient"),
                "success",
            ]
        )

        config = RetryConfig(max_retries=3, initial_delay=0.01, timeout=1.0)

        success, result = await retry_with_backoff(
            mock_func, operation_name="test operation", config=config
        )

        assert success is True
        assert result == "success"
        assert mock_func.call_count == 3

    @pytest.mark.asyncio
    async def test_failure_after_max_retries(self):
        """Test operation fails after exhausting retries."""
        mock_func = AsyncMock(side_effect=Exception("Persistent error"))

        config = RetryConfig(max_retries=2, initial_delay=0.01, timeout=1.0)

        success, result = await retry_with_backoff(
            mock_func, operation_name="test operation", config=config
        )

        assert success is False
        assert result is None
        assert mock_func.call_count == 3  # Initial + 2 retries

    @pytest.mark.asyncio
    async def test_non_transient_error_no_retry(self):
        """Test non-transient errors don't trigger retries."""
        mock_func = AsyncMock(side_effect=Exception("Invalid API key (auth)"))

        config = RetryConfig(max_retries=3, initial_delay=0.01, timeout=1.0)

        success, result = await retry_with_backoff(
            mock_func, operation_name="test operation", config=config
        )

        assert success is False
        assert result is None
        assert mock_func.call_count == 1  # No retries for non-transient

    @pytest.mark.asyncio
    async def test_timeout_enforcement(self):
        """Test timeout is enforced for slow operations."""

        async def slow_func():
            await asyncio.sleep(10)  # Takes too long
            return "success"

        config = RetryConfig(max_retries=0, initial_delay=0.01, timeout=0.1)

        success, result = await retry_with_backoff(
            slow_func, operation_name="test operation", config=config
        )

        assert success is False
        assert result is None


class TestLinearOperationWithFallback:
    """Test the main operation wrapper with fallback."""

    @pytest.mark.asyncio
    async def test_successful_operation(self):
        """Test successful operation returns result."""
        mock_func = AsyncMock(return_value="success")

        reset_connection_cache()  # Start fresh

        result = await linear_operation_with_fallback(
            mock_func,
            operation_name="test operation",
            fallback_result="fallback",
        )

        assert result == "success"
        assert mock_func.call_count == 1

    @pytest.mark.asyncio
    async def test_failed_operation_returns_fallback(self):
        """Test failed operation returns fallback value."""
        mock_func = AsyncMock(side_effect=Exception("Operation failed"))

        reset_connection_cache()  # Start fresh

        config = RetryConfig(max_retries=1, initial_delay=0.01, timeout=1.0)

        result = await linear_operation_with_fallback(
            mock_func,
            operation_name="test operation",
            fallback_result="fallback",
            config=config,
        )

        assert result == "fallback"

    @pytest.mark.asyncio
    async def test_cached_unavailable_skips_operation(self):
        """Test cached unavailable status skips operation."""
        mock_func = AsyncMock(return_value="success")

        reset_connection_cache()

        # Simulate cache marking as unavailable
        from integrations.linear.error_handling import _connection_cache

        error_info = LinearErrorInfo(
            error_type=LinearErrorType.AUTH_ERROR,
            message="Auth error",
            is_transient=False,
        )
        _connection_cache.record_failure(error_info)

        result = await linear_operation_with_fallback(
            mock_func,
            operation_name="test operation",
            fallback_result="fallback",
        )

        assert result == "fallback"
        assert mock_func.call_count == 0  # Should not be called


class TestGlobalStatusFunctions:
    """Test global status query functions."""

    def test_is_linear_available(self):
        """Test is_linear_available reflects cache state."""
        reset_connection_cache()

        assert is_linear_available() is True

        # Mark as unavailable
        from integrations.linear.error_handling import _connection_cache

        error_info = LinearErrorInfo(
            error_type=LinearErrorType.NETWORK_ERROR,
            message="Error",
            is_transient=True,
        )
        for _ in range(3):
            _connection_cache.record_failure(error_info)

        assert is_linear_available() is False

    def test_get_linear_status(self):
        """Test get_linear_status returns current state."""
        reset_connection_cache()

        assert get_linear_status() == LinearAvailability.AVAILABLE

    def test_get_last_linear_error(self):
        """Test get_last_linear_error returns error info."""
        reset_connection_cache()

        assert get_last_linear_error() is None

        # Record an error
        from integrations.linear.error_handling import _connection_cache

        error_info = LinearErrorInfo(
            error_type=LinearErrorType.NETWORK_ERROR,
            message="Test error",
            is_transient=True,
        )
        _connection_cache.record_failure(error_info)

        last_error = get_last_linear_error()
        assert last_error is not None
        assert last_error.message == "Test error"

    def test_reset_connection_cache(self):
        """Test reset_connection_cache clears state."""
        reset_connection_cache()

        # Mark as unavailable
        from integrations.linear.error_handling import _connection_cache

        error_info = LinearErrorInfo(
            error_type=LinearErrorType.NETWORK_ERROR,
            message="Error",
            is_transient=True,
        )
        for _ in range(3):
            _connection_cache.record_failure(error_info)

        assert is_linear_available() is False

        # Reset should clear
        reset_connection_cache()

        assert is_linear_available() is True
        assert get_last_linear_error() is None


if __name__ == "__main__":
    pytest.main([__file__, "-v"])
