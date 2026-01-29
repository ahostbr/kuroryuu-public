import { create } from 'zustand';
import { persist } from 'zustand/middleware';

export type WelcomeSection = 'overview' | 'cliproxyapi' | 'tray' | 'cli' | 'features' | 'architecture';

interface WelcomeState {
  // Navigation
  currentSection: WelcomeSection;
  setSection: (section: WelcomeSection) => void;

  // Guided Tour
  tourActive: boolean;
  tourStep: number;
  tourTotal: number;
  startTour: () => void;
  nextStep: () => void;
  prevStep: () => void;
  goToStep: (step: number) => void;
  endTour: () => void;

  // Hotspots
  activeHotspot: string | null;
  setActiveHotspot: (id: string | null) => void;

  // Video preferences (persisted)
  videoMuted: boolean;
  videoPaused: boolean;
  toggleMute: () => void;
  togglePause: () => void;

  // Completion tracking
  completedSections: WelcomeSection[];
  markSectionComplete: (section: WelcomeSection) => void;

  // Architecture diagram
  activeArchComponent: string | null;
  setActiveArchComponent: (id: string | null) => void;
  activeSuggestedPath: string | null;
  setActiveSuggestedPath: (id: string | null) => void;
}

export const useWelcomeStore = create<WelcomeState>()(
  persist(
    (set, get) => ({
      // Navigation
      currentSection: 'overview',
      setSection: (section) => set({ currentSection: section, activeHotspot: null }),

      // Guided Tour - 5 slides
      tourActive: false,
      tourStep: 0,
      tourTotal: 5,
      startTour: () => set({ tourActive: true, tourStep: 0, activeHotspot: null }),
      nextStep: () => {
        const { tourStep, tourTotal } = get();
        if (tourStep < tourTotal - 1) {
          set({ tourStep: tourStep + 1, activeHotspot: null });
        } else {
          // Tour complete
          set({ tourActive: false });
        }
      },
      prevStep: () => {
        const { tourStep } = get();
        if (tourStep > 0) {
          set({ tourStep: tourStep - 1, activeHotspot: null });
        }
      },
      goToStep: (step) => {
        const { tourTotal } = get();
        if (step >= 0 && step < tourTotal) {
          set({ tourStep: step, activeHotspot: null });
        }
      },
      endTour: () => set({ tourActive: false, activeHotspot: null }),

      // Hotspots
      activeHotspot: null,
      setActiveHotspot: (id) => set({ activeHotspot: id }),

      // Video preferences
      videoMuted: true,
      videoPaused: false,
      toggleMute: () => set((s) => ({ videoMuted: !s.videoMuted })),
      togglePause: () => set((s) => ({ videoPaused: !s.videoPaused })),

      // Completion tracking
      completedSections: [],
      markSectionComplete: (section) => {
        const { completedSections } = get();
        if (!completedSections.includes(section)) {
          set({ completedSections: [...completedSections, section] });
        }
      },

      // Architecture diagram
      activeArchComponent: null,
      setActiveArchComponent: (id) => set({ activeArchComponent: id }),
      activeSuggestedPath: null,
      setActiveSuggestedPath: (id) => set({ activeSuggestedPath: id }),
    }),
    {
      name: 'kuroryuu-welcome-store',
      partialize: (state) => ({
        // Only persist video preferences and completion
        videoMuted: state.videoMuted,
        completedSections: state.completedSections,
      }),
    }
  )
);
