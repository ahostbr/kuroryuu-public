import React from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { A2UIRenderer } from './A2UIRenderer';
import { ZONE_ORDER, getGridSpan } from './LayoutEngine';
import { A2UIComponent } from '../../types/genui';

interface PlaygroundDashboardProps {
  documentTitle: string;
  documentType: string;
  layoutType: string;
  componentsByZone: Record<string, A2UIComponent[]>;
  onRegenerate: () => void;
  onToggleSource: () => void;
  onReset: () => void;
}

const ZONE_ICONS_IMPERIAL: Record<string, string> = {
  hero: '\u9F8D',     // Dragon kanji
  metrics: '\u2261',  // Triple bar
  insights: '\u25C8', // Diamond
  content: '\u25A0',  // Square
  media: '\u25B6',    // Play
  resources: '\u2192', // Arrow
  tags: '\u00B7',     // Middle dot
};

const ZONE_ICONS_CLEAN: Record<string, string> = {
  hero: '\u2605',     // Star
  metrics: '\u2261',  // Triple bar
  insights: '\u25C6', // Diamond (no fill)
  content: '\u25A1',  // Square (no fill)
  media: '\u25B6',    // Play
  resources: '\u2192', // Arrow
  tags: '\u00B7',     // Middle dot
};

export const PlaygroundDashboard: React.FC<PlaygroundDashboardProps> = ({
  documentTitle,
  documentType,
  layoutType,
  componentsByZone,
  onRegenerate,
  onToggleSource,
  onReset
}) => {
  const imperialMode = useSettingsStore((s) => s.appSettings.genuiImperialMode);
  const toggleMode = useSettingsStore((s) => s.setGenUIImperialMode);

  const totalComponents = Object.values(componentsByZone).reduce(
    (sum, components) => sum + components.length,
    0
  );

  let componentIndex = 0;
  const ZONE_ICONS = imperialMode ? ZONE_ICONS_IMPERIAL : ZONE_ICONS_CLEAN;

  return (
    <div className="h-full flex flex-col" style={{ background: 'var(--background)' }}>
      {/* Scanline overlay */}
      {imperialMode && <div className="absolute inset-0 genui-scanlines z-[1] pointer-events-none" />}

      {/* Header Bar */}
      <div
        className="relative z-[2] flex items-center justify-between px-5 py-3"
        style={{
          background: 'linear-gradient(180deg, color-mix(in srgb, var(--g-card) 98%, transparent) 0%, color-mix(in srgb, var(--g-bg) 95%, transparent) 100%)',
          borderBottom: '1px solid color-mix(in srgb, var(--g-accent) 15%, transparent)',
          boxShadow: '0 4px 20px color-mix(in srgb, var(--g-bg) 40%, transparent)',
        }}
      >
        <div className="flex items-center gap-4">
          {/* Gold accent mark */}
          <div
            className="w-1 h-8 rounded-sm"
            style={{ background: 'linear-gradient(180deg, color-mix(in srgb, var(--g-accent) 60%, transparent), color-mix(in srgb, var(--g-crimson) 40%, transparent))' }}
          />
          <div>
            <h2
              className="text-base font-semibold tracking-wide"
              style={{ color: 'var(--foreground)', textShadow: '0 0 30px color-mix(in srgb, var(--g-accent) 10%, transparent)' }}
            >
              {documentTitle || 'Untitled Document'}
            </h2>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="genui-label" style={{ color: 'color-mix(in srgb, var(--g-accent) 60%, transparent)' }}>{documentType}</span>
              <span style={{ color: 'color-mix(in srgb, var(--g-accent) 20%, transparent)' }}>/</span>
              <span className="genui-label" style={{ color: 'color-mix(in srgb, var(--g-muted) 50%, transparent)' }}>{layoutType}</span>
              <span style={{ color: 'color-mix(in srgb, var(--g-accent) 20%, transparent)' }}>/</span>
              <span className="genui-label" style={{ color: 'color-mix(in srgb, var(--g-muted) 40%, transparent)' }}>{totalComponents} components</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Theme toggle button */}
          <button
            onClick={() => toggleMode(!imperialMode)}
            style={{
              fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
              fontSize: '0.55rem',
              letterSpacing: '0.1em',
              padding: '3px 10px',
              borderRadius: '3px',
              border: '1px solid color-mix(in srgb, var(--g-accent) 20%, transparent)',
              background: 'color-mix(in srgb, var(--g-accent) 5%, transparent)',
              color: 'color-mix(in srgb, var(--g-accent) 60%, transparent)',
              cursor: 'pointer',
              textTransform: 'uppercase' as const,
            }}
          >
            {imperialMode ? '\u25C8 Imperial' : '\u25C7 Themed'}
          </button>
          <button onClick={onRegenerate} className="cp-term-btn--gold px-3 py-1.5 rounded text-xs uppercase tracking-wider" style={{ fontFamily: "ui-monospace, 'Share Tech Mono', monospace" }}>
            Regenerate
          </button>
          <button onClick={onToggleSource} className="cp-term-btn px-3 py-1.5 rounded text-xs uppercase tracking-wider" style={{ fontFamily: "ui-monospace, 'Share Tech Mono', monospace" }}>
            Source
          </button>
          <button onClick={onReset} className="cp-term-btn px-3 py-1.5 rounded text-xs uppercase tracking-wider" style={{ fontFamily: "ui-monospace, 'Share Tech Mono', monospace" }}>
            New
          </button>
        </div>
      </div>

      {/* Scrollable Dashboard Area */}
      <div className="relative z-[2] flex-1 overflow-y-auto px-6 py-5">
        <div className="max-w-7xl mx-auto space-y-8">
          {ZONE_ORDER.map((zoneName) => {
            const components = componentsByZone[zoneName];
            if (!components || components.length === 0) return null;

            return (
              <div key={zoneName}>
                {/* Zone Header — decorative line */}
                <div className="genui-zone-header mb-4">
                  <span
                    className="genui-label flex items-center gap-2"
                    style={{ color: zoneName === 'hero' ? 'color-mix(in srgb, var(--g-accent) 60%, transparent)' : 'color-mix(in srgb, var(--g-accent) 35%, transparent)' }}
                  >
                    <span style={{ fontSize: '0.8rem', opacity: 0.6 }}>{ZONE_ICONS[zoneName] || '\u25A0'}</span>
                    {zoneName}
                  </span>
                </div>

                {/* Zone Content */}
                {zoneName === 'hero' ? (
                  <div className="space-y-3">
                    {components.map((component) => {
                      const delay = componentIndex++ * 60;
                      return (
                        <div key={component.id} className="genui-reveal" style={{ animationDelay: `${delay}ms` }}>
                          <A2UIRenderer component={component} />
                        </div>
                      );
                    })}
                  </div>
                ) : zoneName === 'metrics' ? (
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                    {components.map((component) => {
                      const delay = componentIndex++ * 60;
                      return (
                        <div key={component.id} className="genui-reveal" style={{ animationDelay: `${delay}ms` }}>
                          <A2UIRenderer component={component} />
                        </div>
                      );
                    })}
                  </div>
                ) : zoneName === 'tags' ? (
                  <div className="flex flex-wrap gap-2 genui-reveal" style={{ animationDelay: `${componentIndex++ * 60}ms` }}>
                    {components.map((component) => (
                      <A2UIRenderer key={component.id} component={component} />
                    ))}
                  </div>
                ) : (
                  <div className="grid grid-cols-12 gap-4">
                    {components.map((component) => {
                      const delay = componentIndex++ * 60;
                      return (
                        <div key={component.id} className={`${getGridSpan(component)} genui-reveal`} style={{ animationDelay: `${delay}ms` }}>
                          <A2UIRenderer component={component} />
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            );
          })}

          {/* Bottom watermark */}
          <div className="genui-divider mt-8" />
          <div className="text-center py-4">
            <span className="genui-label" style={{ color: 'color-mix(in srgb, var(--g-accent) 15%, transparent)', fontSize: '0.6rem' }}>
              Generated by Kuroryuu Playground Engine
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
