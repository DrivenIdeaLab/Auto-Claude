/**
 * IPC Input Validation Utilities
 *
 * Provides validation functions for IPC handler parameters to prevent cryptic errors
 * from invalid inputs. All validators throw ValidationError on invalid input.
 */

/**
 * Custom error for validation failures
 */
export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ValidationError';
  }
}

/**
 * Validates that a value is a non-empty string
 * @param value - The value to validate
 * @param fieldName - Name of the field for error messages
 * @returns The validated string value
 * @throws ValidationError if the value is not a non-empty string
 */
function validateNonEmptyString(value: unknown, fieldName: string): string {
  if (typeof value !== 'string') {
    throw new ValidationError(
      `Invalid ${fieldName}: must be a string, received ${typeof value}`
    );
  }

  const trimmed = value.trim();
  if (trimmed.length === 0) {
    throw new ValidationError(
      `Invalid ${fieldName}: must be a non-empty string`
    );
  }

  return value;
}

/**
 * Validates a project ID
 * Project IDs should be non-empty strings
 *
 * @param id - The project ID to validate
 * @returns The validated project ID
 * @throws ValidationError if the ID is invalid
 *
 * @example
 * ```ts
 * const projectId = validateProjectId(receivedProjectId);
 * ```
 */
export function validateProjectId(id: unknown): string {
  return validateNonEmptyString(id, 'project ID');
}

/**
 * Validates a task ID
 * Task IDs should be non-empty strings (typically spec IDs like "001-feature-name")
 *
 * @param id - The task ID to validate
 * @returns The validated task ID
 * @throws ValidationError if the ID is invalid
 *
 * @example
 * ```ts
 * const taskId = validateTaskId(receivedTaskId);
 * ```
 */
export function validateTaskId(id: unknown): string {
  return validateNonEmptyString(id, 'task ID');
}

/**
 * Validates a spec ID
 * Spec IDs should be non-empty strings (typically formatted like "001-feature-name")
 *
 * @param id - The spec ID to validate
 * @returns The validated spec ID
 * @throws ValidationError if the ID is invalid
 *
 * @example
 * ```ts
 * const specId = validateSpecId(receivedSpecId);
 * ```
 */
export function validateSpecId(id: unknown): string {
  return validateNonEmptyString(id, 'spec ID');
}

/**
 * Validates a file or directory path
 * Paths should be non-empty strings
 *
 * @param pathValue - The path to validate
 * @param options - Validation options
 * @param options.allowRelative - Whether to allow relative paths (default: true)
 * @returns The validated path
 * @throws ValidationError if the path is invalid
 *
 * @example
 * ```ts
 * const filePath = validatePath(receivedPath);
 * const absolutePath = validatePath(receivedPath, { allowRelative: false });
 * ```
 */
export function validatePath(
  pathValue: unknown,
  options: { allowRelative?: boolean } = {}
): string {
  const { allowRelative = true } = options;
  const path = validateNonEmptyString(pathValue, 'path');

  // Check for absolute path if required
  if (!allowRelative) {
    const isAbsolute = /^([a-zA-Z]:[\\/]|[\\/])/.test(path);
    if (!isAbsolute) {
      throw new ValidationError(
        'Invalid path: must be an absolute path'
      );
    }
  }

  // Check for suspicious path patterns
  if (path.includes('\0')) {
    throw new ValidationError(
      'Invalid path: contains null bytes'
    );
  }

  return path;
}

/**
 * Validates that a value matches one of the allowed enum values
 *
 * @param value - The value to validate
 * @param allowed - Array of allowed values
 * @param fieldName - Name of the field for error messages (default: "value")
 * @returns The validated value
 * @throws ValidationError if the value is not in the allowed list
 *
 * @example
 * ```ts
 * const status = validateEnum(receivedStatus, ['backlog', 'in_progress', 'done'], 'status');
 * ```
 */
export function validateEnum<T extends string>(
  value: unknown,
  allowed: readonly T[],
  fieldName: string = 'value'
): T {
  if (typeof value !== 'string') {
    throw new ValidationError(
      `Invalid ${fieldName}: must be a string, received ${typeof value}`
    );
  }

  if (!allowed.includes(value as T)) {
    throw new ValidationError(
      `Invalid ${fieldName}: must be one of [${allowed.join(', ')}], received "${value}"`
    );
  }

  return value as T;
}

/**
 * Validates an optional string parameter
 * Returns undefined if the value is null, undefined, or empty string
 *
 * @param value - The value to validate
 * @param fieldName - Name of the field for error messages
 * @returns The validated string or undefined
 * @throws ValidationError if the value is not a string, null, or undefined
 *
 * @example
 * ```ts
 * const description = validateOptionalString(receivedDescription, 'description');
 * ```
 */
export function validateOptionalString(
  value: unknown,
  fieldName: string
): string | undefined {
  if (value === null || value === undefined || value === '') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new ValidationError(
      `Invalid ${fieldName}: must be a string or undefined, received ${typeof value}`
    );
  }

  return value;
}

