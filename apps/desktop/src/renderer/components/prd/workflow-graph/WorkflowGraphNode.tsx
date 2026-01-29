import { Handle, Position } from '@xyflow/react';
import { Loader2, CheckCircle2, Lock, CheckSquare } from 'lucide-react';
import { cn } from '../../../lib/utils';
import { WorkflowNodeData } from './workflow-graph-data';
import { usePRDStore } from '../../../stores/prd-store';

export function WorkflowGraphNode({ data }: { data: WorkflowNodeData }) {
  const Icon = data.icon;
  const { selectedPrdId, markWorkflowDone } = usePRDStore();

  // Handle Mark Done click
  const handleMarkDone = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent node click
    if (selectedPrdId) {
      markWorkflowDone(selectedPrdId);
    }
  };

  return (
    <div
      data-testid={`workflow-node-${data.workflow}`}
      data-workflow={data.workflow}
      className={cn(
        'relative px-6 py-4 rounded-xl border-2 transition-all duration-300',
        'backdrop-blur-sm',

        // Background based on state
        data.isCompleted && 'bg-green-500/10',
        data.isExecuting && 'bg-orange-500/20',
        data.isAvailable && !data.isExecuting && 'bg-blue-500/10',
        !data.isAvailable && !data.isCompleted && 'bg-gray-500/5 opacity-40',

        // Border glow (using theme-aware CSS variables)
        data.isPrimary && !data.isExecuting && 'border-primary shadow-[0_0_20px_hsl(var(--primary)/0.5)]',
        data.isExecuting && 'border-orange-500 shadow-[0_0_30px_rgba(249,115,22,0.7)]',
        data.isCompleted && 'border-green-500 shadow-[0_0_15px_rgba(34,197,94,0.4)]',
        data.isAvailable &&
          !data.isPrimary &&
          !data.isExecuting &&
          'border-primary/50',
        !data.isAvailable && !data.isCompleted && 'border-muted-foreground/20',

        // Cursor
        data.isAvailable && !data.isExecuting && 'cursor-pointer hover:scale-105',
        !data.isAvailable && 'cursor-not-allowed',

        // Animation (only if enabled in settings)
        data.enableAnimations &&
          data.isPrimary &&
          !data.isExecuting &&
          'animate-pulse-slow',
        data.enableAnimations && data.isExecuting && 'animate-workflow-executing'
      )}
      style={{ width: data.isPrimary ? 240 : 200 }}
    >
      {/* Top Handle */}
      <Handle
        type="target"
        position={Position.Top}
        className="w-3 h-3 bg-blue-500 border-2 border-blue-300"
      />

      {/* Lock icon badge for unavailable nodes */}
      {!data.isAvailable && !data.isCompleted && !data.isExecuting && (
        <div className="absolute -top-2 -right-2 w-5 h-5 rounded-full bg-gray-600 flex items-center justify-center border border-gray-500">
          <Lock className="w-3 h-3 text-gray-300" />
        </div>
      )}

      {/* Spinner badge for executing nodes */}
      {data.isExecuting && (
        <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-orange-500 flex items-center justify-center border-2 border-orange-400">
          <Loader2 className={cn('w-3.5 h-3.5 text-white', data.enableAnimations && 'animate-spin')} />
        </div>
      )}

      {/* Content */}
      <div className="flex items-center gap-3">
        {/* Icon */}
        <div
          className={cn(
            'flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center',
            data.isCompleted && 'bg-green-500/20',
            data.isExecuting && 'bg-orange-500/30',
            data.isAvailable && !data.isExecuting && 'bg-primary/20',
            !data.isAvailable && !data.isCompleted && 'bg-muted/50'
          )}
        >
          {data.isExecuting ? (
            <Loader2
              className={cn(
                'w-5 h-5 text-orange-400',
                data.enableAnimations && 'animate-spin'
              )}
            />
          ) : data.isCompleted ? (
            <CheckCircle2 className="w-5 h-5 text-green-400" />
          ) : (
            <Icon
              className={cn(
                'w-5 h-5',
                data.isAvailable ? 'text-primary' : 'text-muted-foreground'
              )}
            />
          )}
        </div>

        {/* Label & Status */}
        <div className="flex-1 min-w-0">
          <div
            className={cn(
              'font-medium text-sm',
              data.isAvailable ? 'text-white' : 'text-gray-400'
            )}
          >
            {data.label}
          </div>
          {data.statusTransition && (
            <div className="text-xs text-primary/70 mt-0.5">
              {data.statusTransition}
            </div>
          )}
        </div>
      </div>

      {/* Progress Bar (if executing) */}
      {data.isExecuting && data.progress !== undefined && (
        <div className="mt-3 h-1 bg-muted rounded-full overflow-hidden">
          <div
            data-testid="progress-bar"
            className="h-full bg-orange-500 transition-all duration-300"
            style={{ width: `${data.progress}%` }}
          />
        </div>
      )}

      {/* Mark Done Button (if executing) */}
      {data.isExecuting && (
        <button
          onClick={handleMarkDone}
          className="mt-3 w-full py-1.5 rounded-lg text-xs font-medium bg-green-500/20 text-green-400 border border-green-500/30 hover:bg-green-500/30 transition-colors flex items-center justify-center gap-1.5"
        >
          <CheckSquare className="w-3.5 h-3.5" />
          Mark Done
        </button>
      )}

      {/* Bottom Handle */}
      <Handle
        type="source"
        position={Position.Bottom}
        className="w-3 h-3 bg-blue-500 border-2 border-blue-300"
      />

      {/* Glow Effect for Primary */}
      {data.isPrimary && !data.isExecuting && data.enableAnimations && (
        <div className="absolute inset-0 rounded-xl bg-primary/10 blur-xl -z-10 animate-pulse-slow" />
      )}

      {/* Glow Effect for Executing */}
      {data.isExecuting && data.enableAnimations && (
        <div className="absolute inset-0 rounded-xl bg-orange-500/20 blur-xl -z-10 animate-pulse" />
      )}
    </div>
  );
}
