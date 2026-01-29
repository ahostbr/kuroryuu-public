/**
 * Types for Project Management
 * Project initialization, switching, and multi-project support
 */

// ============================================================================
// Project Types
// ============================================================================

export interface Project {
  id: string;
  name: string;
  path: string;
  isInitialized: boolean;
  createdAt: number;
  lastOpenedAt: number;
  settings?: ProjectSettings;
}

export interface ProjectSettings {
  defaultBranch: string;
  autoSaveEnabled: boolean;
  memoryEnabled: boolean;
  linearEnabled: boolean;
  githubEnabled: boolean;
  gitlabEnabled: boolean;
}

// ============================================================================
// Project Init Types
// ============================================================================

export interface InitializationOptions {
  createKuroryuu: boolean;
  copyFrameworkFiles: boolean;
  setupSpecsDirectory: boolean;
  initializeGit: boolean;
  enableMemory: boolean;
}

export interface InitializationProgress {
  step: number;
  totalSteps: number;
  currentTask: string;
  isComplete: boolean;
  error?: string;
}

export const DEFAULT_INIT_OPTIONS: InitializationOptions = {
  createKuroryuu: true,
  copyFrameworkFiles: true,
  setupSpecsDirectory: true,
  initializeGit: false,
  enableMemory: false,
};

// ============================================================================
// Project State
// ============================================================================

export interface ProjectState {
  projects: Project[];
  activeProjectId: string | null;
  isLoading: boolean;
  error: string | null;
  initDialogOpen: boolean;
  initProgress: InitializationProgress | null;
}

export const DEFAULT_PROJECT_STATE: ProjectState = {
  projects: [],
  activeProjectId: null,
  isLoading: false,
  error: null,
  initDialogOpen: false,
  initProgress: null,
};
