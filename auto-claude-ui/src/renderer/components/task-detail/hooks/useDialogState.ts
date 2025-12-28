/**
 * Custom hook for managing dialog visibility state
 * Groups all modal/dialog open/closed states
 */

import { useState, useCallback } from 'react';
import type { DialogState } from './types';

export interface UseDialogStateReturn extends DialogState {
  setShowDeleteDialog: (show: boolean) => void;
  setShowDiscardDialog: (show: boolean) => void;
  setShowDiffDialog: (show: boolean) => void;
  setShowConflictDialog: (show: boolean) => void;
  setIsEditDialogOpen: (open: boolean) => void;
  closeAllDialogs: () => void;
}

const INITIAL_STATE: DialogState = {
  showDeleteDialog: false,
  showDiscardDialog: false,
  showDiffDialog: false,
  showConflictDialog: false,
  isEditDialogOpen: false,
} as const;

export function useDialogState(): UseDialogStateReturn {
  const [state, setState] = useState<DialogState>(INITIAL_STATE);

  const setShowDeleteDialog = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showDeleteDialog: show }));
  }, []);

  const setShowDiscardDialog = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showDiscardDialog: show }));
  }, []);

  const setShowDiffDialog = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showDiffDialog: show }));
  }, []);

  const setShowConflictDialog = useCallback((show: boolean) => {
    setState((prev) => ({ ...prev, showConflictDialog: show }));
  }, []);

  const setIsEditDialogOpen = useCallback((open: boolean) => {
    setState((prev) => ({ ...prev, isEditDialogOpen: open }));
  }, []);

  const closeAllDialogs = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  return {
    ...state,
    setShowDeleteDialog,
    setShowDiscardDialog,
    setShowDiffDialog,
    setShowConflictDialog,
    setIsEditDialogOpen,
    closeAllDialogs,
  };
}
