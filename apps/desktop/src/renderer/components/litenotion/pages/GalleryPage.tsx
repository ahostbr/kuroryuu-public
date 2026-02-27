import { useState, useEffect } from 'react';
import { FolderOpen, Image as ImageIcon } from 'lucide-react';

interface GalleryItem {
  name: string;
  path: string;
  type: string;
}

export function GalleryPage() {
  const [items, setItems] = useState<GalleryItem[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadGallery();
  }, []);

  const loadGallery = async () => {
    setLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:8200/v1/marketing/assets');
      if (!res.ok) {
        setItems([]);
        return;
      }
      const data = await res.json();
      setItems(
        (data.assets || []).map((a: any) => ({
          name: a.filename || a.id,
          path: a.path || '',
          type: a.type || 'unknown',
        }))
      );
    } catch {
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <FolderOpen className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Gallery</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Browse generated assets and outputs</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6">
        {loading ? (
          <div className="text-sm text-zinc-500 text-center py-8">Loading gallery...</div>
        ) : items.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-12 text-zinc-500">
            <ImageIcon className="w-12 h-12 mb-3 text-zinc-600" />
            <p className="text-sm font-medium text-zinc-400">No assets yet</p>
            <p className="text-xs text-zinc-500 mt-1">
              Generate images, voiceovers, or music to see them here
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {items.map((item) => (
              <div
                key={item.path || item.name}
                className="bg-zinc-800 rounded-lg border border-zinc-700 p-3 hover:border-amber-500/50 transition-colors cursor-pointer"
              >
                <div className="aspect-video bg-zinc-900 rounded mb-2 flex items-center justify-center">
                  <ImageIcon className="w-8 h-8 text-zinc-600" />
                </div>
                <p className="text-xs text-zinc-300 truncate">{item.name}</p>
                <p className="text-[10px] text-zinc-500">{item.type}</p>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
