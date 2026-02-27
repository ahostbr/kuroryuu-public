import { create } from 'zustand';

interface LiteNotionStore {
  // Terminal
  terminalPtyId: string | null;
  setTerminalPtyId: (id: string | null) => void;

  // Browser
  browserUrl: string;
  setBrowserUrl: (url: string) => void;
  browserHistory: string[];
  pushBrowserHistory: (url: string) => void;
}

export const useLiteNotionStore = create<LiteNotionStore>((set) => ({
  // Terminal
  terminalPtyId: null,
  setTerminalPtyId: (id) => set({ terminalPtyId: id }),

  // Browser
  browserUrl: 'https://www.google.com',
  setBrowserUrl: (url) => set({ browserUrl: url }),
  browserHistory: [],
  pushBrowserHistory: (url) =>
    set((s) => ({ browserHistory: [...s.browserHistory.slice(-49), url] })),
}));
