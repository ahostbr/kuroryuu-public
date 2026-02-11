import { useEffect, useState } from 'react';
import { useMarketingStore } from '../../stores/marketing-store';
import { FileText, Image as ImageIcon, Video, Music, File, Trash2, Filter } from 'lucide-react';
import type { MarketingAsset } from '../../types/marketing';

export function MarketingAssetGallery() {
  const assets = useMarketingStore((s) => s.assets);
  const loadAssets = useMarketingStore((s) => s.loadAssets);
  const deleteAsset = useMarketingStore((s) => s.deleteAsset);
  const [filter, setFilter] = useState<MarketingAsset['type'] | 'all'>('all');
  const [selectedAsset, setSelectedAsset] = useState<MarketingAsset | null>(null);

  useEffect(() => {
    loadAssets();
  }, [loadAssets]);

  const filteredAssets = filter === 'all' ? assets : assets.filter((a) => a.type === filter);

  const getAssetIcon = (type: MarketingAsset['type']) => {
    switch (type) {
      case 'image':
        return ImageIcon;
      case 'video':
        return Video;
      case 'voiceover':
      case 'music':
        return Music;
      case 'copy':
      case 'page':
        return FileText;
      default:
        return File;
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  return (
    <div className="h-full bg-zinc-800 rounded-lg border border-zinc-700 flex flex-col overflow-hidden">
      <div className="p-4 border-b border-zinc-700">
        <h2 className="text-lg font-semibold text-zinc-100 mb-3">Asset Gallery</h2>

        {/* Filter */}
        <div className="flex items-center gap-2">
          <Filter className="w-4 h-4 text-zinc-400" />
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as MarketingAsset['type'] | 'all')}
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 focus:outline-none focus:border-amber-500"
          >
            <option value="all">All Types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="voiceover">Voiceovers</option>
            <option value="music">Music</option>
            <option value="copy">Copy</option>
            <option value="page">Pages</option>
          </select>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {filteredAssets.length === 0 ? (
          <div className="h-full flex items-center justify-center">
            <div className="text-center text-zinc-500">
              <File className="w-8 h-8 mx-auto mb-2 opacity-50" />
              <p className="text-sm">No assets yet</p>
              <p className="text-xs mt-1">Generate assets using the tools panel</p>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3">
            {filteredAssets.map((asset) => {
              const Icon = getAssetIcon(asset.type);
              return (
                <div
                  key={asset.id}
                  onClick={() => setSelectedAsset(asset)}
                  className="bg-zinc-900 rounded-lg border border-zinc-700 hover:border-amber-500/50 p-3 cursor-pointer transition-colors group"
                >
                  <div className="flex items-start justify-between mb-2">
                    <Icon className="w-5 h-5 text-amber-500" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteAsset(asset.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-500/20 rounded transition-all"
                    >
                      <Trash2 className="w-3.5 h-3.5 text-red-500" />
                    </button>
                  </div>
                  <div className="text-sm text-zinc-100 font-medium mb-1 truncate">{asset.name}</div>
                  <div className="text-xs text-zinc-500">{formatSize(asset.size)}</div>
                  <div className="text-xs text-zinc-600 mt-1">
                    {new Date(asset.createdAt).toLocaleDateString()}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Preview Modal */}
      {selectedAsset && (
        <div
          onClick={() => setSelectedAsset(null)}
          className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 p-8"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-zinc-800 rounded-lg border border-zinc-700 max-w-2xl w-full max-h-[80vh] overflow-auto p-6"
          >
            <div className="flex items-start justify-between mb-4">
              <div>
                <h3 className="text-lg font-semibold text-zinc-100">{selectedAsset.name}</h3>
                <p className="text-sm text-zinc-400 mt-1">
                  {selectedAsset.type} • {formatSize(selectedAsset.size)}
                </p>
              </div>
              <button
                onClick={() => setSelectedAsset(null)}
                className="text-zinc-400 hover:text-zinc-100 transition-colors"
              >
                ✕
              </button>
            </div>

            <div className="bg-zinc-900 rounded p-4 mb-4">
              <p className="text-sm text-zinc-300">Path: {selectedAsset.path}</p>
              <p className="text-xs text-zinc-500 mt-2">
                Created: {new Date(selectedAsset.createdAt).toLocaleString()}
              </p>
            </div>

            <div className="flex gap-2">
              <button
                onClick={() => {
                  // Open file in default application
                  window.api.shell?.openPath(selectedAsset.path);
                }}
                className="flex-1 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-zinc-900 rounded text-sm font-medium transition-colors"
              >
                Open
              </button>
              <button
                onClick={() => {
                  deleteAsset(selectedAsset.id);
                  setSelectedAsset(null);
                }}
                className="px-4 py-2 bg-red-500/20 hover:bg-red-500/30 text-red-500 rounded text-sm font-medium transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
