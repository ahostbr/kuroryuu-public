/**
 * ExcalidrawDiagramCard - Rich visualization card for Excalidraw MCP create_view results
 *
 * Renders sanitized SVG from the official Excalidraw MCP server inline.
 * Includes "Open in Excalidraw" button when elements data is available.
 */

import { useState, useMemo } from 'react';
import {
  ChevronDown,
  ChevronUp,
  Pencil,
  ExternalLink,
  Maximize2,
  Copy,
  Check,
} from 'lucide-react';
import type { ExcalidrawDiagramData } from '../../../types/insights';

interface ExcalidrawDiagramCardProps {
  data: ExcalidrawDiagramData;
  collapsed?: boolean;
}

/**
 * Sanitize SVG content by stripping dangerous elements/attributes.
 * Removes script tags, event handlers, and external resource references.
 */
function sanitizeSvg(raw: string): string {
  // Remove script tags and their content
  let svg = raw.replace(/<script[\s\S]*?<\/script>/gi, '');
  // Remove event handler attributes (onclick, onload, onerror, etc.)
  svg = svg.replace(/\s+on\w+\s*=\s*["'][^"']*["']/gi, '');
  svg = svg.replace(/\s+on\w+\s*=\s*\S+/gi, '');
  // Remove javascript: URLs
  svg = svg.replace(/href\s*=\s*["']javascript:[^"']*["']/gi, '');
  svg = svg.replace(/xlink:href\s*=\s*["']javascript:[^"']*["']/gi, '');
  return svg;
}

export function ExcalidrawDiagramCard({ data, collapsed: initialCollapsed = false }: ExcalidrawDiagramCardProps) {
  const [isCollapsed, setIsCollapsed] = useState(initialCollapsed);
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const sanitizedSvg = useMemo(() => sanitizeSvg(data.svgContent), [data.svgContent]);

  const handleCopySvg = () => {
    navigator.clipboard.writeText(data.svgContent).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleOpenInExcalidraw = () => {
    if (data.elements && window.electronAPI?.shell?.openExternal) {
      // Encode elements as Excalidraw URL hash
      const encoded = encodeURIComponent(JSON.stringify(data.elements));
      window.electronAPI.shell.openExternal(`https://excalidraw.com/#json=${encoded}`);
    }
  };

  return (
    <div className="border border-border rounded-lg overflow-hidden bg-card/50 mt-2">
      {/* Header */}
      <button
        onClick={() => setIsCollapsed(!isCollapsed)}
        className="w-full flex items-center gap-2 px-3 py-2 bg-secondary/50 hover:bg-secondary/70 transition-colors"
      >
        <Pencil className="w-4 h-4 text-violet-400" />
        <span className="text-sm font-medium text-foreground">Excalidraw Diagram</span>
        {data.fileName && (
          <span className="px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400 text-[10px] truncate max-w-[200px]">
            {data.fileName}
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
          {/* SVG preview */}
          <div
            className={`bg-white rounded-lg overflow-hidden border border-border/30 transition-all ${
              expanded ? 'max-h-none' : 'max-h-96'
            }`}
          >
            <div
              className="w-full flex items-center justify-center p-4 overflow-auto"
              dangerouslySetInnerHTML={{ __html: sanitizedSvg }}
            />
          </div>

          {/* Actions */}
          <div className="flex items-center gap-2 flex-wrap">
            <button
              onClick={() => setExpanded(!expanded)}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-secondary/50 hover:bg-secondary/70 transition-colors text-foreground"
            >
              <Maximize2 className="w-3.5 h-3.5" />
              {expanded ? 'Collapse' : 'Expand'}
            </button>

            <button
              onClick={handleCopySvg}
              className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-secondary/50 hover:bg-secondary/70 transition-colors text-foreground"
            >
              {copied ? <Check className="w-3.5 h-3.5 text-green-400" /> : <Copy className="w-3.5 h-3.5" />}
              {copied ? 'Copied' : 'Copy SVG'}
            </button>

            {data.elements && (
              <button
                onClick={handleOpenInExcalidraw}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded text-xs bg-violet-500/10 hover:bg-violet-500/20 transition-colors text-violet-400"
              >
                <ExternalLink className="w-3.5 h-3.5" />
                Open in Excalidraw
              </button>
            )}
          </div>

          {/* Footer */}
          <div className="flex items-center gap-4 text-xs text-muted-foreground pt-2 border-t border-border/30">
            <span className="flex items-center gap-1">
              <Pencil className="w-3 h-3" />
              Official Excalidraw MCP
            </span>
            {data.elements && (
              <span>{data.elements.length} elements</span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
