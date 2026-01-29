/**
 * Full Desktop Access Setup Wizard
 *
 * 2-step wizard:
 * 1. Consent - DANGER warning and acknowledgment
 * 2. Activate - Enable Full Desktop Access
 *
 * DANGER: This feature gives Claude FULL control of the Windows desktop.
 *
 * Uses pure PowerShell/Win32 APIs - no WinAppDriver required.
 *
 * PLATFORM: Windows only - requires PowerShell and Win32 APIs.
 * In Docker/Linux containers, k_pccontrol is automatically disabled.
 */

import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Check,
  AlertCircle,
  Loader2,
  ChevronRight,
  ChevronLeft,
  Monitor,
  AlertTriangle,
  Play,
  RefreshCw,
  Zap,
} from 'lucide-react';
import { ThemedFrame } from '../ui/ThemedFrame';
import { useIsThemedStyle } from '../../hooks/useTheme';

type WizardStep = 'consent' | 'activate';

const STEPS: { id: WizardStep; label: string }[] = [
  { id: 'consent', label: 'Consent' },
  { id: 'activate', label: 'Activate' },
];

interface FullDesktopWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete: () => void;
}

interface PCControlStatus {
  armed: boolean;
}

export function FullDesktopWizard({ open, onOpenChange, onComplete }: FullDesktopWizardProps) {
  const { isKuroryuu, isGrunge } = useIsThemedStyle();
  const [currentStep, setCurrentStep] = useState<WizardStep>('consent');

  // Consent state
  const [riskAcknowledged, setRiskAcknowledged] = useState(false);

  // Activate state
  const [checking, setChecking] = useState(false);
  const [status, setStatus] = useState<PCControlStatus | null>(null);
  const [armingConsent, setArmingConsent] = useState(false);
  const [arming, setArming] = useState(false);
  const [armError, setArmError] = useState<string | null>(null);

  // Check status when entering activate step
  useEffect(() => {
    if (currentStep === 'activate') {
      checkStatus();
    }
  }, [currentStep]);

  const checkStatus = async () => {
    setChecking(true);
    try {
      if (window.electronAPI?.pccontrol?.status) {
        const result = await window.electronAPI.pccontrol.status();
        setStatus(result);
      }
    } catch (err) {
      console.error('Failed to get status:', err);
    } finally {
      setChecking(false);
    }
  };

  const handleArm = async () => {
    setArming(true);
    setArmError(null);
    try {
      const result = await window.electronAPI.pccontrol.arm();
      if (result.success) {
        // Refresh status and complete
        await checkStatus();
        onComplete();
        onOpenChange(false);
      } else {
        setArmError(result.error || 'Failed to enable Full Desktop Access');
      }
    } catch (err) {
      console.error('Failed to arm:', err);
      setArmError(String(err));
    } finally {
      setArming(false);
    }
  };

  const currentStepIndex = STEPS.findIndex((s) => s.id === currentStep);

  const canGoNext = (): boolean => {
    switch (currentStep) {
      case 'consent':
        return riskAcknowledged;
      case 'activate':
        return status?.armed === true;
      default:
        return false;
    }
  };

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
    }
  };

  const goBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      setCurrentStep(STEPS[prevIndex].id);
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'consent':
        return (
          <div className="space-y-4">
            {/* DANGER Warning */}
            <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-4">
              <div className="flex items-center gap-2 text-red-400 font-semibold text-sm mb-2">
                <AlertTriangle className="w-5 h-5" />
                <span>DANGER: Full PC Control</span>
              </div>
              <ul className="text-xs text-red-400/80 space-y-1 list-disc list-inside">
                <li>Claude can control your ENTIRE computer</li>
                <li>Can read any visible text including passwords</li>
                <li>Can click, type, and manipulate any window</li>
                <li>Can launch any application</li>
              </ul>
            </div>

            {/* How it works */}
            <div className="bg-secondary/50 border border-border rounded-lg p-4">
              <div className="flex items-center gap-2 text-foreground font-medium text-sm mb-2">
                <Zap className="w-4 h-4 text-primary" />
                <span>How it works</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 list-disc list-inside">
                <li>Uses pure PowerShell and Windows APIs</li>
                <li>No external software required</li>
                <li>Session-only - resets when app restarts</li>
                <li>All actions are logged for auditing</li>
              </ul>
            </div>

            {/* Risk Acknowledgment */}
            <label className="flex items-start gap-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg cursor-pointer">
              <input
                type="checkbox"
                checked={riskAcknowledged}
                onChange={(e) => setRiskAcknowledged(e.target.checked)}
                className="mt-0.5 accent-red-500"
              />
              <span className="text-sm text-muted-foreground leading-tight">
                I understand that Full Desktop Access gives Claude complete control over my computer
                and I accept full responsibility for any actions taken.
              </span>
            </label>
          </div>
        );

      case 'activate':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Enable Full Desktop Access for this session. Claude will be able to control your PC.
            </p>

            {checking ? (
              <div className="flex items-center gap-2 p-4 bg-secondary rounded-lg">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm">Checking status...</span>
              </div>
            ) : (
              <div className="space-y-3">
                {/* Status indicator */}
                <div className={`flex items-center gap-2 p-3 rounded-lg ${
                  status?.armed
                    ? 'bg-red-500/10 border border-red-500/20'
                    : 'bg-secondary'
                }`}>
                  {status?.armed ? (
                    <>
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                      <span className="text-sm text-red-400 font-medium">ARMED - Full Desktop Access enabled</span>
                    </>
                  ) : (
                    <>
                      <Monitor className="w-4 h-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">Full Desktop Access is disabled</span>
                    </>
                  )}
                </div>

                {/* Arm controls */}
                {!status?.armed && (
                  <div className="space-y-3 pt-2">
                    {armError && (
                      <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                        <div className="flex items-center gap-2 mb-1">
                          <AlertCircle className="w-4 h-4 text-red-400" />
                          <span className="text-sm text-red-400 font-medium">Error</span>
                        </div>
                        <p className="text-xs text-red-400/80">{armError}</p>
                      </div>
                    )}

                    <label className="flex items-start gap-3 p-3 bg-red-500/5 border border-red-500/20 rounded-lg cursor-pointer">
                      <input
                        type="checkbox"
                        checked={armingConsent}
                        onChange={(e) => setArmingConsent(e.target.checked)}
                        className="mt-0.5 accent-red-500"
                      />
                      <span className="text-sm text-muted-foreground leading-tight">
                        I want to enable Full Desktop Access for this session. I understand this resets when the app restarts.
                      </span>
                    </label>

                    <button
                      onClick={handleArm}
                      disabled={!armingConsent || arming}
                      className="flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      {arming ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Play className="w-4 h-4" />
                      )}
                      Enable Full Desktop Access
                    </button>
                  </div>
                )}

                {status?.armed && (
                  <div className="pt-2">
                    <button
                      onClick={() => {
                        onComplete();
                        onOpenChange(false);
                      }}
                      className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 text-sm font-medium"
                    >
                      <Check className="w-4 h-4" />
                      Done
                    </button>
                    <p className="text-xs text-muted-foreground mt-2">
                      Full Desktop Access is session-only. It will be disabled when you restart the app.
                    </p>
                  </div>
                )}

                {/* Refresh button */}
                <button
                  onClick={checkStatus}
                  className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  <RefreshCw className="w-3 h-3" />
                  Refresh status
                </button>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 animate-in fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] max-h-[85vh] z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-left-1/2 slide-in-from-top-[48%] duration-200 focus:outline-none">
          <ThemedFrame size="md" variant={isKuroryuu ? 'dragon' : isGrunge ? 'grunge-square' : undefined}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground flex items-center gap-2">
                  <Monitor className="w-5 h-5 text-red-400" />
                  Full Desktop Access Setup
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground mt-0.5">
                  Step {currentStepIndex + 1} of {STEPS.length}: {STEPS[currentStepIndex].label}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>

            {/* Progress indicator */}
            <div className="flex items-center justify-center gap-2 p-4 border-b border-border">
              {STEPS.map((step, idx) => (
                <div key={step.id} className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                      idx < currentStepIndex
                        ? 'bg-green-500 text-white'
                        : idx === currentStepIndex
                        ? 'bg-red-500 text-white'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {idx < currentStepIndex ? <Check className="w-4 h-4" /> : idx + 1}
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div
                      className={`w-16 h-0.5 mx-1 ${
                        idx < currentStepIndex ? 'bg-green-500' : 'bg-secondary'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Content */}
            <div className="p-6 min-h-[250px] max-h-[50vh] overflow-y-auto">{renderStepContent()}</div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 border-t border-border">
              <button
                onClick={goBack}
                disabled={currentStepIndex === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>

              <div className="flex items-center gap-2">
                {currentStep !== 'activate' && (
                  <button
                    onClick={goNext}
                    disabled={!canGoNext()}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
