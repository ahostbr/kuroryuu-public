import { useEffect, useState } from 'react';
import { useLLMAppsStore } from '../../stores/llm-apps-store';
import { LLMAppsSetupWizard } from './LLMAppsSetupWizard';
import { LLMAppsCatalog } from './LLMAppsCatalog';

export function LLMAppsPanel() {
  const [state, setState] = useState<'loading' | 'setup' | 'catalog'>('loading');
  const setupComplete = useLLMAppsStore((s) => s.setupComplete);
  const setSetupComplete = useLLMAppsStore((s) => s.setSetupComplete);

  useEffect(() => {
    const checkSetup = async () => {
      try {
        const result = await window.electronAPI.llmApps.getSetupState();
        if (result.complete) {
          setSetupComplete(true);
          setState('catalog');
        } else {
          setState('setup');
        }
      } catch (err) {
        console.error('[LLM Apps] Failed to check setup state:', err);
        setState('setup');
      }
    };
    checkSetup();
  }, [setSetupComplete]);

  if (state === 'loading') {
    return (
      <div className="w-full h-full flex items-center justify-center bg-zinc-900">
        <div className="text-zinc-400 text-sm">Loading LLM Apps catalog...</div>
      </div>
    );
  }

  if (state === 'setup' || !setupComplete) {
    return (
      <LLMAppsSetupWizard
        onComplete={() => {
          setSetupComplete(true);
          setState('catalog');
        }}
      />
    );
  }

  return <LLMAppsCatalog />;
}
