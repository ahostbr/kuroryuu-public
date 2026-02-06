import React from 'react';
import { A2UIRenderer } from './A2UIRenderer';
import { ZONE_ORDER, getGridSpan } from './LayoutEngine';
import { A2UIComponent } from '../../types/genui';

interface GenUIDashboardProps {
  documentTitle: string;
  documentType: string;
  layoutType: string;
  componentsByZone: Record<string, A2UIComponent[]>;
  onRegenerate: () => void;
  onToggleSource: () => void;
  onReset: () => void;
}

export const GenUIDashboard: React.FC<GenUIDashboardProps> = ({
  documentTitle,
  documentType,
  layoutType,
  componentsByZone,
  onRegenerate,
  onToggleSource,
  onReset
}) => {
  // Count total components
  const totalComponents = Object.values(componentsByZone).reduce(
    (sum, components) => sum + components.length,
    0
  );

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header Bar */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-3">
          <h2 className="text-lg font-semibold text-foreground">{documentTitle}</h2>
          <span className="px-2 py-1 text-xs font-medium rounded bg-primary/10 text-primary">
            {documentType}
          </span>
          <span className="px-2 py-1 text-xs font-medium rounded bg-muted text-muted-foreground">
            {layoutType}
          </span>
          <span className="px-2 py-1 text-xs rounded bg-muted/50 text-muted-foreground">
            {totalComponents} components
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={onRegenerate}
            className="px-3 py-1.5 text-sm font-medium rounded bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
          >
            Regenerate
          </button>
          <button
            onClick={onToggleSource}
            className="px-3 py-1.5 text-sm font-medium rounded bg-muted text-foreground hover:bg-muted/80 transition-colors"
          >
            Source
          </button>
          <button
            onClick={onReset}
            className="px-3 py-1.5 text-sm font-medium rounded bg-muted text-muted-foreground hover:bg-muted/80 transition-colors"
          >
            New
          </button>
        </div>
      </div>

      {/* Scrollable Dashboard Area */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-7xl mx-auto space-y-6">
          {ZONE_ORDER.map((zoneName) => {
            const components = componentsByZone[zoneName];
            if (!components || components.length === 0) return null;

            return (
              <div key={zoneName} className="space-y-2">
                {/* Zone Label */}
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground/60">
                  {zoneName}
                </div>

                {/* Zone Content */}
                {zoneName === 'hero' ? (
                  // Hero zone: full-width, no grid
                  <div className="space-y-3">
                    {components.map((component) => (
                      <A2UIRenderer key={component.id} component={component} />
                    ))}
                  </div>
                ) : zoneName === 'metrics' ? (
                  // Metrics zone: 4-column grid
                  <div className="grid grid-cols-4 gap-3">
                    {components.map((component) => (
                      <A2UIRenderer key={component.id} component={component} />
                    ))}
                  </div>
                ) : zoneName === 'tags' ? (
                  // Tags zone: flex wrap
                  <div className="flex flex-wrap gap-2">
                    {components.map((component) => (
                      <A2UIRenderer key={component.id} component={component} />
                    ))}
                  </div>
                ) : (
                  // All other zones: 12-column grid with span hints
                  <div className="grid grid-cols-12 gap-3">
                    {components.map((component) => {
                      const span = getGridSpan(component);
                      const spanClass = `col-span-${span}`;
                      return (
                        <div key={component.id} className={spanClass}>
                          <A2UIRenderer component={component} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
