import { useEffect, useRef, useState, useCallback } from 'react';
import { useExcalidrawStore } from '../../../stores/excalidraw-store';

// Excalidraw types
type ExcalidrawImperativeAPI = {
  updateScene: (scene: any) => void;
  getSceneElements: () => any[];
  getAppState: () => any;
  scrollToContent: () => void;
  resetScene: () => void;
};

const OUTPUT_DIR = 'tools/excalidraw/output';

export function CanvasPage() {
  const activeFile = useExcalidrawStore((s) => s.activeFile);
  const theme = useExcalidrawStore((s) => s.theme);
  const setIsDirty = useExcalidrawStore((s) => s.setIsDirty);
  const loadFiles = useExcalidrawStore((s) => s.loadFiles);

  const [ExcalidrawComp, setExcalidrawComp] = useState<any>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [sceneData, setSceneData] = useState<any>(null);
  const excalidrawAPIRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const watcherRef = useRef<(() => void) | null>(null);

  // Dynamically import Excalidraw (it's a large bundle)
  useEffect(() => {
    let cancelled = false;
    import('@excalidraw/excalidraw')
      .then((mod) => {
        if (!cancelled) {
          // Set asset path for fonts/icons
          (window as any).EXCALIDRAW_ASSET_PATH = '/';
          setExcalidrawComp(() => mod.Excalidraw);
        }
      })
      .catch((err) => {
        console.error('[Excalidraw] Failed to load:', err);
        if (!cancelled) {
          setLoadError(`Failed to load Excalidraw: ${err.message}`);
        }
      });

    return () => { cancelled = true; };
  }, []);

  // Load active file content via electronAPI.fs
  const loadFileContent = useCallback(async (name: string) => {
    try {
      const filePath = `${OUTPUT_DIR}/${name}.excalidraw`;
      const content = await window.electronAPI.fs.readFile(filePath);
      const doc = JSON.parse(content);

      setSceneData(doc);
      // If Excalidraw API is available, update scene directly
      if (excalidrawAPIRef.current) {
        excalidrawAPIRef.current.updateScene({
          elements: doc.elements || [],
        });
        excalidrawAPIRef.current.scrollToContent();
      }
    } catch (err) {
      console.error('[Excalidraw] Failed to load file:', err);
    }
  }, []);

  // Watch for file changes and reload
  useEffect(() => {
    if (!activeFile) return;
    loadFileContent(activeFile);

    // Set up file watcher on the output directory
    const setupWatcher = async () => {
      try {
        const projectRoot = await window.electronAPI?.app?.getProjectRoot?.();
        if (!projectRoot) return;

        const watchPath = `${projectRoot}/tools/excalidraw/output`;

        if (window.electronAPI?.fs?.watch) {
          const cleanup = window.electronAPI.fs.watch(watchPath, () => {
            // Reload the active file after a short debounce
            setTimeout(() => loadFileContent(activeFile), 200);
            loadFiles();
          });
          watcherRef.current = cleanup;
        }
      } catch (err) {
        console.error('[Excalidraw] File watcher setup failed:', err);
      }
    };

    setupWatcher();

    return () => {
      if (watcherRef.current) {
        watcherRef.current();
        watcherRef.current = null;
      }
    };
  }, [activeFile, loadFileContent, loadFiles]);

  const handleChange = useCallback((_elements: any[], _appState: any) => {
    setIsDirty(true);
  }, [setIsDirty]);

  if (loadError) {
    return (
      <div className="h-full flex items-center justify-center bg-card text-destructive text-sm">
        {loadError}
      </div>
    );
  }

  if (!ExcalidrawComp) {
    return (
      <div className="h-full flex items-center justify-center bg-card text-muted-foreground text-sm">
        Loading Excalidraw...
      </div>
    );
  }

  if (!activeFile) {
    return (
      <div className="h-full flex flex-col items-center justify-center bg-card text-muted-foreground gap-3">
        <div className="text-lg font-medium">No diagram selected</div>
        <div className="text-sm">Select a diagram from Files, or ask the agent to create one.</div>
      </div>
    );
  }

  return (
    <div className="h-full w-full">
      <ExcalidrawComp
        initialData={sceneData ? { elements: sceneData.elements || [], appState: sceneData.appState } : undefined}
        onChange={handleChange}
        theme={theme}
        excalidrawAPI={(api: ExcalidrawImperativeAPI) => {
          excalidrawAPIRef.current = api;
        }}
      />
    </div>
  );
}
