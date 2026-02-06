/**
 * KeyTakeaways Component — Imperial insight list
 * Gold-accented insight cards with category badges.
 */
import React from 'react';

export interface TakeawayItem {
  text: string;
  category?: 'insights' | 'learnings' | 'conclusions' | 'recommendations';
}

export interface KeyTakeawaysProps {
  items: (string | TakeawayItem)[];
  title?: string;
}

export function KeyTakeaways({ items, title = 'Key Takeaways' }: KeyTakeawaysProps): React.ReactElement {
  const getCategoryStyle = (category?: string) => {
    switch (category) {
      case 'insights': return { bg: 'rgba(59,130,246,0.1)', color: 'rgba(96,165,250,0.8)', border: 'rgba(59,130,246,0.2)' };
      case 'learnings': return { bg: 'rgba(34,197,94,0.1)', color: 'rgba(74,222,128,0.8)', border: 'rgba(34,197,94,0.2)' };
      case 'conclusions': return { bg: 'rgba(139,38,53,0.15)', color: 'rgba(231,76,94,0.8)', border: 'rgba(139,38,53,0.3)' };
      case 'recommendations': return { bg: 'rgba(201,169,98,0.1)', color: 'rgba(201,169,98,0.8)', border: 'rgba(201,169,98,0.2)' };
      default: return null;
    }
  };

  return (
    <div className="genui-card genui-accent-left rounded-md overflow-hidden">
      {/* Header */}
      <div className="px-5 py-3" style={{ borderBottom: '1px solid rgba(201,169,98,0.08)' }}>
        <h3
          className="text-sm font-semibold tracking-wide"
          style={{ color: 'rgba(201,169,98,0.75)' }}
        >
          {title}
        </h3>
      </div>

      {/* Items */}
      <div className="px-5 py-4 space-y-3">
        {(items || []).map((item, idx) => {
          const isString = typeof item === 'string';
          const text = isString ? item : item.text;
          const category = isString ? undefined : item.category;
          const catStyle = getCategoryStyle(category);

          return (
            <div key={idx} className="flex items-start gap-3">
              <span
                className="mt-1 shrink-0"
                style={{
                  color: 'rgba(201,169,98,0.5)',
                  fontSize: '0.6rem',
                  fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                }}
              >
                {'\u2713'}
              </span>
              <div className="flex-1 flex items-start gap-2 flex-wrap">
                <span className="text-sm leading-relaxed" style={{ color: 'rgba(250,250,250,0.85)' }}>
                  {text}
                </span>
                {catStyle && (
                  <span
                    className="text-xs px-1.5 py-0.5 rounded"
                    style={{
                      background: catStyle.bg,
                      color: catStyle.color,
                      border: `1px solid ${catStyle.border}`,
                      fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                      fontSize: '0.6rem',
                      letterSpacing: '0.05em',
                      textTransform: 'uppercase',
                    }}
                  >
                    {category}
                  </span>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default KeyTakeaways;
