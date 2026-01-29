/**
 * KuroryuuDialogProvider - Context Provider for Dialog System
 * Part of the Genmu Spirit Dialog System
 *
 * Renders queued dialogs from the Zustand store.
 * Wrap your App with this provider to enable the dialog system.
 */

import { ReactNode } from 'react';
import { useDialogStore } from '../../../stores/dialog-store';
import { KuroryuuConfirmDialog } from './KuroryuuConfirmDialog';

interface KuroryuuDialogProviderProps {
  children: ReactNode;
}

export function KuroryuuDialogProvider({ children }: KuroryuuDialogProviderProps) {
  const dialogs = useDialogStore((state) => state.dialogs);
  const resolveDialog = useDialogStore((state) => state.resolveDialog);

  // Get the current dialog (first in queue)
  const currentDialog = dialogs[0];

  return (
    <>
      {children}

      {/* Render current dialog */}
      {currentDialog && (
        <KuroryuuConfirmDialog
          key={currentDialog.id}
          open={true}
          onOpenChange={(open) => {
            if (!open) {
              resolveDialog(currentDialog.id, false);
            }
          }}
          title={currentDialog.title}
          message={currentDialog.message}
          type={currentDialog.type}
          confirmLabel={currentDialog.confirmLabel}
          cancelLabel={currentDialog.cancelLabel}
          onConfirm={() => {
            resolveDialog(currentDialog.id, true);
          }}
          onCancel={() => {
            resolveDialog(currentDialog.id, false);
          }}
        />
      )}
    </>
  );
}

export default KuroryuuDialogProvider;
