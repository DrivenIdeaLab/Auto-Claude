import { create } from 'zustand';
import type { RateLimitInfo, SDKRateLimitInfo } from '../../shared/types';

interface RateLimitState {
  // Terminal rate limit modal
  isModalOpen: boolean;
  rateLimitInfo: RateLimitInfo | null;

  // SDK rate limit modal (for changelog, tasks, etc.)
  isSDKModalOpen: boolean;
  sdkRateLimitInfo: SDKRateLimitInfo | null;

  // Cost limit modal
  isCostLimitModalOpen: boolean;
  costLimitInfo: { message: string; profileId?: string } | null;

  // Track if there's a pending rate limit (persists after modal is closed)
  // User can click the sidebar indicator to reopen
  hasPendingRateLimit: boolean;
  pendingRateLimitType: 'terminal' | 'sdk' | 'cost' | null;

  // Actions
  showRateLimitModal: (info: RateLimitInfo) => void;
  hideRateLimitModal: () => void;
  showSDKRateLimitModal: (info: SDKRateLimitInfo) => void;
  hideSDKRateLimitModal: () => void;
  showCostLimitModal: (info: { message: string; profileId?: string }) => void;
  hideCostLimitModal: () => void;
  reopenRateLimitModal: () => void;
  clearPendingRateLimit: () => void;
}

export const useRateLimitStore = create<RateLimitState>((set, get) => ({
  isModalOpen: false,
  rateLimitInfo: null,
  isSDKModalOpen: false,
  sdkRateLimitInfo: null,
  isCostLimitModalOpen: false,
  costLimitInfo: null,
  hasPendingRateLimit: false,
  pendingRateLimitType: null,

  showRateLimitModal: (info: RateLimitInfo) => {
    set({
      isModalOpen: true,
      rateLimitInfo: info,
      hasPendingRateLimit: true,
      pendingRateLimitType: 'terminal'
    });
  },

  hideRateLimitModal: () => {
    // Keep the rate limit info and pending flag when closing
    // User can reopen via sidebar indicator
    set({ isModalOpen: false });
  },

  showSDKRateLimitModal: (info: SDKRateLimitInfo) => {
    set({
      isSDKModalOpen: true,
      sdkRateLimitInfo: info,
      hasPendingRateLimit: true,
      pendingRateLimitType: 'sdk'
    });
  },

  hideSDKRateLimitModal: () => {
    // Keep the rate limit info and pending flag when closing
    // User can reopen via sidebar indicator
    set({ isSDKModalOpen: false });
  },

  showCostLimitModal: (info) => {
    set({
      isCostLimitModalOpen: true,
      costLimitInfo: info,
      hasPendingRateLimit: true,
      pendingRateLimitType: 'cost'
    });
  },

  hideCostLimitModal: () => {
    set({ isCostLimitModalOpen: false });
  },

  reopenRateLimitModal: () => {
    const state = get();
    if (state.pendingRateLimitType === 'terminal' && state.rateLimitInfo) {
      set({ isModalOpen: true });
    } else if (state.pendingRateLimitType === 'sdk' && state.sdkRateLimitInfo) {
      set({ isSDKModalOpen: true });
    } else if (state.pendingRateLimitType === 'cost' && state.costLimitInfo) {
      set({ isCostLimitModalOpen: true });
    }
  },

  clearPendingRateLimit: () => {
    set({
      hasPendingRateLimit: false,
      pendingRateLimitType: null,
      rateLimitInfo: null,
      sdkRateLimitInfo: null,
      costLimitInfo: null
    });
  },
}));
