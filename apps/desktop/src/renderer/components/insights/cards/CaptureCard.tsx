/**
 * CaptureCard - Rich visualization card for k_capture results
 *
 * Displays:
 * - Screenshot preview (thumbnail)
 * - Image dimensions and path
 * - Monitor information
 */

import { useState } from 'react';
import {
  Camera,
  ChevronDown,
  ChevronUp,
  Monitor,
  Image,
  Clock,
  Maximize2,
  ExternalLink,
} from 'lucide-react';
import type { CaptureData, CaptureMonitor } from '../../../types/insights';

interface CaptureCardProps {
  data: CaptureData;
  collapsed?: boolean;
}

function MonitorItem({ monitor }: { monitor: CaptureMonitor }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1 rounded bg-card/30 border border-border/50">
      <Monitor className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
      <span className="text-xs text-foreground">{monitor.name || `Monitor ${monitor.id}`}</span>
      <span className="text-xs text-muted-foreground">
        {monitor.width}x{monitor.height}
      </span>
      {monitor.primary && (
        <span className="px-1 py-0.5 rounded bg-blue-500/10 text-blue-400 text-[9px]">
          Primary
        </span>
      )}
    </div>
  );
}

export function CaptureCard({ data, collapsed: initialCollapsed = false }: CaptureCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const hasImage = data.imagePath && data.imagePath.length > 0;
  const monitorCount = data.monitors?.length || 0;

  return (
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
          {/* Image preview placeholder */}
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
              </div>
              <div className="relative bg-zinc-800 rounded overflow-hidden aspect-video flex items-center justify-center">
                <div className="text-xs text-muted-foreground">
                  Image saved to disk
                </div>
              </div>
              <div className="mt-2 flex items-center gap-2">
                <code className="flex-1 text-xs font-mono text-muted-foreground truncate">
                  {data.imagePath}
                </code>
                <button
                  className="p-1 rounded hover:bg-secondary transition-colors"
                  title="Open image location"
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
  );
}
