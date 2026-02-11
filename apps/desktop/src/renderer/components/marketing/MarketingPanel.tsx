import { useEffect, useState } from 'react';
import { useMarketingStore } from '../../stores/marketing-store';
import { MarketingSetupWizard } from './MarketingSetupWizard';
import { MarketingWorkspace } from './MarketingWorkspace';

export function MarketingPanel() {
  const [state, setState] = useState<'loading' | 'setup' | 'workspace'>('loading');
  const setupComplete = useMarketingStore((s) => s.setupComplete);
  const setSetupComplete = useMarketingStore((s) => s.setSetupComplete);

  // Check setup state on mount
  useEffect(() => {
    const checkSetup = async () => {
      try {
        const result = await window.api.marketing.getSetupState();
        if (result.complete) {
          setSetupComplete(true);
          setState('workspace');
        } else {
          setState('setup');
        }
      } catch (err) {
        console.error('[Marketing] Failed to check setup state:', err);
        setState('setup');
      }
    };

    checkSetup();
  }, [setSetupComplete]);

  if (state === 'loading') {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-900">
        <div className="text-zinc-400 text-sm">Loading marketing workspace...</div>
      </div>
    );
  }

  if (state === 'setup' || !setupComplete) {
    return (
      <MarketingSetupWizard
        onComplete={() => {
          setSetupComplete(true);
          setState('workspace');
        }}
      />
    );
  }

  return <MarketingWorkspace />;
}
