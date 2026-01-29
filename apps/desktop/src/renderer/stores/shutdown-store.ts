import { create } from 'zustand';

interface ShutdownState {
  isOpen: boolean;
  currentStep: string;
  countdown: number;
  progress: number; // 0-100
  openDialog: () => void;
  closeDialog: () => void;
  updateProgress: (step: string, progress: number) => void;
  setCountdown: (count: number) => void;
}

export const useShutdownStore = create<ShutdownState>((set) => ({
  isOpen: false,
  currentStep: '',
  countdown: -1, // -1 = not counting
  progress: 0,

  openDialog: () => set({ isOpen: true, currentStep: 'Starting cleanup...', progress: 0 }),
  closeDialog: () => set({ isOpen: false }),

  updateProgress: (step: string, progress: number) =>
    set({ currentStep: step, progress }),

  setCountdown: (count: number) =>
    set({ countdown: count }),
}));
