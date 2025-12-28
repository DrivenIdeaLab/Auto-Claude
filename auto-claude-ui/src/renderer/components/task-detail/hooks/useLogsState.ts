/**
 * Custom hook for managing task logs state
 * Handles phase logs, expansion state, and auto-scrolling
 */

import { useState, useCallback, useEffect, useRef } from 'react';
import type { LogsState } from './types';
import type { TaskLogs, TaskLogPhase } from '../../../../shared/types';

export interface UseLogsStateReturn extends LogsState {
  setPhaseLogs: (logs: TaskLogs | null) => void;
  setExpandedPhases: (phases: Set<TaskLogPhase> | ((prev: Set<TaskLogPhase>) => Set<TaskLogPhase>)) => void;
  setIsUserScrolledUp: (scrolledUp: boolean) => void;
  togglePhase: (phase: TaskLogPhase) => void;
  handleLogsScroll: (e: React.UIEvent<HTMLDivElement>) => void;
  logsEndRef: React.RefObject<HTMLDivElement>;
  logsContainerRef: React.RefObject<HTMLDivElement>;
}

export interface UseLogsStateOptions {
  projectId: string;
  specId: string;
  activeTab: string;
  taskLogs?: string[];
  onLoadStart?: () => void;
  onLoadEnd?: () => void;
}

const INITIAL_STATE: LogsState = {
  phaseLogs: null,
  expandedPhases: new Set(),
  isUserScrolledUp: false,
} as const;

export function useLogsState({
  projectId,
  specId,
  activeTab,
  taskLogs,
  onLoadStart,
  onLoadEnd,
}: UseLogsStateOptions): UseLogsStateReturn {
  const [state, setState] = useState<LogsState>(INITIAL_STATE);
  const logsEndRef = useRef<HTMLDivElement>(null);
  const logsContainerRef = useRef<HTMLDivElement>(null);

  const setPhaseLogs = useCallback((logs: TaskLogs | null) => {
    setState((prev) => ({ ...prev, phaseLogs: logs }));
  }, []);

  const setExpandedPhases = useCallback((
    phases: Set<TaskLogPhase> | ((prev: Set<TaskLogPhase>) => Set<TaskLogPhase>)
  ) => {
    setState((prev) => ({
      ...prev,
      expandedPhases: typeof phases === 'function' ? phases(prev.expandedPhases) : phases,
    }));
  }, []);

  const setIsUserScrolledUp = useCallback((scrolledUp: boolean) => {
    setState((prev) => ({ ...prev, isUserScrolledUp: scrolledUp }));
  }, []);

  // Toggle phase expansion
  const togglePhase = useCallback((phase: TaskLogPhase) => {
    setExpandedPhases((prev) => {
      const next = new Set(prev);
      if (next.has(phase)) {
        next.delete(phase);
      } else {
        next.add(phase);
      }
      return next;
    });
  }, [setExpandedPhases]);

  // Handle scroll events in logs to detect if user scrolled up
  const handleLogsScroll = useCallback((e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isNearBottom = target.scrollHeight - target.scrollTop - target.clientHeight < 100;
    setIsUserScrolledUp(!isNearBottom);
  }, [setIsUserScrolledUp]);

  // Auto-scroll logs to bottom only if user hasn't scrolled up
  useEffect(() => {
    if (activeTab === 'logs' && logsEndRef.current && !state.isUserScrolledUp) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [taskLogs, activeTab, state.isUserScrolledUp]);

  // Reset scroll state when switching to logs tab
  useEffect(() => {
    if (activeTab === 'logs') {
      setIsUserScrolledUp(false);
    }
  }, [activeTab, setIsUserScrolledUp]);

  // Load and watch phase logs
  useEffect(() => {
    if (!projectId) return;

    const loadLogs = async () => {
      onLoadStart?.();
      try {
        const result = await window.electronAPI.getTaskLogs(projectId, specId);
        if (result.success && result.data) {
          setPhaseLogs(result.data);
          // Auto-expand active phase
          const activePhase = (['planning', 'coding', 'validation'] as TaskLogPhase[]).find(
            (phase) => result.data?.phases[phase]?.status === 'active'
          );
          if (activePhase) {
            setExpandedPhases(new Set([activePhase]));
          }
        }
      } catch (err) {
        console.error('Failed to load task logs:', err);
      } finally {
        onLoadEnd?.();
      }
    };

    loadLogs();

    // Start watching for log changes
    window.electronAPI.watchTaskLogs(projectId, specId);

    // Listen for log changes
    const unsubscribe = window.electronAPI.onTaskLogsChanged((changedSpecId, logs) => {
      if (changedSpecId === specId) {
        setPhaseLogs(logs);
        // Auto-expand newly active phase
        const activePhase = (['planning', 'coding', 'validation'] as TaskLogPhase[]).find(
          (phase) => logs.phases[phase]?.status === 'active'
        );
        if (activePhase) {
          setExpandedPhases((prev) => {
            const next = new Set(prev);
            next.add(activePhase);
            return next;
          });
        }
      }
    });

    return () => {
      unsubscribe();
      window.electronAPI.unwatchTaskLogs(specId);
    };
  }, [projectId, specId, onLoadStart, onLoadEnd, setPhaseLogs, setExpandedPhases]);

  return {
    ...state,
    setPhaseLogs,
    setExpandedPhases,
    setIsUserScrolledUp,
    togglePhase,
    handleLogsScroll,
    logsEndRef,
    logsContainerRef,
  };
}
