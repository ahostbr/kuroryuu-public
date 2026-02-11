import { create } from 'zustand';
import type { LLMApp, LLMAppsCatalog } from '../types/llm-apps';

interface LLMAppsStore {
  // Setup
  setupComplete: boolean;
  setSetupComplete: (v: boolean) => void;

  // Catalog
  catalog: LLMAppsCatalog | null;
  loading: boolean;
  loadCatalog: () => Promise<void>;

  // Browsing
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  selectedCategory: string | null;
  setSelectedCategory: (cat: string | null) => void;

  // Detail view
  selectedApp: LLMApp | null;
  setSelectedApp: (app: LLMApp | null) => void;
  readmeContent: string | null;
  readmeLoading: boolean;
  loadAppReadme: (appPath: string) => Promise<void>;

  // Computed
  filteredApps: () => LLMApp[];
}

export const useLLMAppsStore = create<LLMAppsStore>((set, get) => ({
  // Setup
  setupComplete: false,
  setSetupComplete: (v) => set({ setupComplete: v }),

  // Catalog
  catalog: null,
  loading: false,
  loadCatalog: async () => {
    set({ loading: true });
    try {
      const result = await window.electronAPI.llmApps.getCatalog();
      if (result.ok && result.catalog) {
        set({ catalog: result.catalog as LLMAppsCatalog, loading: false });
      } else {
        set({ loading: false });
      }
    } catch {
      set({ loading: false });
    }
  },

  // Browsing
  searchQuery: '',
  setSearchQuery: (q) => set({ searchQuery: q }),
  selectedCategory: null,
  setSelectedCategory: (cat) => set({ selectedCategory: cat }),

  // Detail
  selectedApp: null,
  setSelectedApp: (app) => set({ selectedApp: app, readmeContent: null }),
  readmeContent: null,
  readmeLoading: false,
  loadAppReadme: async (appPath: string) => {
    set({ readmeLoading: true });
    try {
      const result = await window.electronAPI.llmApps.getAppReadme(appPath);
      if (result.ok && result.content) {
        set({ readmeContent: result.content, readmeLoading: false });
      } else {
        set({ readmeContent: null, readmeLoading: false });
      }
    } catch {
      set({ readmeContent: null, readmeLoading: false });
    }
  },

  // Computed filter
  filteredApps: () => {
    const { catalog, searchQuery, selectedCategory } = get();
    if (!catalog) return [];

    let apps = catalog.apps;

    if (selectedCategory) {
      apps = apps.filter((a) => a.categoryId === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      apps = apps.filter(
        (a) =>
          a.name.toLowerCase().includes(q) ||
          a.description.toLowerCase().includes(q) ||
          a.techStack.some((t) => t.includes(q)) ||
          a.category.toLowerCase().includes(q),
      );
    }

    return apps;
  },
}));
