/**
 * Custom hook for managing loading states
 * Groups all async operation loading flags
 */

import { useState, useCallback } from 'react';
import type { LoadingState } from './types';

export interface UseLoadingStateReturn extends LoadingState {
  setIsLoadingWorktree: (loading: boolean) => void;
  setIsLoadingPreview: (loading: boolean) => void;
  setIsLoadingLogs: (loading: boolean) => void;
  setIsMerging: (loading: boolean) => void;
  setIsDiscarding: (loading: boolean) => void;
  setIsSubmitting: (loading: boolean) => void;
  setIsDeleting: (loading: boolean) => void;
  setIsRecovering: (loading: boolean) => void;
  resetLoadingState: () => void;
}

const INITIAL_STATE: LoadingState = {
  isLoadingWorktree: false,
  isLoadingPreview: false,
  isLoadingLogs: false,
  isMerging: false,
  isDiscarding: false,
  isSubmitting: false,
  isDeleting: false,
  isRecovering: false,
} as const;

export function useLoadingState(): UseLoadingStateReturn {
  const [state, setState] = useState<LoadingState>(INITIAL_STATE);

  const setIsLoadingWorktree = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, isLoadingWorktree: loading }));
  }, []);

  const setIsLoadingPreview = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, isLoadingPreview: loading }));
  }, []);

  const setIsLoadingLogs = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, isLoadingLogs: loading }));
  }, []);

  const setIsMerging = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, isMerging: loading }));
  }, []);

  const setIsDiscarding = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, isDiscarding: loading }));
  }, []);

  const setIsSubmitting = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, isSubmitting: loading }));
  }, []);

  const setIsDeleting = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, isDeleting: loading }));
  }, []);

  const setIsRecovering = useCallback((loading: boolean) => {
    setState((prev) => ({ ...prev, isRecovering: loading }));
  }, []);

  const resetLoadingState = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    setIsLoadingWorktree,
    setIsLoadingPreview,
    setIsLoadingLogs,
    setIsMerging,
    setIsDiscarding,
    setIsSubmitting,
    setIsDeleting,
    setIsRecovering,
    resetLoadingState,
  };
}