/**
 * Validates a boolean parameter
 *
 * @param value - The value to validate
 * @param fieldName - Name of the field for error messages
 * @returns The validated boolean
 * @throws ValidationError if the value is not a boolean
 *
 * @example
 * ```ts
 * const approved = validateBoolean(receivedApproved, 'approved');
 * ```
 */
export function validateBoolean(value: unknown, fieldName: string): boolean {
  if (typeof value !== 'boolean') {
    throw new ValidationError(
      `Invalid ${fieldName}: must be a boolean, received ${typeof value}`
    );
  }

  return value;
}

/**
 * Validates an optional boolean parameter
 *
 * @param value - The value to validate
 * @param fieldName - Name of the field for error messages
 * @returns The validated boolean or undefined
 * @throws ValidationError if the value is not a boolean, null, or undefined
 *
 * @example
 * ```ts
 * const autoRestart = validateOptionalBoolean(receivedAutoRestart, 'autoRestart');
 * ```
 */
export function validateOptionalBoolean(
  value: unknown,
  fieldName: string
): boolean | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  return validateBoolean(value, fieldName);
}

/**
 * Validates a number parameter
 *
 * @param value - The value to validate
 * @param fieldName - Name of the field for error messages
 * @param options - Validation options
 * @param options.min - Minimum allowed value (inclusive)
 * @param options.max - Maximum allowed value (inclusive)
 * @param options.integer - Whether the number must be an integer
 * @returns The validated number
 * @throws ValidationError if the value is not a valid number
 *
 * @example
 * ```ts
 * const workers = validateNumber(receivedWorkers, 'workers', { min: 1, max: 10, integer: true });
 * ```
 */
export function validateNumber(
  value: unknown,
  fieldName: string,
  options: { min?: number; max?: number; integer?: boolean } = {}
): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new ValidationError(
      `Invalid ${fieldName}: must be a finite number, received ${typeof value}`
    );
  }

  if (options.integer && !Number.isInteger(value)) {
    throw new ValidationError(
      `Invalid ${fieldName}: must be an integer, received ${value}`
    );
  }

  if (options.min !== undefined && value < options.min) {
    throw new ValidationError(
      `Invalid ${fieldName}: must be at least ${options.min}, received ${value}`
    );
  }

  if (options.max !== undefined && value > options.max) {
    throw new ValidationError(
      `Invalid ${fieldName}: must be at most ${options.max}, received ${value}`
    );
  }

  return value;
}

/**
 * Validates an array parameter
 *
 * @param value - The value to validate
 * @param fieldName - Name of the field for error messages
 * @param options - Validation options
 * @param options.minLength - Minimum array length
 * @param options.maxLength - Maximum array length
 * @param options.validator - Optional validator function for array elements
 * @returns The validated array
 * @throws ValidationError if the value is not a valid array
 *
 * @example
 * ```ts
 * const tags = validateArray(receivedTags, 'tags', {
 *   minLength: 1,
 *   validator: (item) => validateNonEmptyString(item, 'tag')
 * });
 * ```
 */
export function validateArray<T>(
  value: unknown,
  fieldName: string,
  options: {
    minLength?: number;
    maxLength?: number;
    validator?: (item: unknown, index: number) => T;
  } = {}
): T[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(
      `Invalid ${fieldName}: must be an array, received ${typeof value}`
    );
  }

  if (options.minLength !== undefined && value.length < options.minLength) {
    throw new ValidationError(
      `Invalid ${fieldName}: must have at least ${options.minLength} items, received ${value.length}`
    );
  }

  if (options.maxLength !== undefined && value.length > options.maxLength) {
    throw new ValidationError(
      `Invalid ${fieldName}: must have at most ${options.maxLength} items, received ${value.length}`
    );
  }

  if (options.validator) {
    try {
      return value.map((item, index) => options.validator!(item, index));
    } catch (error) {
      if (error instanceof ValidationError) {
        throw new ValidationError(
          `Invalid ${fieldName}: ${error.message}`
        );
      }
      throw error;
    }
  }

  return value as T[];
}

/**
 * Wraps an IPC handler with validation error handling
 * Catches ValidationError and returns user-friendly error responses
 *
 * @param handler - The IPC handler function to wrap
 * @returns Wrapped handler with error handling
 *
 * @example
 * ```ts
 * ipcMain.handle(
 *   IPC_CHANNELS.TASK_DELETE,
 *   withValidation(async (_, taskId: string) => {
 *     validateTaskId(taskId);
 *     // ... handler logic
 *   })
 * );
 * ```
 */
export function withValidation<T extends (...args: unknown[]) => unknown>(
  handler: T
): T {
  return (async (...args: unknown[]) => {
    try {
      return await handler(...args);
    } catch (error) {
      if (error instanceof ValidationError) {
        console.error('[IPC Validation Error]', error.message);
        return {
          success: false,
          error: error.message
        };
      }
      // Re-throw non-validation errors
      throw error;
    }
  }) as T;
}
