import { useEffect, useState } from 'react';
import { useExcalidrawStore } from '../../stores/excalidraw-store';
import { ExcalidrawSetupWizard } from './ExcalidrawSetupWizard';
import { ExcalidrawWorkspace } from './ExcalidrawWorkspace';

export function ExcalidrawPanel() {
  const [state, setState] = useState<'loading' | 'setup' | 'workspace'>('loading');
  const setupComplete = useExcalidrawStore((s) => s.setupComplete);
  const setSetupComplete = useExcalidrawStore((s) => s.setSetupComplete);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const result = await window.electronAPI.excalidraw.getSetupState();
        if (result.complete) {
          setSetupComplete(true);
          setState('workspace');
        } else {
          setState('setup');
        }
      } catch (err) {
        console.error('[Excalidraw] Failed to check setup state:', err);
        setState('setup');
      }
    };

    checkSetup();
  }, [setSetupComplete]);

  if (state === 'loading') {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-900">
        <div className="text-zinc-400 text-sm">Loading excalidraw workspace...</div>
      </div>
    );
  }

  if (state === 'setup' || !setupComplete) {
    return (
      <ExcalidrawSetupWizard
        onComplete={() => {
          setSetupComplete(true);
          setState('workspace');
        }}
      />
    );
  }

  return <ExcalidrawWorkspace />;
}
