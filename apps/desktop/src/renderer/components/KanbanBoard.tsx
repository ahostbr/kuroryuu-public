import { useEffect, useCallback, useState, useMemo } from 'react';
import {
  DndContext,
  DragOverlay,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragStartEvent
} from '@dnd-kit/core';
import { useTaskStore } from '../stores/task-store';
import { useFileWatch } from '../hooks/use-file-watch';
import { KanbanColumn } from './KanbanColumn';
import { TaskCard } from './TaskCard';
import { KanbanBoardSkeleton } from './ui/loading-skeleton';
import { RefreshCw, FolderOpen, Eye, AlertCircle } from 'lucide-react';
import type { Task, TaskStatus } from '../types/task';
import { useCaptureStore } from '../stores/capture-store';
import { RecordingIndicator } from './capture/RecordingIndicator';

interface KanbanBoardProps {
  todoPath: string;
  onTaskSelect?: (task: Task) => void;
  onNewTaskRequest?: () => void;
}

export function KanbanBoard({ todoPath, onTaskSelect, onNewTaskRequest }: KanbanBoardProps) {
  const { tasks, isLoading, error, setTodoPath, loadTasks, refresh, locks, updateTaskStatus } = useTaskStore();
  const [activeDragTask, setActiveDragTask] = useState<Task | null>(null);
  const isRecording = useCaptureStore((s) => s.isRecording);

  // Setup drag sensors with 8px activation threshold (like Auto-Claude)
  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 8,
      },
    })
  );

  useEffect(() => {
    setTodoPath(todoPath);
    loadTasks();
  }, [todoPath, setTodoPath, loadTasks]);

  // Auto-refresh on file change (service handles skip-after-write)
  const handleFileChange = useCallback(() => {
    refresh();
  }, [refresh]);

  useFileWatch(todoPath, handleFileChange);

  // Drag handlers
  const handleDragStart = (event: DragStartEvent) => {
    const { active } = event;
    const task = tasks.find(t => t.id === active.id);
    if (task) {
      setActiveDragTask(task);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragTask(null);

    if (!over) {
      return;
    }

    const taskId = active.id as string;
    const newStatus = over.id as TaskStatus;

    // Only update if dropped on a column (not another task)
    if (['backlog', 'active', 'delayed', 'done'].includes(newStatus)) {
      const task = tasks.find(t => t.id === taskId);
      if (task && task.status !== newStatus) {
        updateTaskStatus(taskId, newStatus);
      }
    }
  };

  const backlog = tasks.filter(t => t.status === 'backlog');
  const active = tasks.filter(t => t.status === 'active');
  const delayed = tasks.filter(t => t.status === 'delayed');
  const done = tasks.filter(t => t.status === 'done');

  // Show loading skeleton on initial load
  if (isLoading && tasks.length === 0) {
    return <KanbanBoardSkeleton />;
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full gap-4">
        <AlertCircle className="w-12 h-12 text-red-500" />
        <div className="text-center">
          <p className="text-sm text-foreground font-medium">Failed to load tasks</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">{error}</p>
        </div>
        <button
          onClick={refresh}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary text-black rounded text-sm font-medium transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Retry
        </button>
      </div>
    );
  }
  
  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <div className="flex flex-col h-full">
        {/* Enhanced Header with Golden Accents */}
        <div className="relative flex items-center justify-between px-4 py-3.5
                       bg-gradient-to-r from-primary/5 via-background to-primary/5
                       border-b-2 border-primary/30
                       shadow-[0_4px_20px_rgba(201,162,39,0.1)]">

          {/* Path Info */}
          <div className="flex items-center gap-2.5 text-sm">
            <FolderOpen className="w-4 h-4 text-primary/70" />
            <span className="font-mono text-xs text-muted-foreground">{todoPath}</span>
            <span title="Watching for changes"><Eye className="w-3.5 h-3.5 text-green-400 animate-pulse" /></span>
            {isRecording && <RecordingIndicator variant="compact" />}
          </div>

          {/* Actions */}
          <div className="flex items-center gap-3">
            {locks.length > 0 && (
              <span className="text-xs font-semibold text-primary bg-primary/10 px-2.5 py-1 rounded-full
                             border border-primary/20 shadow-[0_0_10px_rgba(201,162,39,0.2)]">
                {locks.length} locked
              </span>
            )}
            <button
              onClick={onNewTaskRequest}
              className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary/90
                       text-primary-foreground rounded-lg text-sm font-semibold
                       transition-all duration-300 hover:shadow-[0_0_20px_rgba(201,162,39,0.4)]
                       hover:scale-105 active:scale-95"
            >
              <div className="text-lg leading-none font-light">+</div>
              New Task
            </button>
            <button
              onClick={refresh}
              disabled={isLoading}
              className="p-2 hover:bg-secondary rounded-lg transition-all duration-300
                       disabled:opacity-50 hover:scale-110 active:scale-95
                       group"
            >
              <RefreshCw className={`w-4 h-4 text-muted-foreground transition-colors
                                    group-hover:text-primary
                                    ${isLoading ? 'animate-spin' : ''}`} />
            </button>
          </div>
        </div>

        {/* Board - Enhanced Spacing & Background */}
        <div className="flex gap-6 p-6 overflow-x-auto flex-1 bg-gradient-to-br from-background via-background to-primary/5">
          <KanbanColumn
            title="Backlog"
            status="backlog"
            tasks={backlog}
            onTaskClick={onTaskSelect}
          />
          <KanbanColumn
            title="Active"
            status="active"
            tasks={active}
            onTaskClick={onTaskSelect}
          />
          <KanbanColumn
            title="Done"
            status="done"
            tasks={done}
            onTaskClick={onTaskSelect}
          />
          <KanbanColumn
            title="Delayed"
            status="delayed"
            tasks={delayed}
            onTaskClick={onTaskSelect}
          />
        </div>
      </div>

      {/* Drag overlay - shows what's being dragged */}
      <DragOverlay>
        {activeDragTask && (
          <div className="opacity-80">
            <TaskCard task={activeDragTask} />
          </div>
        )}
      </DragOverlay>
    </DndContext>
  );
}
