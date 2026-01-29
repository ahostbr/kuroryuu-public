/**
 * Zustand store for Kuroryuu Dialog System
 * Manages dialog queue for imperative confirm/alert/destructive dialogs
 * Part of the Genmu Spirit Dialog System
 */

import { create } from 'zustand';

export type DialogType = 'confirm' | 'alert' | 'destructive';

export interface DialogConfig {
  id: string;
  type: DialogType;
  title: string;
  message: string | React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (result: boolean) => void;
}

interface DialogState {
  // Queue of dialogs to show (FIFO)
  dialogs: DialogConfig[];

  // Add a dialog to the queue and return a promise
  showDialog: (config: Omit<DialogConfig, 'id' | 'resolve'>) => Promise<boolean>;

  // Resolve the current dialog and remove it
  resolveDialog: (id: string, result: boolean) => void;

  // Get the current dialog (first in queue)
  currentDialog: () => DialogConfig | undefined;
}

let dialogIdCounter = 0;

export const useDialogStore = create<DialogState>((set, get) => ({
  dialogs: [],

  showDialog: (config) => {
    return new Promise<boolean>((resolve) => {
      const id = `dialog-${++dialogIdCounter}`;
      const dialog: DialogConfig = {
        ...config,
        id,
        resolve,
      };

      set((state) => ({
        dialogs: [...state.dialogs, dialog],
      }));
    });
  },

  resolveDialog: (id, result) => {
    const dialog = get().dialogs.find((d) => d.id === id);
    if (dialog) {
      dialog.resolve(result);
      set((state) => ({
        dialogs: state.dialogs.filter((d) => d.id !== id),
      }));
    }
  },

  currentDialog: () => {
    return get().dialogs[0];
  },
}));

// Helper functions for common dialog types
export function showConfirm(
  title: string,
  message: string,
  options?: { confirmLabel?: string; cancelLabel?: string }
): Promise<boolean> {
  return useDialogStore.getState().showDialog({
    type: 'confirm',
    title,
    message,
    ...options,
  });
}

export function showAlert(
  title: string,
  message: string,
  options?: { confirmLabel?: string }
): Promise<boolean> {
  return useDialogStore.getState().showDialog({
    type: 'alert',
    title,
    message,
    confirmLabel: options?.confirmLabel ?? 'OK',
  });
}

export function showDestructive(
  title: string,
  message: string,
  options?: { confirmLabel?: string; cancelLabel?: string }
): Promise<boolean> {
  return useDialogStore.getState().showDialog({
    type: 'destructive',
    title,
    message,
    confirmLabel: options?.confirmLabel ?? 'Delete',
    cancelLabel: options?.cancelLabel ?? 'Cancel',
    ...options,
  });
}
