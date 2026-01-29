import { cn } from '../../lib/utils';

interface SkeletonProps {
  className?: string;
}

export function Skeleton({ className }: SkeletonProps) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-md bg-secondary",
        className
      )}
    />
  );
}

export function TaskCardSkeleton() {
  return (
    <div className="bg-card border border-border rounded-lg p-3 space-y-2">
      <div className="flex items-center justify-between">
        <Skeleton className="h-3 w-12" />
        <Skeleton className="h-3 w-16" />
      </div>
      <Skeleton className="h-4 w-3/4" />
      <div className="flex gap-1 pt-1">
        <Skeleton className="h-5 w-14 rounded" />
        <Skeleton className="h-5 w-10 rounded" />
      </div>
    </div>
  );
}

export function KanbanColumnSkeleton() {
  return (
    <div className="w-72 flex-shrink-0 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-5 w-20" />
        <Skeleton className="h-4 w-6 rounded-full" />
      </div>
      <div className="space-y-2">
        <TaskCardSkeleton />
        <TaskCardSkeleton />
        <TaskCardSkeleton />
      </div>
    </div>
  );
}

export function KanbanBoardSkeleton() {
  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between px-4 py-3 border-b border-border">
        <Skeleton className="h-4 w-48" />
        <Skeleton className="h-8 w-8 rounded" />
      </div>
      <div className="flex gap-6 p-4 overflow-x-auto flex-1">
        <KanbanColumnSkeleton />
        <KanbanColumnSkeleton />
        <KanbanColumnSkeleton />
      </div>
    </div>
  );
}

export function TerminalSkeleton() {
  return (
    <div className="w-full h-full bg-background rounded-lg p-4 space-y-2">
      <div className="flex items-center gap-2 mb-4">
        <div className="w-3 h-3 rounded-full bg-red-500/50" />
        <div className="w-3 h-3 rounded-full bg-primary/50" />
        <div className="w-3 h-3 rounded-full bg-green-500/50" />
      </div>
      <Skeleton className="h-4 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-4 w-2/3" />
      <Skeleton className="h-4 w-1/4" />
    </div>
  );
}
