import { create } from 'zustand';

interface ExcalidrawFile {
  name: string;
  path: string;
  size_bytes: number;
  element_count: number;
}

interface ExcalidrawStore {
  // Setup
  setupComplete: boolean;
  setSetupComplete: (v: boolean) => void;

  // Terminal
  terminalPtyId: string | null;
  setTerminalPtyId: (id: string | null) => void;

  // Files
  files: ExcalidrawFile[];
  activeFile: string | null;
  isDirty: boolean;
  theme: 'light' | 'dark';

  // Actions
  loadFiles: () => Promise<void>;
  setActiveFile: (name: string | null) => void;
  setIsDirty: (v: boolean) => void;
  setTheme: (t: 'light' | 'dark') => void;
}

const OUTPUT_DIR = 'tools/excalidraw/output';

export const useExcalidrawStore = create<ExcalidrawStore>((set) => ({
  // Setup
  setupComplete: false,
  setSetupComplete: (v) => set({ setupComplete: v }),

  // Terminal
  terminalPtyId: null,
  setTerminalPtyId: (id) => set({ terminalPtyId: id }),

  // Files
  files: [],
  activeFile: null,
  isDirty: false,
  theme: 'dark',

  // Actions
  loadFiles: async () => {
    try {
      const entries = await window.electronAPI.fs.readDir(OUTPUT_DIR);
      const excalidrawFiles: ExcalidrawFile[] = [];

      for (const entry of entries) {
        if (!entry.endsWith('.excalidraw')) continue;
        const filePath = `${OUTPUT_DIR}/${entry}`;
        const name = entry.replace('.excalidraw', '');

        let elementCount = -1;
        let sizeBytes = 0;
        try {
          const content = await window.electronAPI.fs.readFile(filePath);
          sizeBytes = new Blob([content]).size;
          const doc = JSON.parse(content);
          elementCount = doc.elements?.length ?? -1;
        } catch {
          // File may be corrupt or locked
        }

        excalidrawFiles.push({
          name,
          path: filePath,
          size_bytes: sizeBytes,
          element_count: elementCount,
        });
      }

      set({ files: excalidrawFiles });
    } catch {
      // Directory may not exist yet
      set({ files: [] });
    }
  },

  setActiveFile: (name) => set({ activeFile: name }),
  setIsDirty: (v) => set({ isDirty: v }),
  setTheme: (t) => set({ theme: t }),
}));
