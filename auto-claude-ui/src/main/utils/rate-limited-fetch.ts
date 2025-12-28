/**
 * Robust HTTP Client with Rate Limiting and Retries
 * 
 * Features:
 * - Rate Limit Handling: Respects X-RateLimit-* and Retry-After headers
 * - Exponential Backoff: Automatically retries with increasing delays
 * - Circuit Breaker: Prevents overwhelming failing services
 * - Idempotency: Safe retries for GET/HEAD/OPTIONS/PUT/DELETE
 */

export interface RetryConfig {
  maxRetries?: number;
  baseDelay?: number;
  maxDelay?: number;
  retryOnStatus?: number[];
  retryOnNetworkError?: boolean;
}

export interface FetchOptions extends RequestInit {
  retry?: RetryConfig;
  timeout?: number;
}

interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
  nextAttempt: number;
}

// Global circuit breaker state per hostname
const circuitBreakers = new Map<string, CircuitBreakerState>();

// Circuit breaker config
const CB_THRESHOLD = 5;
const CB_RESET_TIMEOUT = 30000; // 30 seconds

/**
 * Check if circuit is open for a URL
 */
function checkCircuitBreaker(url: string): void {
  try {
    const hostname = new URL(url).hostname;
    const state = circuitBreakers.get(hostname);
    
    if (!state) return;

    if (state.isOpen) {
      if (Date.now() > state.nextAttempt) {
        // Half-open state: allow one attempt
        return;
      }
      throw new Error(`Circuit breaker open for ${hostname}. Too many recent failures.`);
    }
  } catch (e) {
    // Ignore invalid URLs
    if (e instanceof Error && e.message.includes('Circuit breaker')) {
      throw e;
    }
  }
}

/**
 * Report success to circuit breaker
 */
function reportSuccess(url: string): void {
  try {
    const hostname = new URL(url).hostname;
    circuitBreakers.delete(hostname);
  } catch {
    // Ignore
  }
}

/**
 * Report failure to circuit breaker
 */
function reportFailure(url: string): void {
  try {
    const hostname = new URL(url).hostname;
    const state = circuitBreakers.get(hostname) || {
      failures: 0,
      lastFailure: 0,
      isOpen: false,
      nextAttempt: 0
    };

    state.failures++;
    state.lastFailure = Date.now();

    if (state.failures >= CB_THRESHOLD) {
      state.isOpen = true;
      state.nextAttempt = Date.now() + CB_RESET_TIMEOUT;
      console.warn(`[HttpClient] Circuit breaker opened for ${hostname} after ${state.failures} failures`);
    }

    circuitBreakers.set(hostname, state);
  } catch {
    // Ignore
  }
}

/**
 * Parse rate limit headers to calculate wait time in ms
 */
function getRetryDelay(response: Response, attempt: number, config: Required<RetryConfig>): number {
  // 1. Check Retry-After header
  const retryAfter = response.headers.get('Retry-After');
  if (retryAfter) {
    const seconds = parseInt(retryAfter, 10);
    if (!isNaN(seconds)) {
      return seconds * 1000;
    }
    // Try parsing as date
    const date = new Date(retryAfter);
    if (!isNaN(date.getTime())) {
      const wait = date.getTime() - Date.now();
      return Math.max(0, wait);
    }
  }

  // 2. Check X-RateLimit-Reset (GitHub style: timestamp in seconds)
  const rateLimitReset = response.headers.get('X-RateLimit-Reset');
  if (rateLimitReset) {
    const resetTime = parseInt(rateLimitReset, 10);
    if (!isNaN(resetTime)) {
      // GitHub uses seconds since epoch
      const wait = (resetTime * 1000) - Date.now();
      // Add a small buffer (1s) to be safe
      return Math.max(0, wait + 1000);
    }
  }

  // 3. Fallback to exponential backoff
  const delay = config.baseDelay * Math.pow(2, attempt);
  // Add jitter (randomness) to prevent thundering herd
  const jitter = delay * 0.1 * Math.random();
  return Math.min(config.maxDelay, delay + jitter);
}

/**
 * Robust fetch with retries and rate limiting
 */
export async function robustFetch(url: string, options: FetchOptions = {}): Promise<Response> {
  const config: Required<RetryConfig> = {
    maxRetries: options.retry?.maxRetries ?? 3,
    baseDelay: options.retry?.baseDelay ?? 1000,
    maxDelay: options.retry?.maxDelay ?? 60000, // 1 minute cap
    retryOnStatus: options.retry?.retryOnStatus ?? [429, 500, 502, 503, 504],
    retryOnNetworkError: options.retry?.retryOnNetworkError ?? true
  };

  const timeout = options.timeout ?? 30000; // 30s default timeout
  const method = options.method?.toUpperCase() || 'GET';
  const idempotentMethods = ['GET', 'HEAD', 'OPTIONS', 'TRACE', 'PUT', 'DELETE'];
  const isIdempotent = idempotentMethods.includes(method);

  let attempt = 0;

  while (attempt <= config.maxRetries) {
    try {
      checkCircuitBreaker(url);

      const controller = new AbortController();
      const id = setTimeout(() => controller.abort(), timeout);
      
      const response = await fetch(url, {
        ...options,
        signal: options.signal || controller.signal
      });
      
      clearTimeout(id);

      // Check if successful
      if (response.ok) {
        reportSuccess(url);
        return response;
      }

      // Check status code for retry
      // Only retry if method is idempotent OR if it's a 429 (rate limit wait is safe as request hasn't been processed)
      if (config.retryOnStatus.includes(response.status)) {
        const isRetryable = isIdempotent || response.status === 429;

        if (isRetryable && attempt < config.maxRetries) {
          const delay = getRetryDelay(response, attempt, config);
          
          if (response.status === 429) {
            const limit = response.headers.get('X-RateLimit-Limit');
            const remaining = response.headers.get('X-RateLimit-Remaining');
            const reset = response.headers.get('X-RateLimit-Reset');
            console.warn(`[HttpClient] Rate limit hit for ${url}. Limit: ${limit}, Remaining: ${remaining}, Reset: ${reset}`);
          }
          
          console.warn(`[HttpClient] Request to ${url} failed with ${response.status}. Retrying in ${Math.round(delay)}ms (Attempt ${attempt + 1}/${config.maxRetries})`);
          
          await new Promise(resolve => setTimeout(resolve, delay));
          attempt++;
          continue;
        }
      }

      // Return response if not retrying (client handles error)
      reportSuccess(url); 
      return response;

    } catch (error: unknown) {
      reportFailure(url);

      const isAbortError = error instanceof Error && error.name === 'AbortError';
      // In Node.js environment, network errors might have different messages
      const isNetworkError = error instanceof Error && 
        (error.message.includes('fetch failed') || error.message.includes('ECONNREFUSED') || error.message.includes('ETIMEDOUT'));

      if (attempt < config.maxRetries && isIdempotent && (config.retryOnNetworkError || isAbortError || isNetworkError)) {
        const delay = config.baseDelay * Math.pow(2, attempt);
        console.warn(`[HttpClient] Network error for ${url}: ${error instanceof Error ? error.message : String(error)}. Retrying in ${delay}ms...`);
        await new Promise(resolve => setTimeout(resolve, delay));
        attempt++;
        continue;
      }

      throw error;
    }
  }

  throw new Error(`Max retries exceeded for ${url}`);
}
