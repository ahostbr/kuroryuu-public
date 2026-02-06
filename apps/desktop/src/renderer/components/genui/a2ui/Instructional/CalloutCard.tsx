/**
 * CalloutCard Component — Imperial callout display
 * Type-specific styling with dramatic accent borders.
 */
import React from 'react';

export interface CalloutCardProps {
  type: 'tip' | 'warning' | 'info' | 'danger' | 'success' | 'error' | 'note' | string;
  title: string;
  content: string;
  icon?: string;
}

const TYPE_STYLES: Record<string, { border: string; iconBg: string; titleColor: string; icon: string }> = {
  tip:     { border: 'rgba(201,169,98,0.4)', iconBg: 'rgba(201,169,98,0.1)', titleColor: 'rgba(201,169,98,0.85)', icon: '\u25C8' },
  warning: { border: 'rgba(245,158,11,0.4)', iconBg: 'rgba(245,158,11,0.1)', titleColor: 'rgba(251,191,36,0.85)', icon: '\u25B3' },
  info:    { border: 'rgba(59,130,246,0.4)',  iconBg: 'rgba(59,130,246,0.1)',  titleColor: 'rgba(96,165,250,0.85)',  icon: '\u25CF' },
  danger:  { border: 'rgba(139,38,53,0.5)',   iconBg: 'rgba(139,38,53,0.15)', titleColor: 'rgba(231,76,94,0.85)',  icon: '\u2716' },
  success: { border: 'rgba(34,197,94,0.4)',   iconBg: 'rgba(34,197,94,0.1)',  titleColor: 'rgba(74,222,128,0.85)', icon: '\u2713' },
  error:   { border: 'rgba(139,38,53,0.5)',   iconBg: 'rgba(139,38,53,0.15)', titleColor: 'rgba(231,76,94,0.85)',  icon: '\u2716' },
  note:    { border: 'rgba(122,117,109,0.3)', iconBg: 'rgba(122,117,109,0.08)', titleColor: 'rgba(168,168,179,0.85)', icon: '\u25A0' },
};

export function CalloutCard({ type, title, content, icon }: CalloutCardProps): React.ReactElement {
  const style = TYPE_STYLES[type] || TYPE_STYLES.info;
  const displayIcon = icon || style.icon;

  return (
    <div
      className="genui-card rounded-md overflow-hidden"
      style={{ borderLeft: `3px solid ${style.border}` }}
    >
      <div className="px-5 py-4">
        <div className="flex items-start gap-3">
          <div
            className="flex items-center justify-center w-7 h-7 rounded shrink-0"
            style={{ background: style.iconBg }}
          >
            <span style={{ color: style.titleColor, fontSize: '0.8rem' }}>{displayIcon}</span>
          </div>
          <div className="flex-1 space-y-1.5">
            <div
              className="text-sm font-semibold tracking-wide"
              style={{ color: style.titleColor }}
            >
              {title}
            </div>
            <p className="text-sm leading-relaxed" style={{ color: 'rgba(250,250,250,0.75)' }}>
              {content}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default CalloutCard;
