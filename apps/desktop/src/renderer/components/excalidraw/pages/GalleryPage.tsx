import { useEffect } from 'react';
import { useExcalidrawStore } from '../../../stores/excalidraw-store';

export function GalleryPage() {
  const files = useExcalidrawStore((s) => s.files);
  const loadFiles = useExcalidrawStore((s) => s.loadFiles);
  const setActiveFile = useExcalidrawStore((s) => s.setActiveFile);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  if (files.length === 0) {
    return (
      <div className="h-full flex items-center justify-center bg-card text-muted-foreground text-sm">
        No diagrams yet. Create your first diagram to see it here.
      </div>
    );
  }

  return (
    <div className="h-full overflow-y-auto bg-card p-4">
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {files.map((f) => (
          <button
            key={f.name}
            onClick={() => setActiveFile(f.name)}
            className="group rounded-lg border border-border hover:border-primary/50 bg-card hover:bg-secondary/30 transition-all overflow-hidden text-left"
          >
            {/* Preview placeholder */}
            <div className="aspect-video bg-muted/30 flex items-center justify-center border-b border-border">
              <div className="text-muted-foreground text-xs">
                {f.element_count >= 0 ? `${f.element_count} elements` : '...'}
              </div>
            </div>

            {/* Card info */}
            <div className="p-3">
              <div className="text-sm font-medium text-foreground group-hover:text-primary truncate">
                {f.name}
              </div>
              <div className="text-xs text-muted-foreground mt-1">
                {(f.size_bytes / 1024).toFixed(1)} KB
              </div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}
