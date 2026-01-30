import type { ElectronAPI } from '../preload';

declare global {
  interface Window {
    electronAPI: ElectronAPI;
    KURORYUU_PROJECT_ROOT?: string;
  }
}

export {};
