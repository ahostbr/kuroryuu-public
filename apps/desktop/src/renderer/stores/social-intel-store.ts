import { create } from 'zustand';

export interface Creator {
  id: string;
  username: string;
  platform: 'instagram' | 'youtube' | 'tiktok';
  category: string;
  profilePicUrl: string;
  followers: number;
  postsPerMonth: number;
  avgViews: number;
  lastScraped: string;
}

export interface SocialConfig {
  id: string;
  name: string;
  creatorsCategory: string;
  analysisPrompt: string;
  conceptsPrompt: string;
}

export interface VideoResult {
  id: string;
  link: string;
  thumbnail: string;
  creator: string;
  platform: string;
  views: number;
  likes: number;
  comments: number;
  analysis: string;
  concepts: string;
  datePosted: string;
  dateAnalyzed: string;
  configName: string;
  starred: boolean;
}

export interface PipelineStatus {
  running: boolean;
  phase: 'idle' | 'scraping' | 'analyzing' | 'generating' | 'done';
  progress: number;
  message: string;
  errors: string[];
}

interface SocialIntelStore {
  // Creators
  creators: Creator[];
  addCreator: (creator: Creator) => void;
  removeCreator: (id: string) => void;
  updateCreator: (id: string, updates: Partial<Creator>) => void;

  // Configs
  configs: SocialConfig[];
  addConfig: (config: SocialConfig) => void;
  removeConfig: (id: string) => void;
  updateConfig: (id: string, updates: Partial<SocialConfig>) => void;

  // Videos
  videos: VideoResult[];
  addVideoResult: (video: VideoResult) => void;
  clearVideos: () => void;

  // Pipeline
  pipelineStatus: PipelineStatus;
  updatePipeline: (updates: Partial<PipelineStatus>) => void;
  resetPipeline: () => void;

  // Actions
  toggleStar: (videoId: string) => void;

  // Filters
  selectedPlatformFilter: string | null;
  selectedCategoryFilter: string | null;
  setSelectedPlatformFilter: (platform: string | null) => void;
  setSelectedCategoryFilter: (category: string | null) => void;
}

const DEFAULT_PIPELINE: PipelineStatus = {
  running: false,
  phase: 'idle',
  progress: 0,
  message: '',
  errors: [],
};

export const useSocialIntelStore = create<SocialIntelStore>((set) => ({
  // Creators
  creators: [],
  addCreator: (creator) =>
    set((s) => ({ creators: [...s.creators, creator] })),
  removeCreator: (id) =>
    set((s) => ({ creators: s.creators.filter((c) => c.id !== id) })),
  updateCreator: (id, updates) =>
    set((s) => ({
      creators: s.creators.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),

  // Configs
  configs: [],
  addConfig: (config) =>
    set((s) => ({ configs: [...s.configs, config] })),
  removeConfig: (id) =>
    set((s) => ({ configs: s.configs.filter((c) => c.id !== id) })),
  updateConfig: (id, updates) =>
    set((s) => ({
      configs: s.configs.map((c) => (c.id === id ? { ...c, ...updates } : c)),
    })),

  // Videos
  videos: [],
  addVideoResult: (video) =>
    set((s) => ({ videos: [...s.videos, video] })),
  clearVideos: () => set({ videos: [] }),

  // Pipeline
  pipelineStatus: { ...DEFAULT_PIPELINE },
  updatePipeline: (updates) =>
    set((s) => ({ pipelineStatus: { ...s.pipelineStatus, ...updates } })),
  resetPipeline: () => set({ pipelineStatus: { ...DEFAULT_PIPELINE } }),

  // Actions
  toggleStar: (videoId) =>
    set((s) => ({
      videos: s.videos.map((v) =>
        v.id === videoId ? { ...v, starred: !v.starred } : v
      ),
    })),

  // Filters
  selectedPlatformFilter: null,
  selectedCategoryFilter: null,
  setSelectedPlatformFilter: (platform) =>
    set({ selectedPlatformFilter: platform }),
  setSelectedCategoryFilter: (category) =>
    set({ selectedCategoryFilter: category }),
}));
