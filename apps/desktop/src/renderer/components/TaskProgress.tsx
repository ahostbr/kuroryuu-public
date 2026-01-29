import { cn } from '../lib/utils'

interface TaskProgressProps {
  progress: number
  status?: 'idle' | 'running' | 'paused' | 'done' | 'failed'
  showPercentage?: boolean
  size?: 'sm' | 'md' | 'lg'
}

export function TaskProgress({
  progress,
  status = 'running',
  showPercentage = true,
  size = 'md',
}: TaskProgressProps) {
  const clampedProgress = Math.min(Math.max(progress, 0), 100)

  const sizeClasses = {
    sm: 'h-1.5',
    md: 'h-2',
    lg: 'h-3',
  }

  const statusColors = {
    idle: 'bg-muted',
    running: 'bg-blue-500',
    paused: 'bg-primary',
    done: 'bg-green-500',
    failed: 'bg-red-500',
  }

  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <div
          className={cn(
            'w-full rounded-full bg-secondary overflow-hidden',
            sizeClasses[size]
          )}
        >
          <div
            className={cn(
              'h-full rounded-full transition-all duration-300',
              statusColors[status],
              status === 'running' && 'animate-pulse'
            )}
            style={{ width: `${clampedProgress}%` }}
          />
        </div>
      </div>
      {showPercentage && (
        <span className="text-xs text-muted-foreground font-mono w-8 text-right">
          {Math.round(clampedProgress)}%
        </span>
      )}
    </div>
  )
}
