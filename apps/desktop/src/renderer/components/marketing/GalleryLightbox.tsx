import { useEffect, useCallback } from 'react';
import { useMarketingStore } from '../../stores/marketing-store';
import { ChevronLeft, ChevronRight, X, Trash2, ExternalLink } from 'lucide-react';

export function GalleryLightbox() {
  const assets = useMarketingStore((s) => s.assets);
  const lightboxAssetId = useMarketingStore((s) => s.lightboxAssetId);
  const setLightboxAssetId = useMarketingStore((s) => s.setLightboxAssetId);
  const deleteAsset = useMarketingStore((s) => s.deleteAsset);

  const currentIndex = assets.findIndex(a => a.id === lightboxAssetId);
  const asset = assets[currentIndex];

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex < assets.length - 1;

  const goPrev = useCallback(() => {
    if (hasPrev) setLightboxAssetId(assets[currentIndex - 1].id);
  }, [hasPrev, currentIndex, assets, setLightboxAssetId]);

  const goNext = useCallback(() => {
    if (hasNext) setLightboxAssetId(assets[currentIndex + 1].id);
  }, [hasNext, currentIndex, assets, setLightboxAssetId]);

  const close = useCallback(() => {
    setLightboxAssetId(null);
  }, [setLightboxAssetId]);

  const handleDelete = useCallback(() => {
    if (asset) {
      deleteAsset(asset.id);
      close();
    }
  }, [asset, deleteAsset, close]);

  const handleOpen = useCallback(() => {
    if (asset && window.electronAPI?.shell) {
      window.electronAPI.shell.openPath(asset.path);
    }
  }, [asset]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowLeft') goPrev();
      else if (e.key === 'ArrowRight') goNext();
      else if (e.key === 'Escape') close();
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [goPrev, goNext, close]);

  if (!asset) return null;

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
    <div
      className="fixed inset-0 bg-black/90 z-50 flex items-center justify-center"
      onClick={close}
    >
      {/* Close button */}
      <button
        onClick={close}
        className="absolute top-4 right-4 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      {/* Previous arrow */}
      {hasPrev && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goPrev();
          }}
          className="absolute left-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <ChevronLeft className="w-6 h-6" />
        </button>
      )}

      {/* Next arrow */}
      {hasNext && (
        <button
          onClick={(e) => {
            e.stopPropagation();
            goNext();
          }}
          className="absolute right-4 top-1/2 -translate-y-1/2 p-2 rounded-full bg-zinc-800 hover:bg-zinc-700 text-zinc-400 hover:text-zinc-100 transition-colors"
        >
          <ChevronRight className="w-6 h-6" />
        </button>
      )}

      {/* Content area */}
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-w-4xl w-full mx-16"
      >
        {/* Media preview */}
        <div className="flex items-center justify-center mb-4">
          {asset.type === 'image' && (
            <img
              src={`file://${asset.path}`}
              alt={asset.name}
              className="max-w-full max-h-[70vh] object-contain rounded-lg mx-auto"
            />
          )}

          {asset.type === 'video' && (
            <video
              src={`file://${asset.path}`}
              controls
              className="max-w-full max-h-[70vh] rounded-lg mx-auto"
            />
          )}

          {(asset.type === 'voiceover' || asset.type === 'music') && (
            <div className="w-full">
              <audio
                src={`file://${asset.path}`}
                controls
                className="w-full mt-8"
              />
            </div>
          )}

          {(asset.type === 'copy' || asset.type === 'page') && (
            <div className="bg-zinc-800 rounded-lg p-6 max-h-[70vh] overflow-y-auto text-sm text-zinc-300">
              {asset.metadata?.content || 'No preview available'}
            </div>
          )}
        </div>

        {/* Info bar */}
        <div className="mt-4 bg-zinc-800/80 rounded-lg p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-sm font-medium text-zinc-100">{asset.name}</span>
            <span className="px-2 py-0.5 bg-amber-500/20 text-amber-500 rounded text-xs">
              {asset.type}
            </span>
            <span className="text-xs text-zinc-500">{formatSize(asset.size)}</span>
            <span className="text-xs text-zinc-500">{formatDate(asset.created_at)}</span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={handleOpen}
              className="flex items-center gap-2 bg-amber-500 hover:bg-amber-600 text-zinc-900 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <ExternalLink className="w-4 h-4" />
              Open
            </button>
            <button
              onClick={handleDelete}
              className="flex items-center gap-2 bg-red-500/20 hover:bg-red-500/30 text-red-500 px-4 py-2 rounded-lg text-sm font-medium transition-colors"
            >
              <Trash2 className="w-4 h-4" />
              Delete
            </button>
          </div>
        </div>
      </div>

      {/* Counter */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 text-sm text-zinc-500">
        {currentIndex + 1} / {assets.length}
      </div>
    </div>
  );
}
