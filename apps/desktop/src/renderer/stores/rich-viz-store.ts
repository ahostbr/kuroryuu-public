/**
 * Zustand store for Rich Tool Visualization Popups
 *
 * Manages popup queue for terminal worker visualizations.
 * Popups appear when MCP tools execute in terminal workers (when enabled).
 */

import { create } from 'zustand';
import type { RichCardType, RAGResultsData, FileTreeData, ToolOutputData } from '../types/insights';

export interface RichVizPopup {
  id: string;
  type: RichCardType;
  workerId: string;
  workerLabel?: string;
  toolName: string;
  data: RAGResultsData | FileTreeData | ToolOutputData;
  timestamp: number;
  position?: {
    x: number;
    y: number;
  };
}

interface RichVizState {
  popups: RichVizPopup[];
  maxPopups: number;
  autoDismissMs: number;

  // Actions
  addPopup: (popup: Omit<RichVizPopup, 'id' | 'timestamp'>) => string;
  dismissPopup: (id: string) => void;
  dismissAll: () => void;
  updatePopupPosition: (id: string, position: { x: number; y: number }) => void;
  setAutoDismissMs: (ms: number) => void;
}

function generateId(): string {
  return `rvp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export const useRichVizStore = create<RichVizState>((set, get) => ({
  popups: [],
  maxPopups: 5,
  autoDismissMs: 0, // 0 = no auto-dismiss

  addPopup: (popupData) => {
    const id = generateId();
    const popup: RichVizPopup = {
      ...popupData,
      id,
      timestamp: Date.now(),
    };

    set((state) => {
      // Keep only the most recent popups
      const newPopups = [popup, ...state.popups].slice(0, state.maxPopups);
      return { popups: newPopups };
    });

    // Auto-dismiss if configured
    const { autoDismissMs } = get();
    if (autoDismissMs > 0) {
      setTimeout(() => {
        get().dismissPopup(id);
      }, autoDismissMs);
    }

    return id;
  },

  dismissPopup: (id) => {
    set((state) => ({
      popups: state.popups.filter((p) => p.id !== id),
    }));
  },

  dismissAll: () => {
    set({ popups: [] });
  },

  updatePopupPosition: (id, position) => {
    set((state) => ({
      popups: state.popups.map((p) =>
        p.id === id ? { ...p, position } : p
      ),
    }));
  },

  setAutoDismissMs: (ms) => {
    set({ autoDismissMs: ms });
  },
}));

// Helper to create popups from tool results
export function createRAGPopup(
  workerId: string,
  workerLabel: string,
  data: RAGResultsData,
  position?: { x: number; y: number }
): Omit<RichVizPopup, 'id' | 'timestamp'> {
  return {
    type: 'rag-results',
    workerId,
    workerLabel,
    toolName: 'k_rag',
    data,
    position,
  };
}

export function createFileTreePopup(
  workerId: string,
  workerLabel: string,
  data: FileTreeData,
  position?: { x: number; y: number }
): Omit<RichVizPopup, 'id' | 'timestamp'> {
  return {
    type: 'file-tree',
    workerId,
    workerLabel,
    toolName: 'k_files',
    data,
    position,
  };
}

export function createToolOutputPopup(
  workerId: string,
  workerLabel: string,
  toolName: string,
  output: string,
  position?: { x: number; y: number }
): Omit<RichVizPopup, 'id' | 'timestamp'> {
  return {
    type: 'tool-output',
    workerId,
    workerLabel,
    toolName,
    data: {
      toolName,
      output,
      isJson: false,
    } as ToolOutputData,
    position,
  };
}
