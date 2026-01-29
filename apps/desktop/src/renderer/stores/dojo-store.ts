/**
 * Zustand store for Dojo - Simplified Planning Workspace
 *
 * After drift cleanup:
 * - NO feature kanban state
 * - NO gateway feature sync
 * - Features flow through todo.md → KanbanBoard
 *
 * Kept for potential future use:
 * - Minimal configuration state for tabs
 */
import { create } from 'zustand';

interface DojoStore {
  // Minimal state - just tab tracking for potential future enhancements
  lastActiveTab: 'formulas' | 'roadmap' | 'ideation';
  setLastActiveTab: (tab: 'formulas' | 'roadmap' | 'ideation') => void;
}

export const useDojoStore = create<DojoStore>((set) => ({
  lastActiveTab: 'formulas',

  setLastActiveTab: (tab) => set({ lastActiveTab: tab }),
}));
