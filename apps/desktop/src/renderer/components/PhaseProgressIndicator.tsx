import { cn } from '../lib/utils'
import { CheckCircle2, Circle, Clock, AlertCircle } from 'lucide-react'

interface Phase {
  name: string
  status: 'pending' | 'active' | 'complete' | 'error'
}

interface PhaseProgressIndicatorProps {
  phases: Phase[]
  currentPhase?: string
  size?: 'sm' | 'md' | 'lg'
}

export function PhaseProgressIndicator({
  phases,
  currentPhase,
  size = 'md',
}: PhaseProgressIndicatorProps) {
  const sizeClasses = {
    sm: {
      icon: 'w-4 h-4',
      text: 'text-xs',
      gap: 'gap-1',
      line: 'h-1',
    },
    md: {
      icon: 'w-5 h-5',
      text: 'text-sm',
      gap: 'gap-2',
      line: 'h-1.5',
    },
    lg: {
      icon: 'w-6 h-6',
      text: 'text-base',
      gap: 'gap-3',
      line: 'h-2',
    },
  }

  const classes = sizeClasses[size]

  return (
    <div className="flex items-center justify-between w-full">
      {phases.map((phase, idx) => (
        <div key={idx} className="flex items-center flex-1">
          {/* Phase item */}
          <div className="flex flex-col items-center">
            <div className={cn('relative', classes.gap)}>
              {phase.status === 'complete' ? (
                <CheckCircle2
                  className={cn(
                    classes.icon,
                    'text-green-500 flex-shrink-0'
                  )}
                />
              ) : phase.status === 'active' ? (
                <Clock
                  className={cn(
                    classes.icon,
                    'text-blue-500 flex-shrink-0 animate-spin'
                  )}
                />
              ) : phase.status === 'error' ? (
                <AlertCircle
                  className={cn(
                    classes.icon,
                    'text-red-500 flex-shrink-0'
                  )}
                />
              ) : (
                <Circle
                  className={cn(
                    classes.icon,
                    'text-muted-foreground flex-shrink-0'
                  )}
                />
              )}
            </div>
            <span
              className={cn(
                classes.text,
                'mt-1 text-center font-medium',
                phase.status === 'complete' && 'text-green-400',
                phase.status === 'active' && 'text-blue-400',
                phase.status === 'error' && 'text-red-400',
                phase.status === 'pending' && 'text-muted-foreground'
              )}
            >
              {phase.name}
            </span>
          </div>

          {/* Connector line */}
          {idx < phases.length - 1 && (
            <div
              className={cn(
                classes.line,
                'flex-1 mx-2 bg-gradient-to-r',
                phases[idx].status === 'complete'
                  ? 'from-green-500 to-gray-400'
                  : 'from-gray-400 to-gray-600'
              )}
            />
          )}
        </div>
      ))}
    </div>
  )
}
