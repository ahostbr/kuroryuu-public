/**
 * OnboardingWizard - Main 8-step setup wizard
 * Full-screen dialog that guides users through initial setup
 */
import React, { useCallback } from 'react';
import { X, RotateCcw } from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { useOnboardingStore, useOnboardingProgress } from '../../stores/onboarding-store';
import { AuthMethod, IDE, Terminal, PrivacyConfig, MemoryConfig } from '../../types/onboarding';
import { WizardProgress } from './WizardProgress';
import { ThemedFrame } from '../ui/ThemedFrame';
import { useIsThemedStyle } from '../../hooks/useTheme';
import {
  WelcomeStep,
  AuthMethodStep,
  AuthStep,
  CLIStep,
  DevToolsStep,
  PrivacyStep,
  MemoryStep,
  CompletionStep,
} from './steps';

interface OnboardingWizardProps {
  open: boolean;
  onComplete: () => void;
}

export function OnboardingWizard({ open, onComplete }: OnboardingWizardProps) {
  const store = useOnboardingStore();
  const progress = useOnboardingProgress();
  const { isKuroryuu, isGrunge } = useIsThemedStyle();

  // Handlers for each step
  const handleAuthMethodSelect = (method: AuthMethod) => {
    store.setAuthMethod(method);
  };

  // Custom continue handler for auth-method step
  const handleAuthMethodContinue = () => {
    if (store.authMethod === 'local-llm') {
      // Skip auth step entirely for local LLM - go directly to CLI step
      store.markStepComplete('auth-method');
      store.markStepComplete('auth');  // Mark auth as complete (skipped)
      store.goToStep('cli');
    } else {
      store.goToNextStep();
    }
  };

  const handleStartOAuth = () => {
    store.startOAuth();
    // In a real implementation, this would open an OAuth flow
    // For now, simulate success after 2 seconds
    setTimeout(() => {
      store.completeOAuth('user@example.com');
    }, 2000);
  };

  const handleTestApiKey = () => {
    store.testApiKey();
    // In a real implementation, this would test the API key against the gateway
    // For now, simulate validation after 1 second
    setTimeout(() => {
      if (store.apiKey.key.startsWith('sk-ant-')) {
        store.setApiKeyValid();
      } else {
        store.setApiKeyInvalid('Invalid API key format. Key should start with sk-ant-');
      }
    }, 1000);
  };

  const handleCheckCLI = useCallback(async () => {
    store.checkCLI();
    
    try {
      // Use real CLI detection via IPC
      const result = await window.electronAPI.cli.detect('claude');
      
      if (result.found) {
        store.setCLIStatus(true, result.version, result.path);
      } else {
        store.setCLIStatus(false);
      }
    } catch (error) {
      console.error('CLI detection failed:', error);
      store.setCLIStatus(false);
    }
  }, [store]);

  const handleSetIDE = (ide: IDE) => {
    store.setPreferredIDE(ide);
  };

  const handleSetTerminal = (terminal: Terminal) => {
    store.setPreferredTerminal(terminal);
  };

  const handleUpdatePrivacy = (updates: Partial<PrivacyConfig>) => {
    store.updatePrivacy(updates);
  };

  const handleUpdateMemory = (updates: Partial<MemoryConfig>) => {
    store.updateMemory(updates);
  };

  const handleComplete = () => {
    store.completeOnboarding();
    onComplete();
  };

  const handleOpenProject = () => {
    // In a real implementation, this would open a file picker
    handleComplete();
  };

  const handleResetWizard = () => {
    store.resetOnboarding();
  };

  // Render current step
  const renderStep = () => {
    switch (store.currentStep) {
      case 'welcome':
        return <WelcomeStep onContinue={store.goToNextStep} />;

      case 'auth-method':
        return (
          <AuthMethodStep
            selectedMethod={store.authMethod}
            onSelectMethod={handleAuthMethodSelect}
            onContinue={handleAuthMethodContinue}
            onBack={store.goToPreviousStep}
          />
        );

      case 'auth':
        return (
          <AuthStep
            authMethod={store.authMethod!}
            oauth={store.oauth}
            apiKey={store.apiKey}
            onStartOAuth={handleStartOAuth}
            onSetApiKey={store.setApiKey}
            onTestApiKey={handleTestApiKey}
            onContinue={store.goToNextStep}
            onBack={store.goToPreviousStep}
          />
        );

      case 'cli':
        return (
          <CLIStep
            cliStatus={store.cli}
            onCheckCLI={handleCheckCLI}
            onContinue={store.goToNextStep}
            onSkip={store.skipStep}
            onBack={store.goToPreviousStep}
          />
        );

      case 'dev-tools':
        return (
          <DevToolsStep
            config={store.devTools}
            onSetIDE={handleSetIDE}
            onSetTerminal={handleSetTerminal}
            onContinue={store.goToNextStep}
            onSkip={store.skipStep}
            onBack={store.goToPreviousStep}
          />
        );

      case 'privacy':
        return (
          <PrivacyStep
            config={store.privacy}
            onUpdatePrivacy={handleUpdatePrivacy}
            onContinue={store.goToNextStep}
            onBack={store.goToPreviousStep}
          />
        );

      case 'memory':
        return (
          <MemoryStep
            config={store.memory}
            onUpdateMemory={handleUpdateMemory}
            onContinue={store.goToNextStep}
            onSkip={store.skipStep}
            onBack={store.goToPreviousStep}
          />
        );

      case 'completion':
        return (
          <CompletionStep
            onComplete={handleComplete}
            onOpenProject={handleOpenProject}
          />
        );

      default:
        return null;
    }
  };

  return (
    <Dialog.Root open={open}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed inset-4 z-50">
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="full"
            className="h-full overflow-hidden flex flex-col"
            contentClassName="flex-1 flex flex-col min-h-0"
          >
            {/* Visually hidden title for accessibility */}
          <Dialog.Title className="sr-only">Setup Wizard</Dialog.Title>
          <Dialog.Description className="sr-only">
            Configure Kuroryuu settings in {progress.total} steps
          </Dialog.Description>
          
          {/* Header */}
          <div className="flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <span className="text-sm font-bold text-background">AC</span>
              </div>
              <div>
                <h2 className="text-sm font-semibold text-white">Setup Wizard</h2>
                <p className="text-xs text-muted-foreground">Step {progress.current} of {progress.total}</p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              {/* Reset wizard button */}
              <button
                onClick={handleResetWizard}
                className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                title="Reset wizard"
              >
                <RotateCcw className="w-4 h-4" />
              </button>

              {/* Close button (only on completion step) */}
              {store.currentStep === 'completion' && (
                <Dialog.Close asChild>
                  <button
                    onClick={handleComplete}
                    className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </Dialog.Close>
              )}
            </div>
          </div>

          {/* Progress indicator */}
          <div className="px-6 py-2 border-b border-border/50">
            <WizardProgress
              currentStep={store.currentStep}
              completedSteps={store.completedSteps}
              onStepClick={(step) => {
                // Allow clicking on completed steps or current step
                if (store.completedSteps.includes(step)) {
                  store.goToStep(step);
                }
              }}
            />
          </div>

          {/* Step content */}
          <div className="flex-1 flex flex-col overflow-hidden min-h-0">
            {renderStep()}
          </div>
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
