/**
 * Project Store
 * Manages multi-project state, initialization, and switching
 */
import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  Project,
  ProjectSettings,
  InitializationOptions,
  InitializationProgress,
  DEFAULT_INIT_OPTIONS,
} from '../types/project';

interface ProjectActions {
  // Project CRUD
  addProject: (project: Omit<Project, 'id' | 'createdAt' | 'lastOpenedAt'>) => string;
  removeProject: (projectId: string) => void;
  updateProject: (projectId: string, updates: Partial<Project>) => void;
  
  // Project selection
  setActiveProject: (projectId: string | null) => void;
  getActiveProject: () => Project | null;
  
  // Project initialization
  openInitDialog: () => void;
  closeInitDialog: () => void;
  initializeProject: (projectPath: string, options: InitializationOptions) => Promise<void>;
  
  // Loading/error state
  setLoading: (loading: boolean) => void;
  setError: (error: string | null) => void;
}

interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  isLoading: boolean;
  error: string | null;
  initDialogOpen: boolean;
  initProgress: InitializationProgress | null;
}

type ProjectStore = ProjectState & ProjectActions;

export const useProjectStore = create<ProjectStore>()(
  persist(
    (set, get) => ({
      // Initial state
      projects: [],
      activeProjectId: null,
      isLoading: false,
      error: null,
      initDialogOpen: false,
      initProgress: null,

      // Project CRUD
      addProject: (project) => {
        const id = `project-${Date.now()}`;
        const newProject: Project = {
          ...project,
          id,
          createdAt: Date.now(),
          lastOpenedAt: Date.now(),
        };
        
        set((state) => ({
          projects: [...state.projects, newProject],
          activeProjectId: id,
        }));
        
        return id;
      },

      removeProject: (projectId) => {
        set((state) => {
          const newProjects = state.projects.filter((p) => p.id !== projectId);
          const newActiveId = state.activeProjectId === projectId
            ? newProjects[0]?.id ?? null
            : state.activeProjectId;
          
          return {
            projects: newProjects,
            activeProjectId: newActiveId,
          };
        });
      },

      updateProject: (projectId, updates) => {
        set((state) => ({
          projects: state.projects.map((p) =>
            p.id === projectId ? { ...p, ...updates } : p
          ),
        }));
      },

      // Project selection
      setActiveProject: (projectId) => {
        if (projectId) {
          // Update lastOpenedAt
          set((state) => ({
            activeProjectId: projectId,
            projects: state.projects.map((p) =>
              p.id === projectId ? { ...p, lastOpenedAt: Date.now() } : p
            ),
          }));
        } else {
          set({ activeProjectId: null });
        }
      },

      getActiveProject: () => {
        const { projects, activeProjectId } = get();
        return projects.find((p) => p.id === activeProjectId) ?? null;
      },

      // Project initialization
      openInitDialog: () => set({ initDialogOpen: true }),
      closeInitDialog: () => set({ initDialogOpen: false, initProgress: null }),

      initializeProject: async (projectPath, options) => {
        set({
          isLoading: true,
          error: null,
          initProgress: {
            step: 0,
            totalSteps: Object.values(options).filter(Boolean).length,
            currentTask: 'Starting initialization...',
            isComplete: false,
          },
        });

        try {
          // Simulate initialization steps
          const steps: string[] = [];
          if (options.createKuroryuu) steps.push('Creating .kuroryuu folder...');
          if (options.copyFrameworkFiles) steps.push('Copying framework files...');
          if (options.setupSpecsDirectory) steps.push('Setting up specs directory...');
          if (options.initializeGit) steps.push('Initializing git repository...');
          if (options.enableMemory) steps.push('Enabling memory integration...');

          for (let i = 0; i < steps.length; i++) {
            set({
              initProgress: {
                step: i + 1,
                totalSteps: steps.length,
                currentTask: steps[i],
                isComplete: false,
              },
            });
            
            // Simulate work
            await new Promise((resolve) => setTimeout(resolve, 500));
          }

          // Extract project name from path
          const projectName = projectPath.split(/[/\\]/).pop() || 'New Project';
          
          // Add the initialized project
          const projectId = get().addProject({
            name: projectName,
            path: projectPath,
            isInitialized: true,
          });

          set({
            isLoading: false,
            initProgress: {
              step: steps.length,
              totalSteps: steps.length,
              currentTask: 'Initialization complete!',
              isComplete: true,
            },
          });

          // Close dialog after a short delay
          setTimeout(() => {
            get().closeInitDialog();
          }, 1500);

        } catch (error) {
          set({
            isLoading: false,
            error: error instanceof Error ? error.message : 'Initialization failed',
            initProgress: {
              step: 0,
              totalSteps: 0,
              currentTask: '',
              isComplete: false,
              error: error instanceof Error ? error.message : 'Initialization failed',
            },
          });
        }
      },

      // Loading/error state
      setLoading: (loading) => set({ isLoading: loading }),
      setError: (error) => set({ error }),
    }),
    {
      name: 'kuroryuu-projects',
      partialize: (state) => ({
        projects: state.projects,
        activeProjectId: state.activeProjectId,
      }),
    }
  )
);

// Selector hooks
export const useProjects = () => useProjectStore((s) => s.projects);
export const useActiveProject = () => {
  const projects = useProjectStore((s) => s.projects);
  const activeId = useProjectStore((s) => s.activeProjectId);
  return projects.find((p) => p.id === activeId) ?? null;
};
export const useInitDialogOpen = () => useProjectStore((s) => s.initDialogOpen);
export const useInitProgress = () => useProjectStore((s) => s.initProgress);
