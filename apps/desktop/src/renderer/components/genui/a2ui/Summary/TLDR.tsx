/**
 * TLDR Component — Imperial hero summary
 * Full-width dramatic summary with crimson-gold gradient accent.
 */
import React from 'react';

export interface TLDRProps {
  content?: string;
  summary?: string;
  key_points?: string[];
  icon?: string;
  max_length?: number;
}

export function TLDR({ content, summary, key_points, icon }: TLDRProps): React.ReactElement {
  const displayText = content || summary || '';

  return (
    <div className="genui-hero rounded-md overflow-hidden">
      {/* Header strip */}
      <div className="flex items-center gap-3 px-5 py-3" style={{ borderBottom: '1px solid color-mix(in srgb, var(--g-accent) 10%, transparent)' }}>
        <span
          className="px-2.5 py-1 rounded text-xs font-bold tracking-widest uppercase"
          style={{
            fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
            background: 'color-mix(in srgb, var(--g-crimson) 20%, transparent)',
            color: 'color-mix(in srgb, var(--g-accent) 80%, transparent)',
            border: '1px solid color-mix(in srgb, var(--g-accent) 20%, transparent)',
            textShadow: '0 0 10px color-mix(in srgb, var(--g-accent) 20%, transparent)',
          }}
        >
          TL;DR
        </span>
      </div>

      {/* Content */}
      <div className="px-5 py-4 space-y-3">
        <p className="text-sm leading-relaxed" style={{ color: 'var(--foreground)', opacity: 0.9 }}>
          {displayText}
        </p>

        {key_points && key_points.length > 0 && (
          <ul className="space-y-2 mt-3 pl-1">
            {key_points.map((point: string, idx: number) => (
              <li key={idx} className="flex items-start gap-2.5 text-sm">
                <span className="genui-check mt-0.5">{'\u25C8'}</span>
                <span style={{ color: 'color-mix(in srgb, var(--g-fg) 75%, transparent)' }}>{point}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default TLDR;
