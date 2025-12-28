/**
 * Tests for IPC validation utilities
 */

import {
  ValidationError,
  validateProjectId,
  validateTaskId,
  validateSpecId,
  validatePath,
  validateEnum,
  validateOptionalString,
  validateBoolean,
  validateOptionalBoolean,
  validateNumber,
  validateArray,
  withValidation
} from '../ipc-validation';

describe('IPC Validation Utilities', () => {
  describe('validateProjectId', () => {
    it('should accept valid project IDs', () => {
      expect(validateProjectId('project-123')).toBe('project-123');
      expect(validateProjectId('my-project')).toBe('my-project');
    });

    it('should reject non-string values', () => {
      expect(() => validateProjectId(123)).toThrow(ValidationError);
      expect(() => validateProjectId(null)).toThrow(ValidationError);
      expect(() => validateProjectId(undefined)).toThrow(ValidationError);
      expect(() => validateProjectId({})).toThrow(ValidationError);
    });

    it('should reject empty strings', () => {
      expect(() => validateProjectId('')).toThrow(ValidationError);
      expect(() => validateProjectId('   ')).toThrow(ValidationError);
    });

    it('should provide user-friendly error messages', () => {
      expect(() => validateProjectId(123)).toThrow('Invalid project ID: must be a string');
      expect(() => validateProjectId('')).toThrow('Invalid project ID: must be a non-empty string');
    });
  });

  describe('validateTaskId', () => {
    it('should accept valid task IDs', () => {
      expect(validateTaskId('001-feature-name')).toBe('001-feature-name');
      expect(validateTaskId('task-123')).toBe('task-123');
    });

    it('should reject invalid task IDs', () => {
      expect(() => validateTaskId(null)).toThrow(ValidationError);
      expect(() => validateTaskId('')).toThrow(ValidationError);
    });
  });

  describe('validateSpecId', () => {
    it('should accept valid spec IDs', () => {
      expect(validateSpecId('001-feature')).toBe('001-feature');
    });

    it('should reject invalid spec IDs', () => {
      expect(() => validateSpecId(undefined)).toThrow(ValidationError);
    });
  });

  describe('validatePath', () => {
    it('should accept valid paths', () => {
      expect(validatePath('/absolute/path')).toBe('/absolute/path');
      expect(validatePath('C:\\Windows\\Path')).toBe('C:\\Windows\\Path');
      expect(validatePath('./relative/path')).toBe('./relative/path');
    });

    it('should reject paths with null bytes', () => {
      expect(() => validatePath('/path\0/with/null')).toThrow(ValidationError);
    });

    it('should enforce absolute paths when allowRelative is false', () => {
      expect(validatePath('C:\\absolute', { allowRelative: false })).toBe('C:\\absolute');
      expect(validatePath('/absolute', { allowRelative: false })).toBe('/absolute');
      expect(() => validatePath('./relative', { allowRelative: false })).toThrow(ValidationError);
    });
  });

  describe('validateEnum', () => {
    it('should accept valid enum values', () => {
      const allowed = ['backlog', 'in_progress', 'done'] as const;
      expect(validateEnum('backlog', allowed, 'status')).toBe('backlog');
      expect(validateEnum('done', allowed, 'status')).toBe('done');
    });

    it('should reject invalid enum values', () => {
      const allowed = ['a', 'b', 'c'] as const;
      expect(() => validateEnum('d', allowed, 'option')).toThrow(ValidationError);
      expect(() => validateEnum('d', allowed, 'option')).toThrow('must be one of [a, b, c]');
    });

    it('should reject non-string values', () => {
      const allowed = ['a', 'b'] as const;
      expect(() => validateEnum(123, allowed, 'option')).toThrow(ValidationError);
    });
  });

  describe('validateOptionalString', () => {
    it('should accept valid strings', () => {
      expect(validateOptionalString('hello', 'field')).toBe('hello');
    });

    it('should return undefined for null, undefined, or empty string', () => {
      expect(validateOptionalString(null, 'field')).toBeUndefined();
      expect(validateOptionalString(undefined, 'field')).toBeUndefined();
      expect(validateOptionalString('', 'field')).toBeUndefined();
    });

    it('should reject non-string values', () => {
      expect(() => validateOptionalString(123, 'field')).toThrow(ValidationError);
      expect(() => validateOptionalString({}, 'field')).toThrow(ValidationError);
    });
  });

  describe('validateBoolean', () => {
    it('should accept boolean values', () => {
      expect(validateBoolean(true, 'flag')).toBe(true);
      expect(validateBoolean(false, 'flag')).toBe(false);
    });

    it('should reject non-boolean values', () => {
      expect(() => validateBoolean(1, 'flag')).toThrow(ValidationError);
      expect(() => validateBoolean('true', 'flag')).toThrow(ValidationError);
      expect(() => validateBoolean(null, 'flag')).toThrow(ValidationError);
    });
  });

  describe('validateOptionalBoolean', () => {
    it('should accept boolean values', () => {
      expect(validateOptionalBoolean(true, 'flag')).toBe(true);
      expect(validateOptionalBoolean(false, 'flag')).toBe(false);
    });

    it('should return undefined for null or undefined', () => {
      expect(validateOptionalBoolean(null, 'flag')).toBeUndefined();
      expect(validateOptionalBoolean(undefined, 'flag')).toBeUndefined();
    });

    it('should reject non-boolean values', () => {
      expect(() => validateOptionalBoolean('true', 'flag')).toThrow(ValidationError);
    });
  });

  describe('validateNumber', () => {
    it('should accept valid numbers', () => {
      expect(validateNumber(42, 'count')).toBe(42);
      expect(validateNumber(3.14, 'pi')).toBe(3.14);
      expect(validateNumber(0, 'zero')).toBe(0);
    });

    it('should reject non-finite numbers', () => {
      expect(() => validateNumber(NaN, 'count')).toThrow(ValidationError);
      expect(() => validateNumber(Infinity, 'count')).toThrow(ValidationError);
    });

    it('should enforce integer constraint', () => {
      expect(validateNumber(42, 'count', { integer: true })).toBe(42);
      expect(() => validateNumber(3.14, 'count', { integer: true })).toThrow(ValidationError);
    });

    it('should enforce min/max constraints', () => {
      expect(validateNumber(5, 'count', { min: 1, max: 10 })).toBe(5);
      expect(() => validateNumber(0, 'count', { min: 1 })).toThrow(ValidationError);
      expect(() => validateNumber(11, 'count', { max: 10 })).toThrow(ValidationError);
    });
  });

  describe('validateArray', () => {
    it('should accept valid arrays', () => {
      expect(validateArray([1, 2, 3], 'items')).toEqual([1, 2, 3]);
      expect(validateArray([], 'items')).toEqual([]);
    });

    it('should reject non-array values', () => {
      expect(() => validateArray('not-array', 'items')).toThrow(ValidationError);
      expect(() => validateArray(null, 'items')).toThrow(ValidationError);
    });

    it('should enforce length constraints', () => {
      expect(validateArray([1, 2], 'items', { minLength: 1, maxLength: 3 })).toEqual([1, 2]);
      expect(() => validateArray([], 'items', { minLength: 1 })).toThrow(ValidationError);
      expect(() => validateArray([1, 2, 3, 4], 'items', { maxLength: 3 })).toThrow(ValidationError);
    });

    it('should validate array elements', () => {
      const validator = (item: unknown) => validateNumber(item, 'item');
      expect(validateArray([1, 2, 3], 'numbers', { validator })).toEqual([1, 2, 3]);
      expect(() => validateArray([1, 'two', 3], 'numbers', { validator })).toThrow(ValidationError);
    });
  });

  describe('withValidation', () => {
    it('should pass through successful results', async () => {
      const handler = withValidation(async () => ({ success: true, data: 'result' }));
      const result = await handler();
      expect(result).toEqual({ success: true, data: 'result' });
    });

    it('should catch ValidationError and return error response', async () => {
      const handler = withValidation(async () => {
        throw new ValidationError('Test validation error');
      });
      const result = await handler();
      expect(result).toEqual({ success: false, error: 'Test validation error' });
    });

    it('should re-throw non-validation errors', async () => {
      const handler = withValidation(async () => {
        throw new Error('Non-validation error');
      });
      await expect(handler()).rejects.toThrow('Non-validation error');
    });

    it('should work with synchronous handlers', async () => {
      const handler = withValidation(() => {
        throw new ValidationError('Sync validation error');
      });
      const result = await handler();
      expect(result).toEqual({ success: false, error: 'Sync validation error' });
    });
  });
});
