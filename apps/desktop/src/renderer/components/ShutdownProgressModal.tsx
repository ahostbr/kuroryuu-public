import * as Dialog from '@radix-ui/react-dialog';
import { Loader2 } from 'lucide-react';
import { useShutdownStore } from '../stores/shutdown-store';
import { useIsThemedStyle } from '../hooks/useTheme';
import { ThemedFrame } from './ui/ThemedFrame';

export function ShutdownProgressModal() {
  const { isOpen, currentStep, countdown, progress } = useShutdownStore();
  const { isKuroryuu, isGrunge } = useIsThemedStyle();

  // Content to render (shared between themed and non-themed versions)
  const content = (
    <div className="text-center space-y-4">
      <Loader2 className="w-12 h-12 animate-spin mx-auto text-primary" />

      <div>
        <p className="font-semibold text-lg text-foreground">Cleaning up...</p>
        <p className="text-sm text-muted-foreground mt-1">{currentStep}</p>
      </div>

      {/* Progress bar */}
      <div className="w-full h-2 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300"
          style={{ width: `${progress}%` }}
        />
      </div>

      {/* Countdown */}
      {countdown > 0 && (
        <p className="text-2xl font-bold text-primary">
          Quitting in {countdown}...
        </p>
      )}

      {countdown === 0 && (
        <p className="text-lg font-medium text-success">Done!</p>
      )}
    </div>
  );

  return (
    <Dialog.Root open={isOpen}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[9999]" />
        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[9999]"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          {/* Visually hidden title and description for accessibility */}
          <Dialog.Title className="sr-only">Shutting Down</Dialog.Title>
          <Dialog.Description className="sr-only">
            Application is performing cleanup operations before closing
          </Dialog.Description>

          {/* Themed frame for Kuroryuu and Grunge */}
          {(isKuroryuu || isGrunge) ? (
            <ThemedFrame
              variant={isKuroryuu ? 'dragon' : 'grunge-square'}
              size="md"
              className="w-96 max-w-[90vw]"
            >
              {content}
            </ThemedFrame>
          ) : (
            /* Standard frame for other themes */
            <div className="w-96 bg-background border border-border rounded-xl shadow-2xl p-6">
              {content}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
