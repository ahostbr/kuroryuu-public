import { useDraggable } from '@dnd-kit/core';
import { CSS } from '@dnd-kit/utilities';
import type { Task, TaskCategory, TaskPhase } from '../types/task';
import { useTaskStore } from '../stores/task-store';
import {
  User, Tag, Lock, GripVertical,
  Target, Bug, Wrench, FileCode, Shield, Gauge, Palette,
  Clock, PlayCircle, StopCircle
} from 'lucide-react';
import React from 'react';

// Simple time ago formatting
function formatTimeAgo(dateString: string): string {
  const date = new Date(dateString);
  const now = new Date();
  const seconds = Math.floor((now.getTime() - date.getTime()) / 1000);

  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  const weeks = Math.floor(days / 7);
  if (weeks < 4) return `${weeks}w ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  const years = Math.floor(days / 365);
  return `${years}y ago`;
}

interface TaskCardProps {
  task: Task;
  onClick?: () => void;
}

const CategoryIcon = ({ category }: { category?: TaskCategory }) => {
  switch (category) {
    case 'feature': return <Target className="w-3 h-3 text-purple-400" />;
    case 'bug_fix': return <Bug className="w-3 h-3 text-red-400" />;
    case 'refactoring': return <Wrench className="w-3 h-3 text-orange-400" />;
    case 'documentation': return <FileCode className="w-3 h-3 text-blue-400" />;
    case 'security': return <Shield className="w-3 h-3 text-green-400" />;
    case 'performance': return <Gauge className="w-3 h-3 text-primary" />;
    case 'ui_ux': return <Palette className="w-3 h-3 text-pink-400" />;
    default: return <Tag className="w-3 h-3 text-muted-foreground" />;
  }
};


const ComplexityBadge = ({ complexity }: { complexity?: 'sm' | 'md' | 'lg' }) => {
  if (!complexity) return null;
  const colors = {
    sm: 'bg-green-500/10 text-green-500 border-green-500/20',
    md: 'bg-primary/10 text-primary border-primary/20',
    lg: 'bg-red-500/10 text-red-500 border-red-500/20'
  };
  return (
    <span className={`text-[10px] uppercase font-bold px-1.5 py-0.5 rounded border ${colors[complexity]}`}>
      {complexity}
    </span>
  );
};

const PriorityBadge = ({ priority }: { priority?: 'low' | 'medium' | 'high' }) => {
  if (!priority) return null;
  const colors = {
    low: 'text-muted-foreground bg-secondary',
    medium: 'text-blue-400 bg-blue-400/10',
    high: 'text-red-400 bg-red-400/10'
  };
  return (
    <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${colors[priority]}`}>
      {priority}
    </span>
  );
};

const PhaseProgress = ({ phase }: { phase?: TaskPhase }) => {
  const steps = ['idle', 'planning', 'coding', 'qa_review', 'qa_fixing', 'complete'];
  const currentIdx = steps.indexOf(phase || 'idle');
  
  return (
    <div className="flex items-center gap-0.5 mt-3 w-full">
      {steps.slice(1).map((step, idx) => { // Skip 'idle' in visualization if we want 5 bars, or include all
         const isActive = (idx + 1) <= currentIdx;
         const isCurrent = (idx + 1) === currentIdx;
         return (
           <div 
             key={step} 
             className={`h-1 flex-1 rounded-full transition-all duration-300 ${
               isActive 
                 ? isCurrent ? 'bg-primary shadow-[0_0_8px_rgba(250,204,21,0.5)]' : 'bg-primary/50' 
                 : 'bg-secondary'
             }`}
             title={step}
           />
         );
      })}
    </div>
  );
};

