/**
 * Custom hook for managing scheduled restart state
 * Polls for scheduled restart status and provides controls
 */

import { useState, useCallback, useEffect } from 'react';
import type { ScheduledRestartState } from './types';

export interface UseScheduledRestartStateReturn extends ScheduledRestartState {
  setScheduledRestart: (restart: ScheduledRestartState['scheduledRestart']) => void;
  clearScheduledRestart: () => void;
}

export interface UseScheduledRestartStateOptions {
  taskId: string;
  isRunning: boolean;
}

const INITIAL_STATE: ScheduledRestartState = {
  scheduledRestart: null,
} as const;

const POLL_INTERVAL_MS = 5000; // 5 seconds

export function useScheduledRestartState({
  taskId,
  isRunning,
}: UseScheduledRestartStateOptions): UseScheduledRestartStateReturn {
  const [state, setState] = useState<ScheduledRestartState>(INITIAL_STATE);

  const setScheduledRestart = useCallback((restart: ScheduledRestartState['scheduledRestart']) => {
    setState({ scheduledRestart: restart });
  }, []);

  const clearScheduledRestart = useCallback(() => {
    setState(INITIAL_STATE);
  }, []);

  // Poll for scheduled restart status if task is in progress but possibly rate limited
  useEffect(() => {
    let interval: NodeJS.Timeout;

    const checkRestart = async () => {
      try {
        const result = await window.electronAPI.getScheduledRestart(taskId);
        if (result.success && result.data) {
          setScheduledRestart(result.data.scheduled ? result.data : null);
        }
      } catch (err) {
        console.error('Failed to check scheduled restart:', err);
      }
    };

    if (isRunning) {
      checkRestart();
      interval = setInterval(checkRestart, POLL_INTERVAL_MS);
    } else {
      setScheduledRestart(null);
    }

    return () => clearInterval(interval);
  }, [taskId, isRunning, setScheduledRestart]);

  return {
    ...state,
    setScheduledRestart,
    clearScheduledRestart,
  };
}
