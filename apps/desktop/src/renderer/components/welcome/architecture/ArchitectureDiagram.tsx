import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  Monitor,
  Server,
  Box,
  Cpu,
  Users,
  Terminal,
  Database,
  Activity,
  RotateCcw,
  ChevronRight,
  ExternalLink,
  X,
} from 'lucide-react';
import { cn } from '../../../lib/utils';
import archDataJson from './arch-data.json';
import type { ArchData } from '../hotspots/types';

// Helper to navigate to a view by dispatching a custom event
function navigateToView(route: string) {
  const viewName = route.replace(/^\//, '') || 'welcome';
  window.dispatchEvent(new CustomEvent('navigate-to-view', { detail: { view: viewName } }));
}

const archData = archDataJson as ArchData;

// Icon mapping
const iconMap: Record<string, React.ElementType> = {
  monitor: Monitor,
  server: Server,
  box: Box,
  cpu: Cpu,
  users: Users,
  terminal: Terminal,
  database: Database,
  activity: Activity,
};

interface ArchitectureDiagramProps {
  className?: string;
}

export function ArchitectureDiagram({ className }: ArchitectureDiagramProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [activeComponent, setActiveComponent] = useState<string | null>(null);
  const [activePath, setActivePath] = useState<string | null>(null);
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 });

  // Track container size
  useEffect(() => {
    const updateSize = () => {
      if (containerRef.current) {
        setContainerSize({
          width: containerRef.current.offsetWidth,
          height: containerRef.current.offsetHeight,
        });
      }
    };

    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  const handleComponentClick = useCallback((id: string) => {
    setActiveComponent(activeComponent === id ? null : id);
  }, [activeComponent]);

  const handlePathClick = useCallback((pathId: string) => {
    setActivePath(pathId);
    // Highlight first component in path
    const path = archData.suggestedPaths.find(p => p.id === pathId);
    if (path && path.components.length > 0) {
      setActiveComponent(path.components[0]);
    }
  }, []);

  const handleReset = useCallback(() => {
    setActiveComponent(null);
    setActivePath(null);
  }, []);

  const handleJump = useCallback((route: string) => {
    navigateToView(route);
  }, []);

  // Get currently active component data
  const activeComponentData = activeComponent
    ? archData.components.find(c => c.id === activeComponent)
    : null;

  // Check if component is in active path
  const isInActivePath = useCallback((componentId: string) => {
    if (!activePath) return false;
    const path = archData.suggestedPaths.find(p => p.id === activePath);
    return path?.components.includes(componentId) ?? false;
  }, [activePath]);

  // Render markdown-like body
  const renderBody = (md: string) => {
    const lines = md.split('\n');
    return lines.map((line, i) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={i} className="h-2" />;
      if (trimmed.startsWith('**') && trimmed.endsWith('**')) {
        return <div key={i} className="text-sm font-semibold text-foreground mt-2 first:mt-0">{trimmed.slice(2, -2)}</div>;
      }
      if (trimmed.startsWith('• ')) {
        return <li key={i} className="text-sm text-muted-foreground ml-4">{trimmed.slice(2)}</li>;
      }
      return <p key={i} className="text-sm text-muted-foreground">{trimmed}</p>;
    });
  };

  return (
    <div className={cn('w-full space-y-4', className)}>
      {/* Suggested paths */}
      <div className="flex items-center gap-2 flex-wrap">
        {archData.suggestedPaths.map((path) => (
          <button
            key={path.id}
            onClick={() => handlePathClick(path.id)}
            className={cn(
              'flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium transition-all',
              activePath === path.id
                ? 'bg-primary text-primary-foreground'
                : 'bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80'
            )}
          >
            {path.label}
            <ChevronRight className="w-4 h-4" />
          </button>
        ))}

        <div className="flex-1" />

        <button
          onClick={handleReset}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
        >
          <RotateCcw className="w-4 h-4" />
          Reset
        </button>
      </div>

      {/* Diagram container */}
      <div
        ref={containerRef}
        className="relative w-full aspect-[16/10] bg-secondary/30 rounded-xl border border-border overflow-hidden"
      >
        {/* SVG for edges */}
        <svg className="absolute inset-0 w-full h-full pointer-events-none">
          {archData.edges.map((edge, i) => {
            const fromComp = archData.components.find(c => c.id === edge.from);
            const toComp = archData.components.find(c => c.id === edge.to);
            if (!fromComp || !toComp) return null;

            // Calculate center points
            const fromX = (fromComp.x + fromComp.w / 2) * 100;
            const fromY = (fromComp.y + fromComp.h) * 100;
            const toX = (toComp.x + toComp.w / 2) * 100;
            const toY = toComp.y * 100;

            const isHighlighted = activePath && isInActivePath(edge.from) && isInActivePath(edge.to);

            return (
              <g key={i}>
                <line
                  x1={`${fromX}%`}
                  y1={`${fromY}%`}
                  x2={`${toX}%`}
                  y2={`${toY}%`}
                  stroke={isHighlighted ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                  strokeWidth={isHighlighted ? 2 : 1}
                  strokeOpacity={isHighlighted ? 1 : 0.3}
                  strokeDasharray={isHighlighted ? '' : '4 4'}
                />
                {/* Arrowhead */}
                <circle
                  cx={`${toX}%`}
                  cy={`${toY}%`}
                  r="3"
                  fill={isHighlighted ? 'hsl(var(--primary))' : 'hsl(var(--muted-foreground))'}
                  fillOpacity={isHighlighted ? 1 : 0.3}
                />
              </g>
            );
          })}
        </svg>

        {/* Component nodes */}
        {archData.components.map((comp) => {
          const Icon = iconMap[comp.icon || 'box'] || Box;
          const isActive = activeComponent === comp.id;
          const inPath = isInActivePath(comp.id);

          return (
            <button
              key={comp.id}
              onClick={() => handleComponentClick(comp.id)}
              className={cn(
                'absolute flex flex-col items-center justify-center rounded-lg border-2 transition-all duration-200',
                'hover:scale-105 hover:shadow-lg cursor-pointer',
                isActive
                  ? 'border-primary bg-primary/10 shadow-lg scale-105 z-10'
                  : inPath
                  ? 'border-primary/50 bg-primary/5'
                  : 'border-border bg-card/80 hover:border-primary/30'
              )}
              style={{
                left: `${comp.x * 100}%`,
                top: `${comp.y * 100}%`,
                width: `${comp.w * 100}%`,
                height: `${comp.h * 100}%`,
              }}
            >
              <div
                className={cn(
                  'w-8 h-8 rounded-full flex items-center justify-center mb-1',
                  isActive || inPath ? 'bg-primary/20' : 'bg-secondary'
                )}
                style={comp.color ? { backgroundColor: `${comp.color}20` } : undefined}
              >
                <Icon
                  className="w-4 h-4"
                  style={comp.color ? { color: comp.color } : undefined}
                />
              </div>
              <span className={cn(
                'text-xs font-medium',
                isActive || inPath ? 'text-foreground' : 'text-muted-foreground'
              )}>
                {comp.label}
              </span>
            </button>
          );
        })}
      </div>

      {/* Active component detail panel */}
      <div
        className={cn(
          'overflow-hidden transition-all duration-300 ease-out',
          activeComponentData ? 'max-h-[400px] opacity-100' : 'max-h-0 opacity-0'
        )}
      >
        {activeComponentData && (
          <div className="p-4 rounded-xl bg-card border border-border">
            <div className="flex items-start justify-between gap-4 mb-3">
              <div className="flex items-center gap-2">
                <div
                  className="w-8 h-8 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: `${activeComponentData.color}20` }}
                >
                  {(() => {
                    const Icon = iconMap[activeComponentData.icon || 'box'] || Box;
                    return <Icon className="w-4 h-4" style={{ color: activeComponentData.color }} />;
                  })()}
                </div>
                <h3 className="text-lg font-semibold text-foreground">
                  {activeComponentData.title}
                </h3>
              </div>
              <button
                onClick={() => setActiveComponent(null)}
                className="p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="h-px bg-border mb-3" />

            <div className="space-y-1">{renderBody(activeComponentData.bodyMd)}</div>

            {activeComponentData.jumpRoute && (
              <button
                onClick={() => handleJump(activeComponentData.jumpRoute!)}
                className={cn(
                  'mt-4 flex items-center gap-2 px-4 py-2 rounded-lg',
                  'bg-primary text-primary-foreground hover:bg-primary/90',
                  'font-medium text-sm transition-colors'
                )}
              >
                See it live
                <ExternalLink className="w-4 h-4" />
              </button>
            )}
          </div>
        )}
      </div>

      {/* Help text */}
      <p className="text-xs text-muted-foreground/60 text-center">
        Click components to learn more • Use suggested paths for guided exploration
      </p>
    </div>
  );
}
