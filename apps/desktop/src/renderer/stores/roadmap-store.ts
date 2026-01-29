/**
 * Zustand store for Roadmap
 * 
 * Uses Gateway API for AI-powered roadmap generation
 */
import { create } from 'zustand';
import type { RoadmapFeature, FeatureStatus, RoadmapConfig } from '../types/roadmap';
import { gatewayClient } from '../services/gateway-client';
import { useDomainConfigStore } from './domain-config-store';

function generateId(): string {
  return `feat-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

// Map LLM phase names to our status
function mapPhaseToStatus(phase: string): FeatureStatus {
  const phaseMap: Record<string, FeatureStatus> = {
    'now': 'in-progress',
    'next': 'planned',
    'later': 'backlog',
    'future': 'backlog',
    'shipped': 'shipped',
    'done': 'shipped',
    'in-progress': 'in-progress',
    'planned': 'planned',
    'backlog': 'backlog',
  };
  return phaseMap[phase?.toLowerCase()] || 'backlog';
}

// Map LLM priority to our priority
function mapPriority(priority: string): RoadmapFeature['priority'] {
  const prioMap: Record<string, RoadmapFeature['priority']> = {
    'high': 'high',
    'critical': 'critical',
    'medium': 'medium',
    'low': 'low',
  };
  return prioMap[priority?.toLowerCase()] || 'medium';
}

// Map LLM effort to our complexity
function mapEffortToComplexity(effort: string): RoadmapFeature['complexity'] {
  const effortMap: Record<string, RoadmapFeature['complexity']> = {
    'small': 'sm',
    'xs': 'xs',
    'medium': 'md',
    'md': 'md',
    'large': 'lg',
    'lg': 'lg',
    'xl': 'xl',
    'xxl': 'xl',  // Map xxl to xl (max complexity)
  };
  return effortMap[effort?.toLowerCase()] || 'md';
}

interface RoadmapStore {
  features: RoadmapFeature[];
  selectedFeatureId: string | null;
  isGenerating: boolean;
  generationProgress: number;
  config: RoadmapConfig;

  // Actions
  selectFeature: (id: string | null) => void;
  addFeature: (feature: Omit<RoadmapFeature, 'id' | 'createdAt' | 'updatedAt'>) => string;
  updateFeature: (id: string, updates: Partial<RoadmapFeature>) => void;
  deleteFeature: (id: string) => void;
  moveFeature: (id: string, status: FeatureStatus) => void;
  reorderFeatures: (sourceId: string, targetId: string) => void;
  setConfig: (config: Partial<RoadmapConfig>) => void;
  
  // Generation
  startGeneration: () => Promise<void>;
  cancelGeneration: () => void;
  
  // Selectors
  getFeaturesByStatus: (status: FeatureStatus) => RoadmapFeature[];
  getSelectedFeature: () => RoadmapFeature | undefined;
}

const DEFAULT_CONFIG: RoadmapConfig = {
  timeframe: 'quarter',
};

export const useRoadmapStore = create<RoadmapStore>((set, get) => ({
  features: [],
  selectedFeatureId: null,
  isGenerating: false,
  generationProgress: 0,
  config: DEFAULT_CONFIG,

  selectFeature: (id) => set({ selectedFeatureId: id }),

  addFeature: (featureData) => {
    const id = generateId();
    const now = Date.now();
    const feature: RoadmapFeature = {
      ...featureData,
      id,
      createdAt: now,
      updatedAt: now,
    };
    set(state => ({ features: [...state.features, feature] }));
    return id;
  },

  updateFeature: (id, updates) => {
    set(state => ({
      features: state.features.map(feat =>
        feat.id === id ? { ...feat, ...updates, updatedAt: Date.now() } : feat
      ),
    }));
  },

  deleteFeature: (id) => {
    set(state => ({
      features: state.features.filter(feat => feat.id !== id),
      selectedFeatureId: state.selectedFeatureId === id ? null : state.selectedFeatureId,
    }));
  },

  moveFeature: (id, status) => {
    set(state => ({
      features: state.features.map(feat =>
        feat.id === id ? { ...feat, status, updatedAt: Date.now() } : feat
      ),
    }));
  },

  reorderFeatures: (sourceId, targetId) => {
    set(state => {
      const features = [...state.features];
      const sourceIndex = features.findIndex(f => f.id === sourceId);
      const targetIndex = features.findIndex(f => f.id === targetId);
      if (sourceIndex === -1 || targetIndex === -1) return state;
      
      const [removed] = features.splice(sourceIndex, 1);
      features.splice(targetIndex, 0, removed);
      return { features };
    });
  },

  setConfig: (configUpdates) => {
    set(state => ({
      config: { ...state.config, ...configUpdates },
    }));
  },

  startGeneration: async () => {
    set({ isGenerating: true, generationProgress: 0, features: [] });
    
    const { config, addFeature } = get();
    
    // Build project description from config
    const projectDescription = [
      config.projectName || 'A software project',
      config.targetAudience && `targeting ${config.targetAudience}`,
      config.timeframe && `planning for ${config.timeframe}`,
    ].filter(Boolean).join(', ');

    set({ generationProgress: 10 });

    // Get domain-specific model config
    const domainConfig = useDomainConfigStore.getState().getConfigForDomain('roadmap');

    // Call Gateway API with repo_intel-enhanced config
    const result = await gatewayClient.generate.roadmap(
      projectDescription,
      [],  // No existing features
      domainConfig.modelId || 'claude-3-5-sonnet',
      {
        productVision: config.productVision || projectDescription,
        targetAudience: config.targetAudience,
        timeframe: config.timeframe,
        focusAreas: config.focusAreas || [],
        provider: domainConfig.provider,
      }
    );

    set({ generationProgress: 50 });

    if (!result.ok || !result.data) {
      console.error('Roadmap generation failed:', result.error);
      set({ isGenerating: false, generationProgress: 0 });
      return;
    }

    // Parse and add features one by one with simulated streaming
    const features = result.data.features as Array<{
      name?: string;
      title?: string;
      description?: string;
      phase?: string;
      status?: string;
      priority?: string;
      effort?: string;
      complexity?: string;
      tags?: string[];
    }>;

    for (let i = 0; i < features.length; i++) {
      if (!get().isGenerating) break; // Cancelled

      const f = features[i];
      const feature: Omit<RoadmapFeature, 'id' | 'createdAt' | 'updatedAt'> = {
        title: f.name || f.title || 'Untitled Feature',
        description: f.description || '',
        status: mapPhaseToStatus(f.phase || f.status || 'backlog'),
        priority: mapPriority(f.priority || 'medium'),
        complexity: mapEffortToComplexity(f.effort || f.complexity || 'md'),
        impact: f.priority?.toLowerCase() === 'high' ? 'high' : 'medium',
        tags: f.tags || [],
      };

      addFeature(feature);
      set({ generationProgress: 50 + ((i + 1) / features.length) * 50 });
      
      // Small delay for visual feedback
      await new Promise(resolve => setTimeout(resolve, 150));
    }

    set({ isGenerating: false, generationProgress: 100 });
  },

  cancelGeneration: () => {
    set({ isGenerating: false });
  },

  getFeaturesByStatus: (status) => {
    return get().features.filter(f => f.status === status);
  },

  getSelectedFeature: () => {
    const { features, selectedFeatureId } = get();
    return features.find(f => f.id === selectedFeatureId);
  },
}));
