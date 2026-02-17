import { useEffect, useState } from 'react';
import { useMarketingStore } from '../../../stores/marketing-store';
import { FolderOpen, FileText, Image as ImageIcon, Video, Music, File, Trash2, Filter } from 'lucide-react';
import type { MarketingAsset } from '../../../types/marketing';
import { GalleryLightbox } from '../GalleryLightbox';

export function GalleryPage() {
  const assets = useMarketingStore((s) => s.assets);
  const loadAssets = useMarketingStore((s) => s.loadAssets);
  const deleteAsset = useMarketingStore((s) => s.deleteAsset);
  const lightboxAssetId = useMarketingStore((s) => s.lightboxAssetId);
  const setLightboxAssetId = useMarketingStore((s) => s.setLightboxAssetId);
  const [filter, setFilter] = useState<MarketingAsset['type'] | 'all'>('all');

  useEffect(() => { loadAssets(); }, [loadAssets]);

  const filteredAssets = filter === 'all' ? assets : assets.filter((a) => a.type === filter);

  const getAssetIcon = (type: MarketingAsset['type']) => {
    switch (type) {
      case 'image': return ImageIcon;
      case 'video': return Video;
      case 'voiceover': case 'music': return Music;
      case 'copy': case 'page': return FileText;
      default: return File;
    }
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (dateStr: string) => {
    return new Date(dateStr).toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-3">
          <FolderOpen className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Asset Gallery</h2>
            <p className="text-xs text-zinc-500">Browse and manage generated assets</p>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <select
            value={filter}
            onChange={(e) => setFilter(e.target.value as MarketingAsset['type'] | 'all')}
            className="px-3 py-1.5 bg-zinc-800 border border-zinc-700 rounded text-sm text-zinc-300 focus:outline-none focus:ring-1 focus:ring-amber-500"
          >
            <option value="all">All Types</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="voiceover">Voiceovers</option>
            <option value="music">Music</option>
            <option value="copy">Copy</option>
            <option value="page">Pages</option>
          </select>
          <div className="flex items-center gap-2 px-3 py-1.5 bg-zinc-800 rounded text-sm">
            <Filter className="w-3.5 h-3.5 text-zinc-500" />
            <span className="text-zinc-400 font-medium">{filteredAssets.length}</span>
          </div>
        </div>
      </div>

      {/* Gallery Grid */}
      <div className="flex-1 overflow-y-auto">
        {filteredAssets.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
            <File className="w-12 h-12 mb-3 opacity-50" />
            <p className="text-sm font-medium">No assets yet</p>
            <p className="text-xs mt-1">Generate assets using the tool pages</p>
          </div>
        ) : (
          <div className="grid grid-cols-3 gap-4">
            {filteredAssets.map((asset) => {
              const Icon = getAssetIcon(asset.type);
              return (
                <div
                  key={asset.id}
                  onClick={() => setLightboxAssetId(asset.id)}
                  className="bg-zinc-900 rounded-lg border border-zinc-700 hover:border-amber-500/50 p-4 cursor-pointer group transition-colors"
                >
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <Icon className="w-5 h-5 text-zinc-400" />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteAsset(asset.id);
                      }}
                      className="opacity-0 group-hover:opacity-100 p-1.5 rounded hover:bg-red-500/20 text-zinc-400 hover:text-red-500 transition-all"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>

                  {/* Thumbnail for images */}
                  {asset.type === 'image' && (
                    <img
                      src={`file://${asset.path}`}
                      alt={asset.name}
                      className="w-full h-32 object-cover rounded mb-2"
                    />
                  )}

                  {/* Asset info */}
                  <h3 className="text-sm font-medium text-zinc-100 truncate mb-1">
                    {asset.name}
                  </h3>
                  <div className="flex items-center gap-2 text-xs text-zinc-500">
                    <span>{formatSize(asset.size)}</span>
                    <span>•</span>
                    <span>{formatDate(asset.createdAt)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Lightbox */}
      {lightboxAssetId && <GalleryLightbox />}
    </div>
  );
}
