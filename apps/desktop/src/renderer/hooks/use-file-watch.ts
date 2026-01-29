import { useEffect } from 'react';

/**
 * React hook for watching file changes via Electron IPC.
 */
export function useFileWatch(path: string, onChange: () => void) {
  useEffect(() => {
    if (!path) return;
    
    const unsubscribe = window.electronAPI.fs.watch(path, onChange);
    return unsubscribe;
  }, [path, onChange]);
}