// Base TaskCard component (used in DragOverlay too)
export function TaskCard({ task, onClick }: TaskCardProps) {
  const { isLocked, getLockedBy, updateTaskStatus } = useTaskStore();
  const locked = isLocked(task.id);
  const lockedBy = getLockedBy(task.id);

  // Format UpdatedAt if available
  const timeAgo = task.updatedAt ? formatTimeAgo(task.updatedAt) : '';

  const handlePlayClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (task.status === 'active') {
      updateTaskStatus(task.id, 'backlog');
    } else {
      updateTaskStatus(task.id, 'active');
    }
  };

  return (
    <div
      onClick={onClick}
      className={`group relative bg-card/90 backdrop-blur-sm border rounded-xl p-3.5 cursor-pointer
                 transition-all duration-300 ease-out
                 hover:bg-card hover:-translate-y-0.5
                 hover:shadow-[0_8px_30px_rgba(0,0,0,0.3),0_0_20px_rgba(201,162,39,0.15)]
                 ${locked
                   ? 'border-primary/60 opacity-80 shadow-[0_0_15px_rgba(201,162,39,0.2)]'
                   : 'border-border/50 hover:border-primary/50'
                 }
                 before:absolute before:inset-0 before:rounded-xl before:opacity-0
                 before:bg-gradient-to-br before:from-primary/5 before:via-transparent before:to-transparent
                 before:transition-opacity before:duration-300
                 hover:before:opacity-100`}
    >
      {/* Header: ID, Category, Lock, Actions */}
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <span className="text-[10px] font-mono font-bold text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
            {task.id}
          </span>
          <CategoryIcon category={task.category} />
        </div>
        
        <div className="flex items-center gap-2">
           {locked && (
             <span className="flex items-center gap-1 text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded" title={`Locked by ${lockedBy}`}>
               <Lock className="w-3 h-3" />
               <span className="max-w-[60px] truncate">{lockedBy}</span>
             </span>
           )}
           {/* Hover Actions */}
           <div className="opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 -mr-1">
              <button
                className={`p-1 hover:bg-muted rounded text-muted-foreground ${
                  task.status === 'active' ? 'hover:text-amber-400' : 'hover:text-green-400'
                }`}
                onClick={handlePlayClick}
                title={task.status === 'active' ? 'Stop Task' : 'Start Task'}
              >
                {task.status === 'active' ? (
                  <StopCircle className="w-4 h-4" />
                ) : (
                  <PlayCircle className="w-4 h-4" />
                )}
              </button>
           </div>
        </div>
      </div>
      
      {/* Title */}
      <h4 className="text-sm font-medium text-foreground leading-snug group-hover:text-yellow-100 transition-colors mb-2">
        {task.title}
      </h4>
      
      {/* Tags & Badges Row */}
      <div className="flex flex-wrap items-center gap-2 mb-2">
         {task.complexity && <ComplexityBadge complexity={task.complexity} />}
         {task.priority && <PriorityBadge priority={task.priority} />}
         
         {task.tags?.slice(0, 2).map(tag => ( // Limit tags shown
            <span key={tag} className="text-[10px] text-muted-foreground bg-secondary/50 px-1.5 py-0.5 rounded">
               #{tag}
            </span>
         ))}
      </div>

      {/* Footer: Assignee, Phase, Time */}
      <div className="flex flex-col gap-2 pt-2 border-t border-border/50 mt-1">
         <div className="flex items-center justify-between text-xs text-muted-foreground">
            <div className="flex items-center gap-1.5">
               {task.assignee ? (
                 <div className="flex items-center gap-1 px-1.5 py-0.5 bg-blue-500/10 text-blue-400 rounded-full">
                   <User className="w-3 h-3" />
                   <span>{task.assignee}</span>
                 </div>
               ) : (
                 <span className="text-muted-foreground">Unassigned</span>
               )}
            </div>
            {timeAgo && (
              <div className="flex items-center gap-1 opacity-60">
                <Clock className="w-3 h-3" />
                <span>{timeAgo}</span>
              </div>
            )}
         </div>
         
         <PhaseProgress phase={task.phase} />
      </div>
    </div>
  );
}

// Draggable wrapper for TaskCard (used in KanbanColumn)
export function DraggableTaskCard({ task, onClick }: TaskCardProps) {
  const { attributes, listeners, setNodeRef, transform, isDragging } = useDraggable({
    id: task.id,
  });

  const style = transform ? {
    transform: CSS.Translate.toString(transform),
  } : undefined;

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`relative transition-all duration-200 ${
        isDragging
          ? 'opacity-40 scale-95 rotate-2 z-50'
          : 'z-0'
      }`}
    >
      <div
        {...listeners}
        {...attributes}
        className="group/drag relative"
      >
        <TaskCard task={task} onClick={onClick} />

        {/* Drag Handle Indicator - Appears on hover */}
        <div className={`absolute -left-3 top-1/2 -translate-y-1/2 p-1 rounded
                        transition-all duration-300 cursor-grab active:cursor-grabbing
                        ${isDragging
                          ? 'opacity-0'
                          : 'opacity-0 group-hover/drag:opacity-70 hover:!opacity-100'
                        }
                        text-muted-foreground hover:text-primary
                        hover:bg-secondary/50 hover:scale-110`}>
          <GripVertical className="w-3.5 h-3.5" />
        </div>

        {/* Golden glow trail during drag (only visible when dragging starts) */}
        {isDragging && (
          <div className="absolute inset-0 rounded-xl pointer-events-none
                         shadow-[0_0_40px_rgba(201,162,39,0.4)]
                         animate-pulse" />
        )}
      </div>
    </div>
  );
}
