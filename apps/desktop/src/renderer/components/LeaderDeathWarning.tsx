/**
 * Leader Death Warning Modal
 *
 * Displayed when the leader terminal dies. Blocks all UI interaction
 * and requires app restart for security reasons (new secret generation).
 */

import * as Dialog from '@radix-ui/react-dialog';
import { AlertTriangle, RotateCcw } from 'lucide-react';
import { ThemedFrame } from './ui/ThemedFrame';
import { useIsThemedStyle } from '../hooks/useTheme';

interface LeaderDeathWarningProps{
  isOpen: boolean;
}

export function LeaderDeathWarning({ isOpen }: LeaderDeathWarningProps) {
  const { isKuroryuu, isGrunge } = useIsThemedStyle();
  const handleRestart = async () => {
    try {
      await window.electronAPI.app.restartApp();
    } catch (error) {
      console.error('Failed to restart app:', error);
    }
  };

  return (
    <Dialog.Root open={isOpen} modal={true}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999]" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10000]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="sm"
            className="w-[90vw] max-w-md border border-destructive/50 shadow-2xl shadow-destructive/20"
          >
          {/* Header */}
          <div className="flex items-center gap-3 mb-4">
            <div className="p-3 bg-destructive/20 rounded-full">
              <AlertTriangle className="w-6 h-6 text-destructive" />
            </div>
            <Dialog.Title className="text-xl font-semibold text-destructive">
              Leader Connection Lost
            </Dialog.Title>
          </div>

          {/* Body */}
          <div className="space-y-4 mb-6">
            <p className="text-foreground">
              The leader terminal has exited unexpectedly. For security reasons,
              the application must be restarted to generate a new authentication secret.
            </p>
            <p className="text-sm text-muted-foreground">
              This ensures no unauthorized agents can impersonate the leader during this session.
            </p>
          </div>

          {/* Footer */}
          <div className="flex justify-end">
            <button
              onClick={handleRestart}
              className="flex items-center gap-2 px-4 py-2 bg-destructive text-destructive-foreground
                         rounded-md font-medium hover:bg-destructive/90 transition-colors"
            >
              <RotateCcw className="w-4 h-4" />
              Restart Application
            </button>
          </div>
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
