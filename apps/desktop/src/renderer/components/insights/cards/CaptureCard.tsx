/**
 * CaptureCard - Rich visualization card for k_capture results
 *
 * Displays:
 * - Screenshot preview (thumbnail)
 * - Image dimensions and path
 * - Monitor information
 * - Click to open lightbox with zoom controls
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Monitor,
  Image,
  Clock,
  Maximize2,
  ExternalLink,
  Loader,
  X,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  RotateCcw,
  Download,
} from 'lucide-react';
import type { CaptureData, CaptureMonitor } from '../../../types/insights';

interface CaptureCardProps {
  data: CaptureData;
  collapsed?: boolean;
}

function MonitorItem({ monitor }: { monitor: CaptureMonitor }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-card/30 border border-border/50">
      <Monitor className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
      <span className="text-xs text-foreground font-medium">{monitor.name || `Monitor ${monitor.id}`}</span>
      <span className="text-xs text-muted-foreground">
        {monitor.width}×{monitor.height}
      </span>
      {(monitor.left !== undefined || monitor.top !== undefined) && (
        <span className="text-[10px] text-muted-foreground/70">
          @({monitor.left ?? 0}, {monitor.top ?? 0})
        </span>
      )}
      {monitor.primary && (
        <span className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[9px]">
          Primary
        </span>
      )}
    </div>
  );
}

interface ImageLightboxProps {
  src: string;
  alt: string;
  onClose: () => void;
  imagePath?: string;
}

function ImageLightbox({ src, alt, onClose, imagePath }: ImageLightboxProps) {
  const [zoom, setZoom] = useState(1);
  const [fitToScreen, setFitToScreen] = useState(true);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  const zoomLevels = [0.25, 0.5, 0.75, 1, 1.5, 2, 3, 4];

  const handleZoomIn = useCallback(() => {
    const currentIndex = zoomLevels.findIndex(z => z >= zoom);
    const nextIndex = Math.min(currentIndex + 1, zoomLevels.length - 1);
    setZoom(zoomLevels[nextIndex]);
    setFitToScreen(false);
  }, [zoom]);

  const handleZoomOut = useCallback(() => {
    const currentIndex = zoomLevels.findIndex(z => z >= zoom);
    const prevIndex = Math.max(currentIndex - 1, 0);
    setZoom(zoomLevels[prevIndex]);
    setFitToScreen(false);
  }, [zoom]);

  const handleReset = useCallback(() => {
    setZoom(1);
    setPosition({ x: 0, y: 0 });
    setFitToScreen(true);
  }, []);

  const toggleFitToScreen = useCallback(() => {
    setFitToScreen(!fitToScreen);
    if (!fitToScreen) {
      setPosition({ x: 0, y: 0 });
    }
  }, [fitToScreen]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (!fitToScreen && zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
    }
  }, [fitToScreen, zoom, position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPosition({
        x: e.clientX - dragStart.x,
        y: e.clientY - dragStart.y,
      });
    }
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => {
    setIsDragging(false);
  }, []);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    if (e.deltaY < 0) {
      handleZoomIn();
    } else {
      handleZoomOut();
    }
  }, [handleZoomIn, handleZoomOut]);

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === '+' || e.key === '=') handleZoomIn();
      if (e.key === '-') handleZoomOut();
      if (e.key === '0') handleReset();
      if (e.key === 'f') toggleFitToScreen();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose, handleZoomIn, handleZoomOut, handleReset, toggleFitToScreen]);

  // Download handler
  const handleDownload = useCallback(() => {
    const link = document.createElement('a');
    link.href = src;
    link.download = imagePath?.split(/[/\\]/).pop() || 'screenshot.png';
    link.click();
  }, [src, imagePath]);

  return (
    <div
      className="fixed inset-0 z-[9999] bg-black/90 flex flex-col"
      onClick={(e) => e.target === e.currentTarget && onClose()}
    >
      {/* Toolbar */}
      <div className="flex items-center justify-between px-4 py-2 bg-zinc-900/80 border-b border-zinc-700">
        <div className="flex items-center gap-2 text-sm text-zinc-300">
          <Camera className="w-4 h-4 text-rose-400" />
          <span className="font-medium">Screenshot Viewer</span>
          {imagePath && (
            <span className="text-xs text-zinc-500 ml-2 truncate max-w-[400px]">
              {imagePath}
            </span>
          )}
        </div>

        <div className="flex items-center gap-1">
          {/* Zoom controls */}
          <button
            onClick={handleZoomOut}
            className="p-2 rounded hover:bg-zinc-700 transition-colors text-zinc-300"
            title="Zoom out (-)"
          >
            <ZoomOut className="w-4 h-4" />
          </button>
          <span className="px-2 text-sm text-zinc-400 min-w-[60px] text-center">
            {fitToScreen ? 'Fit' : `${Math.round(zoom * 100)}%`}
          </span>
          <button
            onClick={handleZoomIn}
            className="p-2 rounded hover:bg-zinc-700 transition-colors text-zinc-300"
            title="Zoom in (+)"
          >
            <ZoomIn className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-zinc-700 mx-2" />

          {/* Fit to screen toggle */}
          <button
            onClick={toggleFitToScreen}
            className={`p-2 rounded transition-colors ${fitToScreen ? 'bg-rose-500/20 text-rose-400' : 'hover:bg-zinc-700 text-zinc-300'}`}
            title="Fit to screen (F)"
          >
            {fitToScreen ? <Minimize className="w-4 h-4" /> : <Maximize className="w-4 h-4" />}
          </button>

          {/* Reset */}
          <button
            onClick={handleReset}
            className="p-2 rounded hover:bg-zinc-700 transition-colors text-zinc-300"
            title="Reset view (0)"
          >
            <RotateCcw className="w-4 h-4" />
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="p-2 rounded hover:bg-zinc-700 transition-colors text-zinc-300"
            title="Download"
          >
            <Download className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-zinc-700 mx-2" />

          {/* Close button */}
          <button
            onClick={onClose}
            className="p-2 rounded hover:bg-red-500/20 hover:text-red-400 transition-colors text-zinc-300"
            title="Close (Esc)"
          >
            <X className="w-5 h-5" />
          </button>
        </div>
      </div>

      {/* Image container */}
      <div
        className="flex-1 overflow-hidden flex items-center justify-center"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        style={{ cursor: !fitToScreen && zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
      >
        <img
          src={src}
          alt={alt}
          draggable={false}
          className="select-none"
          style={{
            transform: fitToScreen
              ? 'none'
              : `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
            maxWidth: fitToScreen ? '100%' : 'none',
            maxHeight: fitToScreen ? '100%' : 'none',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
        />
      </div>

      {/* Footer hint */}
      <div className="px-4 py-2 bg-zinc-900/80 border-t border-zinc-700 text-center">
        <span className="text-xs text-zinc-500">
          Scroll to zoom • Drag to pan • Press Esc to close
        </span>
      </div>
    </div>
  );
}

export function CaptureCard({ data, collapsed: initialCollapsed = false }: CaptureCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [loadedImage, setLoadedImage] = useState<{ base64: string; mimeType: string } | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  const hasImage = data.imagePath && data.imagePath.length > 0;
  const monitorCount = data.monitors?.length || 0;

  // Load image from file path if base64 not provided
  useEffect(() => {
    if (hasImage && !data.base64 && !loadedImage && !imageLoading && !imageError) {
      setImageLoading(true);
      window.electronAPI?.fs?.readImageAsBase64?.(data.imagePath!)
        .then((result) => {
          if (result.ok && result.base64) {
            setLoadedImage({ base64: result.base64, mimeType: result.mimeType || 'image/png' });
          } else {
            setImageError(result.error || 'Failed to load image');
          }
        })
        .catch((err) => {
          setImageError(String(err));
        })
        .finally(() => {
          setImageLoading(false);
        });
    }
  }, [hasImage, data.base64, data.imagePath, loadedImage, imageLoading, imageError]);

  // Use provided base64 or loaded image
  const imageBase64 = data.base64 || loadedImage?.base64;
  const imageMimeType = data.mimeType || loadedImage?.mimeType || 'image/png';
  const imageSrc = imageBase64 ? `data:${imageMimeType};base64,${imageBase64}` : null;

  return (
    <>
      <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
        {/* Header */}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
        >
          <Camera className="w-4 h-4 text-rose-400" />
          <span className="text-sm font-medium text-foreground">Screen Capture</span>
          {data.action && (
            <span className="px-1.5 py-0.5 rounded bg-rose-500/10 text-rose-400 text-[10px]">
              {data.action}
            </span>
          )}
          {data.status && (
            <span className={`px-1.5 py-0.5 rounded text-[10px] ${
              data.status === 'ok' || data.status === 'success'
                ? 'bg-green-500/10 text-green-400'
                : 'bg-yellow-500/10 text-yellow-400'
            }`}>
              {data.status}
            </span>
          )}
          <span className="flex-1" />
          <span className="text-muted-foreground">
            {isCollapsed ? (
              <ChevronDown className="w-4 h-4" />
            ) : (
              <ChevronUp className="w-4 h-4" />
            )}
          </span>
        </button>

        {/* Body */}
        {!isCollapsed && (
          <div className="p-3 space-y-3">
            {/* Image preview */}
            {hasImage ? (
              <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Image className="w-3.5 h-3.5 text-rose-400" />
                  <span className="uppercase">Screenshot</span>
                  {data.dimensions && (
                    <span className="ml-auto flex items-center gap-1">
                      <Maximize2 className="w-3 h-3" />
                      {data.dimensions.width}x{data.dimensions.height}
                    </span>
                  )}
                  {data.sizeBytes && (
                    <span className="text-muted-foreground">
                      {(data.sizeBytes / 1024).toFixed(1)} KB
                    </span>
                  )}
                </div>
                <div
                  className="relative bg-zinc-900 rounded overflow-hidden cursor-pointer group"
                  onClick={() => imageSrc && setLightboxOpen(true)}
                >
                  {imageSrc ? (
                    <>
                      <img
                        src={imageSrc}
                        alt="Screenshot"
                        className="w-full h-auto max-h-96 object-contain"
                      />
                      {/* Hover overlay */}
                      <div className="absolute inset-0 bg-black/50 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                        <div className="flex items-center gap-2 text-white text-sm">
                          <ZoomIn className="w-5 h-5" />
                          Click to view full size
                        </div>
                      </div>
                    </>
                  ) : imageLoading ? (
                    <div className="flex items-center justify-center gap-2 text-xs text-muted-foreground py-8">
                      <Loader className="w-4 h-4 animate-spin" />
                      Loading image...
                    </div>
                  ) : imageError ? (
                    <div className="text-xs text-red-400 text-center py-8">
                      Failed to load image: {imageError}
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground text-center py-8">
                      No image data available
                    </div>
                  )}
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <code className="flex-1 text-xs font-mono text-muted-foreground truncate">
                    {data.imagePath}
                  </code>
                  <button
                    className="p-1 rounded hover:bg-secondary transition-colors"
                    title="Open image location"
                    onClick={(e) => {
                      e.stopPropagation();
                      // Try to open in file explorer (Electron)
                      if (window.electronAPI?.shell?.openPath) {
                        window.electronAPI.shell.openPath(data.imagePath!);
                      }
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5 text-muted-foreground" />
                  </button>
                </div>
              </div>
            ) : monitorCount > 0 ? (
              /* Monitor list */
              <div className="bg-background/50 rounded-lg p-3 border border-border/30">
                <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                  <Monitor className="w-3.5 h-3.5 text-blue-400" />
                  <span className="uppercase">Available Monitors ({monitorCount})</span>
                </div>
                <div className="space-y-1">
                  {data.monitors?.map((monitor, idx) => (
                    <MonitorItem key={monitor.id || idx} monitor={monitor} />
                  ))}
                </div>
              </div>
            ) : data.error ? (
              /* Error message */
              <div className="bg-red-500/10 rounded-lg p-3 border border-red-500/30">
                <div className="text-xs text-red-400 font-medium mb-1">Error</div>
                <div className="text-sm text-foreground">{data.error}</div>
              </div>
            ) : (
              <div className="text-xs text-muted-foreground text-center py-2">
                No capture data
              </div>
            )}

            {/* Timestamp */}
            {data.timestamp && (
              <div className="flex items-center gap-2 text-xs text-muted-foreground">
                <Clock className="w-3 h-3" />
                Captured: {new Date(data.timestamp).toLocaleString()}
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
              <span className="flex items-center gap-1">
                <Camera className="w-3 h-3" />
                {data.action || 'screenshot'}
              </span>
              {monitorCount > 0 && (
                <span className="flex items-center gap-1">
                  <Monitor className="w-3 h-3" />
                  {monitorCount} monitors
                </span>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Lightbox modal */}
      {lightboxOpen && imageSrc && (
        <ImageLightbox
          src={imageSrc}
          alt="Screenshot"
          imagePath={data.imagePath}
          onClose={() => setLightboxOpen(false)}
        />
      )}
    </>
  );
}
