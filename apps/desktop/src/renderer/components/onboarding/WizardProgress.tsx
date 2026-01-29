/**
 * WizardProgress - Progress indicator for onboarding wizard
 * Shows step dots with current step highlighted
 */
import React from 'react';
import { CheckCircle2 } from 'lucide-react';
import { OnboardingStep, ONBOARDING_STEPS, STEP_INFO } from '../../types/onboarding';
import { cn } from '../../lib/utils';

interface WizardProgressProps {
  currentStep: OnboardingStep;
  completedSteps: OnboardingStep[];
  onStepClick?: (step: OnboardingStep) => void;
}

export function WizardProgress({ currentStep, completedSteps, onStepClick }: WizardProgressProps) {
  const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);

  return (
    <div className="flex items-center justify-center gap-2 py-4">
      {ONBOARDING_STEPS.map((step, index) => {
        const isCompleted = completedSteps.includes(step);
        const isCurrent = step === currentStep;
        const isClickable = onStepClick && (isCompleted || index <= currentIndex);
        const stepInfo = STEP_INFO[step];

        return (
          <React.Fragment key={step}>
            {/* Step indicator */}
            <button
              onClick={() => isClickable && onStepClick?.(step)}
              disabled={!isClickable}
              className={cn(
                'relative flex items-center justify-center w-8 h-8 rounded-full transition-all duration-200',
                'focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 focus:ring-offset-background',
                isCompleted && 'bg-primary text-background',
                isCurrent && !isCompleted && 'bg-primary/20 border-2 border-primary text-primary',
                !isCompleted && !isCurrent && 'bg-secondary border border-border text-muted-foreground',
                isClickable && 'cursor-pointer hover:scale-110',
                !isClickable && 'cursor-default'
              )}
              title={stepInfo.title}
            >
              {isCompleted ? (
                <CheckCircle2 className="w-4 h-4" />
              ) : (
                <span className="text-xs font-semibold">{index + 1}</span>
              )}
            </button>

            {/* Connector line (not after last step) */}
            {index < ONBOARDING_STEPS.length - 1 && (
              <div
                className={cn(
                  'w-8 h-0.5 transition-colors duration-200',
                  index < currentIndex ? 'bg-primary' : 'bg-muted'
                )}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// Compact version for mobile or small dialogs
export function WizardProgressCompact({ currentStep, completedSteps }: WizardProgressProps) {
  const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
  const stepInfo = STEP_INFO[currentStep];

  return (
    <div className="flex flex-col items-center gap-2">
      {/* Progress bar */}
      <div className="w-full h-1 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full bg-primary transition-all duration-300 ease-out"
          style={{ width: `${((currentIndex + 1) / ONBOARDING_STEPS.length) * 100}%` }}
        />
      </div>

      {/* Step info */}
      <div className="text-center">
        <span className="text-xs text-muted-foreground">
          Step {currentIndex + 1} of {ONBOARDING_STEPS.length}
        </span>
        <span className="mx-2 text-muted">•</span>
        <span className="text-xs text-muted-foreground">{stepInfo.title}</span>
      </div>
    </div>
  );
}
