/**
 * Utility modules for the main process
 */

export { ProcessManager, getProcessManager, type ProcessExecutionOptions, type ProcessExecutionResult } from './process-manager';
export { getEffectiveSourcePath, validateAutoBuildSource } from './path-resolver';
export {
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
} from './ipc-validation';
