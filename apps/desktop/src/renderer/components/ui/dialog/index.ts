/**
 * Kuroryuu Dialog System - Genmu Spirit Design
 * The Black Dragon of Illusionary Fog
 *
 * A unified dialog system replacing native dialogs with themed modals.
 */

// Components
export { KuroryuuDialog, type KuroryuuDialogProps, type DialogVariant, type DialogSize } from './KuroryuuDialog';
export { KuroryuuConfirmDialog, type KuroryuuConfirmDialogProps, type ConfirmDialogType } from './KuroryuuConfirmDialog';
export { KuroryuuDialogProvider } from './KuroryuuDialogProvider';

// Re-export hook for convenience
export { useKuroryuuDialog, showConfirm, showAlert, showDestructive } from '../../../hooks/useKuroryuuDialog';

// Re-export store types
export { type DialogConfig, type DialogType } from '../../../stores/dialog-store';
