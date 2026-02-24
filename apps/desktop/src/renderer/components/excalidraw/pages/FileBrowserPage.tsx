import { useEffect } from 'react';
import { FileText, RefreshCw } from 'lucide-react';
import { useExcalidrawStore } from '../../../stores/excalidraw-store';

export function FileBrowserPage() {
  const files = useExcalidrawStore((s) => s.files);
  const activeFile = useExcalidrawStore((s) => s.activeFile);
  const loadFiles = useExcalidrawStore((s) => s.loadFiles);
  const setActiveFile = useExcalidrawStore((s) => s.setActiveFile);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  return (
    <div className="h-full flex flex-col bg-card">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <h3 className="text-sm font-medium text-foreground">Diagrams</h3>
        <button
          onClick={loadFiles}
          className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
          title="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </div>

      {/* File list */}
      <div className="flex-1 overflow-y-auto p-2 space-y-1">
        {files.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            No diagrams yet. Ask the agent to create one.
          </div>
        ) : (
          files.map((f) => (
            <button
              key={f.name}
              onClick={() => setActiveFile(f.name)}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all text-left ${
                activeFile === f.name
                  ? 'bg-primary/10 text-primary border border-primary/30'
                  : 'hover:bg-secondary text-foreground'
              }`}
            >
              <FileText size={16} className="flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium truncate">{f.name}</div>
                <div className="text-xs text-muted-foreground">
                  {f.element_count >= 0 ? `${f.element_count} elements` : 'unknown'} &middot;{' '}
                  {(f.size_bytes / 1024).toFixed(1)} KB
                </div>
              </div>
            </button>
          ))
        )}
      </div>
    </div>
  );
}
