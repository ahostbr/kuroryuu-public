/**
 * Zustand store for Changelog Generator
 *
 * Uses Gateway API for AI-enhanced changelog generation
 */
import { create } from 'zustand';
import type {
  ChangelogSource,
  GitHistoryOptions,
  ChangelogConfig,
  ChangelogEntry,
  ChangelogState,
  EmojiLevel,
} from '../types/changelog';
import { ENTRY_TYPE_CONFIG } from '../types/changelog';
import { gatewayClient } from '../services/gateway-client';
import { useDomainConfigStore } from './domain-config-store';

function generateId(): string {
  return `entry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

const DEFAULT_GIT_OPTIONS: GitHistoryOptions = {
  mode: 'count',
  count: 50,
  includeMergeCommits: false,
};

const DEFAULT_CONFIG: ChangelogConfig = {
  version: '1.0.0',
  releaseDate: new Date().toISOString().split('T')[0],
  format: 'markdown',
  audience: 'developers',
  emojiLevel: 'minimal',
};

interface ChangelogStore extends ChangelogState {
  // Navigation
  setStep: (step: 1 | 2 | 3) => void;
  nextStep: () => void;
  prevStep: () => void;

  // Source selection
  setSource: (source: ChangelogSource) => void;
  setGitOptions: (options: Partial<GitHistoryOptions>) => void;

  // Configuration
  setConfig: (config: Partial<ChangelogConfig>) => void;

  // Entries
  setEntries: (entries: ChangelogEntry[]) => void;
  toggleEntry: (id: string) => void;
  selectAll: () => void;
  deselectAll: () => void;
  updateEntryType: (id: string, type: ChangelogEntry['type']) => void;

  // Data Loading
  loadGitHistory: () => Promise<void>;
  loadDoneTasks: () => Promise<void>;
  isLoading: boolean;
  loadError: string | null;

  // Generation
  generateChangelog: () => Promise<void>;
  copyToClipboard: () => Promise<void>;
  saveToFile: () => Promise<void>;

  // Reset
  reset: () => void;
}

export const useChangelogStore = create<ChangelogStore>((set, get) => ({
  source: 'tasks',
  gitOptions: DEFAULT_GIT_OPTIONS,
  config: DEFAULT_CONFIG,
  entries: [],
  generatedContent: '',
  isGenerating: false,
  isLoading: false,
  loadError: null,
  currentStep: 1,

  setStep: (step) => set({ currentStep: step }),

  nextStep: () => {
    const { currentStep } = get();
    if (currentStep < 3) {
      set({ currentStep: (currentStep + 1) as 1 | 2 | 3 });
    }
  },

  prevStep: () => {
    const { currentStep } = get();
    if (currentStep > 1) {
      set({ currentStep: (currentStep - 1) as 1 | 2 | 3 });
    }
  },

  setSource: (source) => set({ source }),

  setGitOptions: (options) => {
    set(state => ({
      gitOptions: { ...state.gitOptions, ...options },
    }));
  },

  setConfig: (config) => {
    set(state => ({
      config: { ...state.config, ...config },
    }));
  },

  setEntries: (entries) => set({ entries }),

  toggleEntry: (id) => {
    set(state => ({
      entries: state.entries.map(e =>
        e.id === id ? { ...e, selected: !e.selected } : e
      ),
    }));
  },

  selectAll: () => {
    set(state => ({
      entries: state.entries.map(e => ({ ...e, selected: true })),
    }));
  },

  deselectAll: () => {
    set(state => ({
      entries: state.entries.map(e => ({ ...e, selected: false })),
    }));
  },

  updateEntryType: (id, type) => {
    set(state => ({
      entries: state.entries.map(e =>
        e.id === id ? { ...e, type } : e
      ),
    }));
  },

  // Load git history from gateway
  loadGitHistory: async () => {
    const { gitOptions } = get();
    set({ isLoading: true, loadError: null });

    try {
      const result = await gatewayClient.changelog.gitHistory(gitOptions);

      if (result.ok && result.data) {
        const entries: ChangelogEntry[] = result.data.entries.map(e => ({
          id: e.id,
          type: e.type,
          title: e.title || e.message.split('\n')[0],
          description: e.message.split('\n').slice(1).join(' ').trim() || undefined,
          commitHash: e.hash,
          selected: e.selected,
        }));
        set({ entries, isLoading: false });
      } else {
        set({ loadError: result.error || 'Failed to load git history', isLoading: false });
      }
    } catch (e) {
      set({ loadError: String(e), isLoading: false });
    }
  },

  // Load done tasks from gateway
  loadDoneTasks: async () => {
    set({ isLoading: true, loadError: null });

    try {
      const result = await gatewayClient.changelog.tasks();

      if (result.ok && result.data) {
        const entries: ChangelogEntry[] = result.data.entries.map(e => ({
          id: e.id,
          type: e.type,
          title: e.title,
          description: e.description,
          taskId: e.taskId,
          selected: e.selected,
        }));
        set({ entries, isLoading: false });
      } else {
        set({ loadError: result.error || 'Failed to load tasks', isLoading: false });
      }
    } catch (e) {
      set({ loadError: String(e), isLoading: false });
    }
  },

  generateChangelog: async () => {
    const { entries, config } = get();
    set({ isGenerating: true });

    const selectedEntries = entries.filter(e => e.selected);

    // Try to generate via new Gateway changelog endpoint
    const result = await gatewayClient.changelog.generate(selectedEntries, config);

    if (result.ok && result.data?.content) {
      set({ generatedContent: result.data.content, isGenerating: false });
    } else {
      // Fallback to local formatting
      console.warn('Gateway changelog generation failed, using local formatter:', result.error);
      const grouped = groupByType(selectedEntries);
      const content = formatChangelog(grouped, config);
      set({ generatedContent: content, isGenerating: false });
    }
  },

  copyToClipboard: async () => {
    const { generatedContent } = get();
    await navigator.clipboard.writeText(generatedContent);
  },

  saveToFile: async () => {
    const { generatedContent, config } = get();

    // Use Electron IPC to save file
    if (window.electronAPI?.changelog?.saveToFile) {
      try {
        const result = await window.electronAPI.changelog.saveToFile(generatedContent, config.version);
        if (result.ok) {
          console.log('Changelog saved to:', result.path);
        } else {
          console.log('Save cancelled or failed');
        }
      } catch (e) {
        console.error('Failed to save changelog:', e);
      }
    } else {
      console.warn('Electron IPC not available, cannot save file');
    }
  },

  reset: () => {
    set({
      source: 'tasks',
      gitOptions: DEFAULT_GIT_OPTIONS,
      config: DEFAULT_CONFIG,
      entries: [],
      generatedContent: '',
      isGenerating: false,
      isLoading: false,
      loadError: null,
      currentStep: 1,
    });
  },
}));

// Helper: Group entries by type
function groupByType(entries: ChangelogEntry[]): Record<string, ChangelogEntry[]> {
  return entries.reduce((acc, entry) => {
    if (!acc[entry.type]) acc[entry.type] = [];
    acc[entry.type].push(entry);
    return acc;
  }, {} as Record<string, ChangelogEntry[]>);
}

// Helper: Format changelog content
function formatChangelog(
  grouped: Record<string, ChangelogEntry[]>,
  config: ChangelogConfig
): string {
  const { version, releaseDate, emojiLevel } = config;
  const lines: string[] = [];

  lines.push(`# Changelog v${version}`);
  lines.push(`*Released: ${releaseDate}*`);
  lines.push('');

  const typeOrder: ChangelogEntry['type'][] = ['breaking', 'feature', 'improvement', 'fix', 'docs', 'other'];

  for (const type of typeOrder) {
    const entries = grouped[type];
    if (!entries || entries.length === 0) continue;

    const { label, emoji } = ENTRY_TYPE_CONFIG[type];
    const header = emojiLevel !== 'none' ? `## ${emoji} ${label}` : `## ${label}`;
    lines.push(header);
    lines.push('');

    for (const entry of entries) {
      const prefix = emojiLevel === 'all' ? `${emoji} ` : '- ';
      lines.push(`${prefix}${entry.title}`);
      if (entry.description) {
        lines.push(`  ${entry.description}`);
      }
    }
    lines.push('');
  }

  return lines.join('\n');
}

// Mock data generator for demo
export function generateMockEntries(): ChangelogEntry[] {
  return [
    { id: generateId(), type: 'feature', title: 'Added Insights chat interface', description: 'AI-powered chat for project questions', selected: true },
    { id: generateId(), type: 'feature', title: 'Added Ideation screen with idea generation', selected: true },
    { id: generateId(), type: 'feature', title: 'Added Roadmap Kanban view', selected: true },
    { id: generateId(), type: 'improvement', title: 'Upgraded TerminalGrid to support 12 terminals', selected: true },
    { id: generateId(), type: 'improvement', title: 'Enhanced TaskCard with phase indicators', selected: true },
    { id: generateId(), type: 'fix', title: 'Fixed task locking race condition', selected: true },
    { id: generateId(), type: 'fix', title: 'Fixed terminal resize on window change', selected: false },
    { id: generateId(), type: 'docs', title: 'Updated README with installation guide', selected: false },
    { id: generateId(), type: 'breaking', title: 'Changed task status enum values', description: 'Migration required for existing data', selected: true },
  ];
}
