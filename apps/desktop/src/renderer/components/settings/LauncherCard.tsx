/**
 * LauncherCard Component
 *
 * A reusable card component for launcher actions in the Settings dialog.
 * Used to provide quick access to other dialogs/features without rebuilding them in Settings.
 */

import { LucideIcon, ChevronRight } from 'lucide-react';

interface StatusBadge {
  type: 'success' | 'info' | 'warning';
  text: string;
}

interface LauncherCardProps {
  icon: LucideIcon;
  title: string;
  description: string;
  status?: StatusBadge;
  actionLabel: string;
  onAction: () => void;
  children?: React.ReactNode;
}

export function LauncherCard({
  icon: Icon,
  title,
  description,
  status,
  actionLabel,
  onAction,
  children,
}: LauncherCardProps) {
  const statusColors = {
    success: 'bg-green-500/20 text-green-400 border-green-500/30',
    info: 'bg-blue-500/20 text-blue-400 border-blue-500/30',
    warning: 'bg-yellow-500/20 text-yellow-400 border-yellow-500/30',
  };

  return (
    <div className="bg-secondary/30 border border-border/50 rounded-lg p-4 hover:border-primary/30 hover:bg-secondary/50 transition-colors">
      {/* Header */}
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2 bg-secondary rounded-lg">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-foreground">{title}</h4>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>

      {/* Status Badge */}
      {status && (
        <div className="mb-3">
          <span
            className={`inline-flex items-center px-2 py-1 text-xs rounded-md border ${
              statusColors[status.type]
            }`}
          >
            {status.text}
          </span>
        </div>
      )}

      {/* Optional inline control (e.g., toggle) */}
      {children && <div className="mb-3">{children}</div>}

      {/* Action Button */}
      <button
        onClick={onAction}
        className="w-full flex items-center justify-between px-3 py-2 text-sm bg-primary/10 text-primary border border-primary/20 rounded-lg hover:bg-primary/20 hover:border-primary/30 transition-colors"
      >
        <span>{actionLabel}</span>
        <ChevronRight className="w-4 h-4" />
      </button>
    </div>
  );
}
