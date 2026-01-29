import { cn } from '../../../lib/utils';
import { useSettingsStore } from '../../../stores/settings-store';

export function WorkflowGraphLegend() {
  const { appSettings } = useSettingsStore();
  const { enableAnimations } = appSettings;

  return (
    <div className="absolute bottom-4 left-4 bg-card/90 backdrop-blur-sm border border-border rounded-lg p-4 shadow-xl">
      <h4 className="text-xs font-medium text-muted-foreground uppercase mb-3">
        Status Guide
      </h4>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-primary shadow-[0_0_10px_hsl(var(--primary)/0.6)]" />
          <span className="text-xs text-foreground">Available (click to execute)</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]" />
          <span className="text-xs text-foreground">Completed</span>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full bg-muted-foreground/50" />
          <span className="text-xs text-foreground">Locked (prerequisites needed)</span>
        </div>
        <div className="flex items-center gap-2">
          <div
            className={cn(
              'w-3 h-3 rounded-full bg-primary',
              enableAnimations && 'animate-pulse'
            )}
          />
          <span className="text-xs text-foreground">Recommended next step</span>
        </div>
      </div>
    </div>
  );
}
