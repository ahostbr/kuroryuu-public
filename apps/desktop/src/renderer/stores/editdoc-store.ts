/**
 * EditDoc Store - Global state for the markdown editor modal
 * Can be opened from anywhere in the app
 */

import { create } from 'zustand';

export interface EditDocState {
  isOpen: boolean;
  filePath: string | null;
  initialContent: string | null;
  isDirty: boolean;
  cursorPosition: { line: number; column: number };
  viewMode: 'split' | 'editor' | 'preview';
}

export interface EditDocActions {
  open: (filePath: string, content?: string) => void;
  close: () => void;
  setContent: (content: string) => void;
  setDirty: (dirty: boolean) => void;
  setCursorPosition: (line: number, column: number) => void;
  setViewMode: (mode: 'split' | 'editor' | 'preview') => void;
}

export const useEditDocStore = create<EditDocState & EditDocActions>((set) => ({
  // State
  isOpen: false,
  filePath: null,
  initialContent: null,
  isDirty: false,
  cursorPosition: { line: 1, column: 1 },
  viewMode: 'split',

  // Actions
  open: (filePath: string, content?: string) =>
    set({
      isOpen: true,
      filePath,
      initialContent: content ?? null,
      isDirty: false,
      cursorPosition: { line: 1, column: 1 },
    }),

  close: () =>
    set({
      isOpen: false,
      filePath: null,
      initialContent: null,
      isDirty: false,
    }),

  setContent: (_content: string) =>
    set({ isDirty: true }),

  setDirty: (dirty: boolean) =>
    set({ isDirty: dirty }),

  setCursorPosition: (line: number, column: number) =>
    set({ cursorPosition: { line, column } }),

  setViewMode: (mode: 'split' | 'editor' | 'preview') =>
    set({ viewMode: mode }),
}));
