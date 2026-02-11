import { create } from 'zustand';
import type {
  MarketingPhase,
  ToolStatus,
  ResearchResult,
  ScrapeResult,
  MarketingAsset,
  ActiveJob,
  SetupState,
} from '../types/marketing';

const GATEWAY = 'http://127.0.0.1:8200';

interface MarketingStore {
  // Setup
  setupComplete: boolean;
  setupState: SetupState;
  setSetupComplete: (v: boolean) => void;

  // View
  showSkillsSidebar: boolean;
  showToolsPanel: boolean;
  toolsPanelTab: 'tools' | 'gallery';
  activePhase: MarketingPhase;
  setShowSkillsSidebar: (v: boolean) => void;
  setShowToolsPanel: (v: boolean) => void;
  setToolsPanelTab: (tab: 'tools' | 'gallery') => void;
  setActivePhase: (phase: MarketingPhase) => void;

  // Terminal
  terminalPtyId: string | null;
  setTerminalPtyId: (id: string | null) => void;

  // Research
  lastResearch: ResearchResult | null;
  researchLoading: boolean;
  runResearch: (query: string, mode: 'quick' | 'deep' | 'reason') => Promise<void>;

  // Scrape
  lastScrape: ScrapeResult | null;
  scrapeLoading: boolean;
  runScrape: (url: string, mode: 'markdown' | 'screenshot' | 'extract') => Promise<void>;

  // Tools
  tools: ToolStatus[];
  loadToolStatus: () => Promise<void>;

  // Assets
  assets: MarketingAsset[];
  loadAssets: () => Promise<void>;
  deleteAsset: (id: string) => Promise<void>;

  // Jobs
  activeJobs: ActiveJob[];
  addJob: (job: ActiveJob) => void;
  updateJob: (id: string, updates: Partial<ActiveJob>) => void;
  removeJob: (id: string) => void;
}

export const useMarketingStore = create<MarketingStore>((set, get) => ({
  // Setup
  setupComplete: false,
  setupState: {
    tools: [],
    gatewayOnline: false,
    cliProxyConnected: false,
    complete: false,
  },
  setSetupComplete: (v) => set({ setupComplete: v }),

  // View
  showSkillsSidebar: true,
  showToolsPanel: false,
  toolsPanelTab: 'tools',
  activePhase: 'research',
  setShowSkillsSidebar: (v) => set({ showSkillsSidebar: v }),
  setShowToolsPanel: (v) => set({ showToolsPanel: v }),
  setToolsPanelTab: (tab) => set({ toolsPanelTab: tab }),
  setActivePhase: (phase) => set({ activePhase: phase }),

  // Terminal
  terminalPtyId: null,
  setTerminalPtyId: (id) => set({ terminalPtyId: id }),

  // Research
  lastResearch: null,
  researchLoading: false,
  runResearch: async (query, mode) => {
    set({ researchLoading: true });
    try {
      const res = await fetch(`${GATEWAY}/v1/marketing/research`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, mode }),
      });
      if (!res.ok) throw new Error(`Research failed: ${res.status}`);
      const data = await res.json();
      set({ lastResearch: data, researchLoading: false });
    } catch (e) {
      console.error('[marketing] research error:', e);
      set({ researchLoading: false });
    }
  },

  // Scrape
  lastScrape: null,
  scrapeLoading: false,
  runScrape: async (url, mode) => {
    set({ scrapeLoading: true });
    try {
      const res = await fetch(`${GATEWAY}/v1/marketing/scrape`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url, mode }),
      });
      if (!res.ok) throw new Error(`Scrape failed: ${res.status}`);
      const data = await res.json();
      set({ lastScrape: data, scrapeLoading: false });
    } catch (e) {
      console.error('[marketing] scrape error:', e);
      set({ scrapeLoading: false });
    }
  },

  // Tools
  tools: [],
  loadToolStatus: async () => {
    try {
      const res = await fetch(`${GATEWAY}/v1/marketing/tools/status`);
      if (!res.ok) return;
      const data = await res.json();
      set({ tools: data.tools || [] });
    } catch {
      // Gateway may not be running
    }
  },

  // Assets
  assets: [],
  loadAssets: async () => {
    try {
      const res = await fetch(`${GATEWAY}/v1/marketing/assets`);
      if (!res.ok) return;
      const data = await res.json();
      set({ assets: data.assets || [] });
    } catch {
      // Gateway may not be running
    }
  },
  deleteAsset: async (id) => {
    try {
      await fetch(`${GATEWAY}/v1/marketing/assets/${id}`, { method: 'DELETE' });
      set((s) => ({ assets: s.assets.filter((a) => a.id !== id) }));
    } catch (e) {
      console.error('[marketing] delete asset error:', e);
    }
  },

  // Jobs
  activeJobs: [],
  addJob: (job) => set((s) => ({ activeJobs: [...s.activeJobs, job] })),
  updateJob: (id, updates) =>
    set((s) => ({
      activeJobs: s.activeJobs.map((j) => (j.id === id ? { ...j, ...updates } : j)),
    })),
  removeJob: (id) => set((s) => ({ activeJobs: s.activeJobs.filter((j) => j.id !== id) })),
}));
