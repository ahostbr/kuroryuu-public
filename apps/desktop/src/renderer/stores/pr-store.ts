/**
 * PR Store - Zustand store for PR state management
 */

import { create } from 'zustand';
import type { PRInfo, PRReviewResult } from '../types/github-workflow';

interface PRStoreState {
  /** Map of PR number to PR info */
  prs: Record<number, PRInfo>;
  /** Map of PR number to review result */
  reviews: Record<number, PRReviewResult>;
  /** Loading state */
  loading: boolean;
  /** Last error */
  error: string | null;
  /** Last fetch timestamp */
  lastFetch: number;
}

interface PRStoreActions {
  /** Fetch all open PRs from Gateway */
  fetchPRs: (token: string) => Promise<void>;
  /** Fetch a specific PR */
  fetchPR: (number: number, token: string) => Promise<PRInfo | null>;
  /** Trigger review for a PR */
  triggerReview: (number: number, token: string, taskId?: string) => Promise<PRReviewResult | null>;
  /** Merge a PR */
  mergePR: (number: number, token: string) => Promise<boolean>;
  /** Clear store */
  clear: () => void;
}

const GATEWAY_URL = 'http://127.0.0.1:8200';

export const usePRStore = create<PRStoreState & PRStoreActions>((set, get) => ({
  prs: {},
  reviews: {},
  loading: false,
  error: null,
  lastFetch: 0,

  fetchPRs: async (token: string) => {
    set({ loading: true, error: null });
    try {
      const resp = await fetch(`${GATEWAY_URL}/v1/github/pr/list`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) throw new Error(`Failed to fetch PRs: ${resp.status}`);
      const data = await resp.json();
      const prMap: Record<number, PRInfo> = {};
      for (const pr of data.prs || []) {
        prMap[pr.number] = pr;
      }
      set({ prs: prMap, loading: false, lastFetch: Date.now() });
    } catch (e) {
      set({ loading: false, error: String(e) });
    }
  },

  fetchPR: async (number: number, token: string) => {
    try {
      const resp = await fetch(`${GATEWAY_URL}/v1/github/pr/${number}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return null;
      const pr = await resp.json();
      set((state) => ({ prs: { ...state.prs, [number]: pr } }));
      return pr;
    } catch {
      return null;
    }
  },

  triggerReview: async (number: number, token: string, taskId?: string) => {
    try {
      const url = new URL(`${GATEWAY_URL}/v1/github/pr/${number}/review`);
      if (taskId) url.searchParams.set('task_id', taskId);
      const resp = await fetch(url.toString(), {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!resp.ok) return null;
      const review = await resp.json();
      set((state) => ({ reviews: { ...state.reviews, [number]: review } }));
      return review;
    } catch {
      return null;
    }
  },

  mergePR: async (number: number, token: string) => {
    try {
      const resp = await fetch(`${GATEWAY_URL}/v1/github/pr/${number}/merge`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ merge_method: 'merge' }),
      });
      return resp.ok;
    } catch {
      return false;
    }
  },

  clear: () => {
    set({ prs: {}, reviews: {}, loading: false, error: null, lastFetch: 0 });
  },
}));
