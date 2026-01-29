/**
 * Onboarding Store
 * Manages the 8-step setup wizard state
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  OnboardingState,
  OnboardingStep,
  ONBOARDING_STEPS,
  DEFAULT_ONBOARDING_STATE,
  AuthMethod,
  IDE,
  Terminal,
  MemoryConfig,
  PrivacyConfig,
} from '../types/onboarding';

interface OnboardingActions {
  // Navigation
  goToStep: (step: OnboardingStep) => void;
  goToNextStep: () => void;
  goToPreviousStep: () => void;
  markStepComplete: (step: OnboardingStep) => void;
  skipStep: () => void;

  // Auth Method
  setAuthMethod: (method: AuthMethod) => void;

  // OAuth
  startOAuth: () => void;
  completeOAuth: (email: string) => void;
  failOAuth: (error: string) => void;

  // API Key
  setApiKey: (key: string) => void;
  testApiKey: () => void;
  setApiKeyValid: () => void;
  setApiKeyInvalid: (error: string) => void;

  // CLI
  checkCLI: () => void;
  setCLIStatus: (installed: boolean, version?: string, path?: string) => void;

  // Dev Tools
  setPreferredIDE: (ide: IDE) => void;
  setPreferredTerminal: (terminal: Terminal) => void;
  setDetectAutomatically: (detect: boolean) => void;

  // Privacy
  updatePrivacy: (updates: Partial<PrivacyConfig>) => void;

  // Memory
  updateMemory: (updates: Partial<MemoryConfig>) => void;

  // Completion
  completeOnboarding: () => void;
  resetOnboarding: () => void;
}

type OnboardingStore = OnboardingState & OnboardingActions;

export const useOnboardingStore = create<OnboardingStore>()(
  persist(
    (set, get) => ({
      ...DEFAULT_ONBOARDING_STATE,

      // Navigation
      goToStep: (step) => set({ currentStep: step }),

      goToNextStep: () => {
        const { currentStep, completedSteps } = get();
        const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
        
        if (currentIndex < ONBOARDING_STEPS.length - 1) {
          const nextStep = ONBOARDING_STEPS[currentIndex + 1];
          set({
            currentStep: nextStep,
            completedSteps: completedSteps.includes(currentStep)
              ? completedSteps
              : [...completedSteps, currentStep],
          });
        }
      },

      goToPreviousStep: () => {
        const { currentStep } = get();
        const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
        
        if (currentIndex > 0) {
          set({ currentStep: ONBOARDING_STEPS[currentIndex - 1] });
        }
      },

      markStepComplete: (step) => {
        const { completedSteps } = get();
        if (!completedSteps.includes(step)) {
          set({ completedSteps: [...completedSteps, step] });
        }
      },

      skipStep: () => {
        get().goToNextStep();
      },

      // Auth Method
      setAuthMethod: (method) => set({ authMethod: method }),

      // OAuth
      startOAuth: () => set({
        oauth: { ...get().oauth, status: 'connecting', error: undefined }
      }),

      completeOAuth: (email) => set({
        oauth: { ...get().oauth, status: 'connected', email, error: undefined }
      }),

      failOAuth: (error) => set({
        oauth: { ...get().oauth, status: 'error', error }
      }),

      // API Key
      setApiKey: (key) => set({
        apiKey: { ...get().apiKey, key, status: 'idle', error: undefined }
      }),

      testApiKey: () => set({
        apiKey: { ...get().apiKey, status: 'testing', error: undefined }
      }),

      setApiKeyValid: () => set({
        apiKey: { ...get().apiKey, status: 'valid', error: undefined }
      }),

      setApiKeyInvalid: (error) => set({
        apiKey: { ...get().apiKey, status: 'invalid', error }
      }),

      // CLI
      checkCLI: () => set({
        cli: { ...get().cli, checking: true }
      }),

      setCLIStatus: (installed, version, path) => set({
        cli: { installed, version, path, checking: false }
      }),

      // Dev Tools
      setPreferredIDE: (ide) => set({
        devTools: { ...get().devTools, preferredIDE: ide }
      }),

      setPreferredTerminal: (terminal) => set({
        devTools: { ...get().devTools, preferredTerminal: terminal }
      }),

      setDetectAutomatically: (detect) => set({
        devTools: { ...get().devTools, detectAutomatically: detect }
      }),

      // Privacy
      updatePrivacy: (updates) => set({
        privacy: { ...get().privacy, ...updates }
      }),

      // Memory
      updateMemory: (updates) => set({
        memory: { ...get().memory, ...updates }
      }),

      // Completion
      completeOnboarding: () => set({
        isComplete: true,
        currentStep: 'completion',
        completedSteps: [...ONBOARDING_STEPS],
      }),

      resetOnboarding: () => set(DEFAULT_ONBOARDING_STATE),
    }),
    {
      name: 'kuroryuu-onboarding',
      partialize: (state) => ({
        isComplete: state.isComplete,
        authMethod: state.authMethod,
        apiKey: {
          key: state.apiKey.key,
          status: state.apiKey.status,
        },
        oauth: state.oauth,
        devTools: state.devTools,
        privacy: state.privacy,
        memory: state.memory,
      }),
    }
  )
);

// Selector hooks for common patterns
export const useOnboardingStep = () => useOnboardingStore((s) => s.currentStep);
export const useIsOnboardingComplete = () => useOnboardingStore((s) => s.isComplete);
export const useOnboardingProgress = () => {
  const currentStep = useOnboardingStore((s) => s.currentStep);
  const completedSteps = useOnboardingStore((s) => s.completedSteps);
  const currentIndex = ONBOARDING_STEPS.indexOf(currentStep);
  return {
    current: currentIndex + 1,
    total: ONBOARDING_STEPS.length,
    percentage: Math.round(((currentIndex + 1) / ONBOARDING_STEPS.length) * 100),
    completedCount: completedSteps.length,
  };
};
