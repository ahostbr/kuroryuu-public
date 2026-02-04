/**
 * PCControlCard - Rich visualization card for k_pccontrol results
 *
 * Displays:
 * - Desktop automation status
 * - Armed state indicator
 * - Window list
 * - Element detection results
 */

import { useState } from 'react';
import {
  Monitor,
  ChevronDown,
  ChevronUp,
  Shield,
  ShieldOff,
  Mouse,
  AppWindow,
  Crosshair,
  Image,
} from 'lucide-react';
import type { PCControlData, PCWindow } from '../../../types/insights';

interface PCControlCardProps {
  data: PCControlData;
  collapsed?: boolean;
}

function WindowItem({ window }: { window: PCWindow }) {
  return (
    <div className="flex items-center gap-2 px-2 py-1.5 rounded bg-card/30 border border-border/50">
      <AppWindow className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
      <span className="text-xs text-foreground truncate flex-1">{window.title || 'Untitled'}</span>
      {window.className && (
        <span className="text-[9px] text-muted-foreground truncate">
          {window.className}
        </span>
      )}
    </div>
  );
}

export function PCControlCard({ data, collapsed: initialCollapsed = false }: PCControlCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);

  const isArmed = data.armed === true;
  const windowCount = data.windows?.length || 0;

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <Monitor className="w-4 h-4 text-red-400" />
        <span className="text-sm font-medium text-foreground">PC Control</span>
        {isArmed ? (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-green-500/10 text-green-400 text-[10px]">
            <Shield className="w-3 h-3" />
            Armed
          </span>
        ) : data.armed === false ? (
          <span className="flex items-center gap-1 px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px]">
            <ShieldOff className="w-3 h-3" />
            Disabled
          </span>
        ) : null}
        {data.action && (
          <span className="px-1.5 py-0.5 rounded bg-red-500/10 text-red-400 text-[10px]">
            {data.action}
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
          {/* Status */}
          {data.status && (
            <div className="bg-background/50 rounded-lg p-2 border border-border/30">
              <div className="text-[10px] text-muted-foreground uppercase mb-1">Status</div>
              <div className="text-sm text-foreground">{data.status}</div>
            </div>
          )}

          {/* Position */}
          {data.position && (
            <div className="bg-background/50 rounded-lg p-2 border border-border/30">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase mb-1">
                <Mouse className="w-3 h-3" />
                Cursor Position
              </div>
              <div className="font-mono text-xs text-foreground">
                X: {data.position.x}, Y: {data.position.y}
              </div>
            </div>
          )}

          {/* Element found */}
          {data.element && (
            <div className="bg-background/50 rounded-lg p-2 border border-border/30">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase mb-1">
                <Crosshair className="w-3 h-3" />
                Element Found
              </div>
              <div className="text-xs text-foreground">
                {data.element.name || data.element.type || 'Element'}
              </div>
              {data.element.bounds && (
                <div className="font-mono text-[10px] text-muted-foreground mt-1">
                  {data.element.bounds.width}x{data.element.bounds.height} @ ({data.element.bounds.x}, {data.element.bounds.y})
                </div>
              )}
            </div>
          )}

          {/* Screenshot path */}
          {data.screenshot && (
            <div className="bg-background/50 rounded-lg p-2 border border-border/30">
              <div className="flex items-center gap-1 text-[10px] text-muted-foreground uppercase mb-1">
                <Image className="w-3 h-3" />
                Screenshot
              </div>
              <code className="text-xs font-mono text-muted-foreground truncate block">
                {data.screenshot}
              </code>
            </div>
          )}

          {/* Window list */}
          {data.windows && data.windows.length > 0 && (
            <div className="bg-background/50 rounded-lg p-3 border border-border/30">
              <div className="flex items-center gap-2 text-xs text-muted-foreground mb-2">
                <AppWindow className="w-3.5 h-3.5 text-blue-400" />
                <span className="uppercase">Windows ({windowCount})</span>
              </div>
              <div className="space-y-1 max-h-40 overflow-y-auto">
                {data.windows.map((win, idx) => (
                  <WindowItem key={win.handle || idx} window={win} />
                ))}
              </div>
            </div>
          )}

          {/* Empty state */}
          {!data.status && !data.position && !data.element && !data.screenshot && windowCount === 0 && (
            <div className="text-xs text-muted-foreground text-center py-2">
              No PC control data
            </div>
          )}

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span className="flex items-center gap-1">
              <Monitor className="w-3 h-3" />
              {data.action || 'status'}
            </span>
            {isArmed && (
              <span className="flex items-center gap-1 text-green-400">
                <Shield className="w-3 h-3" />
                Armed
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
