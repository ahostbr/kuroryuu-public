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
import { toast } from '../components/ui/toast';

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
  layoutMode: 'grid' | 'splitter' | 'window';
  activePhase: MarketingPhase;
  setShowSkillsSidebar: (v: boolean) => void;
  setShowToolsPanel: (v: boolean) => void;
  setToolsPanelTab: (tab: 'tools' | 'gallery') => void;
  setLayoutMode: (mode: 'grid' | 'splitter' | 'window') => void;
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

  // Generation
  imageLoading: boolean;
  voiceoverLoading: boolean;
  musicLoading: boolean;
  videoLoading: boolean;
  generateImage: (prompt: string, style: string, aspectRatio: string) => Promise<void>;
  generateVoiceover: (text: string) => Promise<void>;
  generateMusic: (prompt: string, duration: number) => Promise<void>;
  renderVideo: (template: string, props: Record<string, string>) => Promise<void>;
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
  layoutMode: 'window',
  activePhase: 'research',
  setShowSkillsSidebar: (v) => set({ showSkillsSidebar: v }),
  setShowToolsPanel: (v) => set({ showToolsPanel: v }),
  setToolsPanelTab: (tab) => set({ toolsPanelTab: tab }),
  setLayoutMode: (mode) => {
    set({ layoutMode: mode });
    window.electronAPI?.settings?.set?.('ui.marketingLayout', mode).catch(console.error);
  },
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

  // Generation
  imageLoading: false,
  voiceoverLoading: false,
  musicLoading: false,
  videoLoading: false,

  generateImage: async (prompt, style, aspectRatio) => {
    const jobId = crypto.randomUUID();
    set({ imageLoading: true });
    get().addJob({
      id: jobId,
      type: 'image',
      status: 'running',
      progress: 0,
      message: 'Starting image generation...',
      startedAt: new Date().toISOString(),
    });

    try {
      const res = await fetch(`${GATEWAY}/v1/marketing/generate/image`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, style, aspect_ratio: aspectRatio }),
      });

      if (!res.ok) throw new Error(`Image generation failed: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'progress') {
            get().updateJob(jobId, { progress: data.progress, message: data.message });
          } else if (data.type === 'complete') {
            get().removeJob(jobId);
            await get().loadAssets();
            set({ imageLoading: false });
            toast.success('Image generated successfully!');
            return;
          } else if (data.type === 'error') {
            get().updateJob(jobId, { status: 'error', message: data.error });
            set({ imageLoading: false });
            return;
          }
        }
      }
    } catch (e) {
      console.error('[marketing] image generation error:', e);
      get().updateJob(jobId, { status: 'error', message: String(e) });
      set({ imageLoading: false });
    }
  },

  generateVoiceover: async (text) => {
    const jobId = crypto.randomUUID();
    set({ voiceoverLoading: true });
    get().addJob({
      id: jobId,
      type: 'voiceover',
      status: 'running',
      progress: 0,
      message: 'Starting voiceover generation...',
      startedAt: new Date().toISOString(),
    });

    try {
      const res = await fetch(`${GATEWAY}/v1/marketing/generate/voiceover`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text }),
      });

      if (!res.ok) throw new Error(`Voiceover generation failed: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'progress') {
            get().updateJob(jobId, { progress: data.progress, message: data.message });
          } else if (data.type === 'complete') {
            get().removeJob(jobId);
            await get().loadAssets();
            set({ voiceoverLoading: false });
            toast.success('Voiceover generated successfully!');
            return;
          } else if (data.type === 'error') {
            get().updateJob(jobId, { status: 'error', message: data.error });
            set({ voiceoverLoading: false });
            return;
          }
        }
      }
    } catch (e) {
      console.error('[marketing] voiceover generation error:', e);
      get().updateJob(jobId, { status: 'error', message: String(e) });
      set({ voiceoverLoading: false });
    }
  },

  generateMusic: async (prompt, duration) => {
    const jobId = crypto.randomUUID();
    set({ musicLoading: true });
    get().addJob({
      id: jobId,
      type: 'music',
      status: 'running',
      progress: 0,
      message: 'Starting music generation...',
      startedAt: new Date().toISOString(),
    });

    try {
      const res = await fetch(`${GATEWAY}/v1/marketing/generate/music`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, duration }),
      });

      if (!res.ok) throw new Error(`Music generation failed: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'progress') {
            get().updateJob(jobId, { progress: data.progress, message: data.message });
          } else if (data.type === 'complete') {
            get().removeJob(jobId);
            await get().loadAssets();
            set({ musicLoading: false });
            toast.success('Music generated successfully!');
            return;
          } else if (data.type === 'error') {
            get().updateJob(jobId, { status: 'error', message: data.error });
            set({ musicLoading: false });
            return;
          }
        }
      }
    } catch (e) {
      console.error('[marketing] music generation error:', e);
      get().updateJob(jobId, { status: 'error', message: String(e) });
      set({ musicLoading: false });
    }
  },

  renderVideo: async (template, props) => {
    const jobId = crypto.randomUUID();
    set({ videoLoading: true });
    get().addJob({
      id: jobId,
      type: 'video',
      status: 'running',
      progress: 0,
      message: 'Starting video rendering...',
      startedAt: new Date().toISOString(),
    });

    try {
      const res = await fetch(`${GATEWAY}/v1/marketing/generate/video`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, props }),
      });

      if (!res.ok) throw new Error(`Video rendering failed: ${res.status}`);

      const reader = res.body!.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const data = JSON.parse(line.slice(6));

          if (data.type === 'progress') {
            get().updateJob(jobId, { progress: data.progress, message: data.message });
          } else if (data.type === 'complete') {
            get().removeJob(jobId);
            await get().loadAssets();
            set({ videoLoading: false });
            toast.success('Video rendered successfully!');
            return;
          } else if (data.type === 'error') {
            get().updateJob(jobId, { status: 'error', message: data.error });
            set({ videoLoading: false });
            return;
          }
        }
      }
    } catch (e) {
      console.error('[marketing] video rendering error:', e);
      get().updateJob(jobId, { status: 'error', message: String(e) });
      set({ videoLoading: false });
    }
  },
}));
