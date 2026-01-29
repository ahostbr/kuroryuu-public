/**
 * useKuroryuuDialog - Imperative Hook for Dialog System
 * Part of the Genmu Spirit Dialog System
 *
 * Provides Promise-based API to replace window.confirm() calls.
 *
 * Usage:
 * ```tsx
 * const { confirm, alert, confirmDestructive } = useKuroryuuDialog();
 *
 * // Simple confirm - returns Promise<boolean>
 * const yes = await confirm({
 *   title: 'Confirm Action',
 *   message: 'Are you sure?'
 * });
 *
 * // Destructive action - red styling
 * const proceed = await confirmDestructive({
 *   title: 'Delete Everything',
 *   message: 'This cannot be undone.',
 *   confirmLabel: 'Delete All'
 * });
 *
 * // Info alert - single OK button
 * await alert({
 *   title: 'Success',
 *   message: 'Operation completed.'
 * });
 * ```
 */

import { useCallback } from 'react';
import { useDialogStore } from '../stores/dialog-store';

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

interface AlertOptions {
  title: string;
  message: string;
  confirmLabel?: string;
}

interface DestructiveOptions {
  title: string;
  message: string;
  confirmLabel?: string;
  cancelLabel?: string;
}

export function useKuroryuuDialog() {
  const showDialog = useDialogStore((state) => state.showDialog);

  /**
   * Show a confirmation dialog
   * @returns Promise<boolean> - true if confirmed, false if cancelled
   */
  const confirm = useCallback(
    (options: ConfirmOptions): Promise<boolean> => {
      return showDialog({
        type: 'confirm',
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Yes',
        cancelLabel: options.cancelLabel ?? 'No',
      });
    },
    [showDialog]
  );

  /**
   * Show an alert dialog (single OK button)
   * @returns Promise<boolean> - always true when dismissed
   */
  const alert = useCallback(
    (options: AlertOptions): Promise<boolean> => {
      return showDialog({
        type: 'alert',
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'OK',
      });
    },
    [showDialog]
  );

  /**
   * Show a destructive confirmation dialog (red styling)
   * @returns Promise<boolean> - true if confirmed, false if cancelled
   */
  const confirmDestructive = useCallback(
    (options: DestructiveOptions): Promise<boolean> => {
      return showDialog({
        type: 'destructive',
        title: options.title,
        message: options.message,
        confirmLabel: options.confirmLabel ?? 'Delete',
        cancelLabel: options.cancelLabel ?? 'Cancel',
      });
    },
    [showDialog]
  );

  return {
    confirm,
    alert,
    confirmDestructive,
  };
}

// Standalone functions for use outside React components
export { showConfirm, showAlert, showDestructive } from '../stores/dialog-store';

export default useKuroryuuDialog;
