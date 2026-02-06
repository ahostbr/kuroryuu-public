/**
 * CalloutCard Component
 * Displays informational callouts with type-specific styling and colors.
 */
import React from 'react';
import { Card, CardContent } from '../../../ui/card';

export interface CalloutCardProps {
  type: 'tip' | 'warning' | 'info' | 'danger' | 'success' | 'error' | 'note' | string;
  title: string;
  content: string;
  icon?: string;
}

export function CalloutCard({ type, title, content, icon }: CalloutCardProps): React.ReactElement {
  const typeConfig: Record<string, { borderColor: string; icon: string; iconBg: string; titleColor: string }> = {
    tip: { borderColor: 'border-l-4 border-l-primary', icon: '\uD83D\uDCA1', iconBg: 'bg-primary/20', titleColor: 'text-primary' },
    warning: { borderColor: 'border-l-4 border-l-yellow-500', icon: '\u26A0\uFE0F', iconBg: 'bg-yellow-500/20', titleColor: 'text-yellow-400' },
    info: { borderColor: 'border-l-4 border-l-blue-400', icon: '\u2139\uFE0F', iconBg: 'bg-blue-400/20', titleColor: 'text-blue-400' },
    danger: { borderColor: 'border-l-4 border-l-red-500', icon: '\uD83D\uDEA8', iconBg: 'bg-red-500/20', titleColor: 'text-red-400' },
    success: { borderColor: 'border-l-4 border-l-emerald-500', icon: '\u2705', iconBg: 'bg-emerald-500/20', titleColor: 'text-emerald-400' },
    error: { borderColor: 'border-l-4 border-l-red-500', icon: '\uD83D\uDEA8', iconBg: 'bg-red-500/20', titleColor: 'text-red-400' },
    note: { borderColor: 'border-l-4 border-l-muted-foreground', icon: '\uD83D\uDCDD', iconBg: 'bg-muted', titleColor: 'text-muted-foreground' },
  };

  const config = typeConfig[type] || typeConfig.info;
  const displayIcon = icon || config.icon;

  return (
    <Card className={`bg-card ${config.borderColor} border-border`}>
      <CardContent className="pt-6">
        <div className="flex items-start gap-3">
          <div className={`flex items-center justify-center w-8 h-8 rounded-full ${config.iconBg} shrink-0`}>
            <span className="text-lg">{displayIcon}</span>
          </div>
          <div className="flex-1 space-y-1">
            <div className={`font-semibold ${config.titleColor}`}>{title}</div>
            <p className="text-sm text-foreground/80">{content}</p>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default CalloutCard;
