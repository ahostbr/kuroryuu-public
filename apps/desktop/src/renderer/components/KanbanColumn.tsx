import { useDroppable } from '@dnd-kit/core';
import type { Task, TaskStatus } from '../types/task';
import { DraggableTaskCard } from './TaskCard';
import { Circle, Zap, Clock, CheckCircle2, Pause } from 'lucide-react';

interface KanbanColumnProps {
  title: string;
  status: TaskStatus;
  tasks: Task[];
  onTaskClick?: (task: Task) => void;
}

const statusConfig: Record<TaskStatus, {
  color: string;
  gradient: string;
  icon: React.ReactNode;
  glowColor: string;
  pulseColor: string;
}> = {
  backlog: {
    color: 'text-muted-foreground',
    gradient: 'from-muted/20 to-transparent',
    icon: <Circle className="w-4 h-4" />,
    glowColor: 'rgba(161, 161, 170, 0.2)',
    pulseColor: 'bg-muted-foreground'
  },
  active: {
    color: 'text-primary',
    gradient: 'from-primary/20 to-transparent',
    icon: <Zap className="w-4 h-4" />,
    glowColor: 'rgba(201, 162, 39, 0.3)',
    pulseColor: 'bg-primary'
  },
  delayed: {
    color: 'text-orange-400',
    gradient: 'from-orange-400/20 to-transparent',
    icon: <Pause className="w-4 h-4" />,
    glowColor: 'rgba(251, 146, 60, 0.2)',
    pulseColor: 'bg-orange-400'
  },
  done: {
    color: 'text-green-400',
    gradient: 'from-green-400/20 to-transparent',
    icon: <CheckCircle2 className="w-4 h-4" />,
    glowColor: 'rgba(74, 222, 128, 0.2)',
    pulseColor: 'bg-green-400'
  }
};

export function KanbanColumn({ title, status, tasks, onTaskClick }: KanbanColumnProps) {
  const { setNodeRef, isOver } = useDroppable({
    id: status,
  });

  const config = statusConfig[status];

  return (
    <div className="flex flex-col min-w-[300px] group">
      {/* Enhanced Column Header */}
      <div className={`relative flex items-center gap-3 pb-4 mb-3 transition-all duration-300
                      before:absolute before:bottom-0 before:left-0 before:right-0 before:h-[2px]
                      before:bg-gradient-to-r before:${config.gradient}
                      before:transition-all before:duration-300
                      group-hover:before:h-[3px]`}>

        {/* Status Icon with Pulse */}
        <div className="relative">
          <div className={`${config.color} transition-transform duration-300 group-hover:scale-110`}>
            {config.icon}
          </div>
          {status === 'active' && (
            <span className={`absolute -top-0.5 -right-0.5 w-2 h-2 ${config.pulseColor} rounded-full animate-pulse`} />
          )}
        </div>

        {/* Title */}
        <h3 className={`text-sm font-bold uppercase tracking-wider ${config.color}
                       transition-all duration-300 group-hover:tracking-widest`}>
          {title}
        </h3>

        {/* Count Badge */}
        <span className={`ml-auto text-xs font-semibold ${config.color} bg-secondary/50
                        px-2.5 py-1 rounded-full border border-current/20
                        transition-all duration-300 group-hover:scale-110 group-hover:shadow-[0_0_12px_currentColor]`}>
          {tasks.length}
        </span>
      </div>

      {/* Drop Zone */}
      <div
        ref={setNodeRef}
        className={`relative flex flex-col gap-2.5 overflow-y-auto flex-1 min-h-[200px]
                   rounded-xl p-2 transition-all duration-300
                   ${isOver
                     ? 'bg-gradient-to-b from-primary/10 via-primary/5 to-transparent ring-2 ring-primary/60 shadow-[0_0_20px_rgba(201,162,39,0.3)]'
                     : 'bg-transparent'
                   }`}
      >
        {tasks.map((task, index) => (
          <div
            key={task.id}
            style={{
              animationDelay: `${index * 50}ms`,
              animationFillMode: 'backwards'
            }}
            className="animate-fade-in"
          >
            <DraggableTaskCard
              task={task}
              onClick={() => onTaskClick?.(task)}
            />
          </div>
        ))}

        {/* Empty State */}
        {tasks.length === 0 && (
          <div className={`flex flex-col items-center justify-center flex-1 py-12
                          text-sm transition-all duration-300 rounded-lg
                          ${isOver
                            ? `${config.color} bg-gradient-to-b from-current/10 to-transparent`
                            : 'text-muted-foreground/50'
                          }`}>
            <Clock className={`w-8 h-8 mb-3 transition-all duration-300 ${isOver ? 'scale-110 animate-pulse' : 'opacity-30'}`} />
            <span className="font-medium">
              {isOver ? 'Drop task here' : 'No tasks yet'}
            </span>
          </div>
        )}

        {/* Drop Zone Glow Effect (only visible when dragging over) */}
        {isOver && (
          <div
            className="absolute inset-0 rounded-xl pointer-events-none"
            style={{
              background: `radial-gradient(circle at center, ${config.glowColor} 0%, transparent 70%)`,
              animation: 'pulse 2s ease-in-out infinite'
            }}
          />
        )}
      </div>
    </div>
  );
}
