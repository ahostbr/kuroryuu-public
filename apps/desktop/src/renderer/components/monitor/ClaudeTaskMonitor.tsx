/**
 * Claude Task Monitor
 *
 * Real-time visualization of tasks from ai/todo.md (T### format).
 * Parses all sections (Backlog, Active, Done) for task entries.
 *
 * Features:
 * - Progress donut chart (pending, in-progress, completed)
 * - Gantt timeline (elapsed time per task)
 * - Task list with status badges and worklog links
 * - File watcher for real-time updates (2s polling fallback)
 */
import { useEffect, useState, useMemo, useCallback } from 'react';
import {
  Activity,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  RefreshCw,
  Settings,
  Sparkles,
} from 'lucide-react';
import { useClaudeTaskStore, getDisplayTasks, type ClaudeTask } from '../../stores/claude-task-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useFileWatch } from '../../hooks/use-file-watch';

// ============================================================================
// Progress Donut Chart - SVG-based with 3 segments
// ============================================================================
interface DonutChartProps {
  completed: number;
  inProgress: number;
  pending: number;
  size?: number;
}

function DonutChart({ completed, inProgress, pending, size = 160 }: DonutChartProps) {
  const total = completed + inProgress + pending;
  const completedPct = total > 0 ? (completed / total) * 100 : 0;
  const inProgressPct = total > 0 ? (inProgress / total) * 100 : 0;
  const radius = 60;
  const strokeWidth = 16;
  const circumference = 2 * Math.PI * radius;

  // Calculate offsets for stacked segments
  const completedOffset = circumference - (completedPct / 100) * circumference;
  const inProgressOffset = circumference - ((completedPct + inProgressPct) / 100) * circumference;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox="0 0 160 160" className="transform -rotate-90">
        {/* Background circle (pending) */}
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          className="text-secondary/50"
        />
        {/* In Progress arc (amber) - drawn first so completed overlaps */}
        {inProgress > 0 && (
          <circle
            cx="80"
            cy="80"
            r={radius}
            fill="none"
            stroke="currentColor"
            strokeWidth={strokeWidth}
            strokeDasharray={circumference}
            strokeDashoffset={inProgressOffset}
            strokeLinecap="round"
            className="text-amber-500 transition-all duration-500 ease-out"
          />
        )}
        {/* Completed arc (green) */}
        <circle
          cx="80"
          cy="80"
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeDasharray={circumference}
          strokeDashoffset={completedOffset}
          strokeLinecap="round"
          className="text-emerald-500 transition-all duration-500 ease-out"
        />
      </svg>
      {/* Center text */}
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-3xl font-bold text-foreground">
          {Math.round(completedPct)}%
        </span>
        <span className="text-xs text-muted-foreground">Complete</span>
      </div>
    </div>
  );
}

// ============================================================================
// Gantt Timeline Bar
// ============================================================================
interface GanttBarProps {
  task: ClaudeTask;
  maxElapsed: number;
}

function GanttBar({ task, maxElapsed }: GanttBarProps) {
  const now = new Date();
  const startTime = task.createdAt || now;
  const endTime = task.completedAt || now;
  const elapsed = endTime.getTime() - startTime.getTime();
  const elapsedMinutes = Math.floor(elapsed / 60000);
  const widthPct = maxElapsed > 0 ? Math.min((elapsed / maxElapsed) * 100, 100) : 0;

  const isCompleted = task.status === 'completed';
  const isInProgress = task.status === 'in_progress';
  const barColor = isCompleted ? 'bg-emerald-500' : isInProgress ? 'bg-amber-500' : 'bg-zinc-500';

  return (
    <div className="group flex items-center gap-3 py-2 hover:bg-secondary/30 rounded-lg px-2 transition-colors">
      {/* Task ID */}
      <span className="w-14 text-xs font-mono text-muted-foreground shrink-0">
        {task.id}
      </span>

      {/* Bar container */}
      <div className="flex-1 h-6 bg-secondary/50 rounded overflow-hidden relative">
        {/* Elapsed bar */}
        <div
          className={`h-full ${barColor} transition-all duration-300 ease-out`}
          style={{ width: `${widthPct}%` }}
        />
        {/* Elapsed time label */}
        <span className="absolute inset-0 flex items-center justify-center text-xs font-medium text-foreground/80">
          {elapsedMinutes < 60
            ? `${elapsedMinutes}m`
            : `${Math.floor(elapsedMinutes / 60)}h ${elapsedMinutes % 60}m`}
        </span>
      </div>

      {/* Status icon */}
      {isCompleted ? (
        <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
      ) : isInProgress ? (
        <Clock className="w-4 h-4 text-amber-500 animate-pulse shrink-0" />
      ) : (
        <div className="w-4 h-4 rounded-full border-2 border-zinc-500 shrink-0" />
      )}
    </div>
  );
}

// ============================================================================
// Task List Row
// ============================================================================
interface TaskRowProps {
  task: ClaudeTask;
}

function TaskRow({ task }: TaskRowProps) {
  const isCompleted = task.status === 'completed';
  const isInProgress = task.status === 'in_progress';

  const statusColor = isCompleted ? 'text-emerald-500' : isInProgress ? 'text-amber-500' : 'text-muted-foreground';

  return (
    <div className="flex items-start gap-3 py-3 px-4 hover:bg-secondary/30 rounded-lg transition-colors border-b border-border/30 last:border-0">
      {/* Status badge */}
      <div className={`mt-0.5 shrink-0 ${statusColor}`}>
        {isCompleted ? (
          <CheckCircle2 className="w-5 h-5" />
        ) : isInProgress ? (
          <Clock className="w-5 h-5 animate-pulse" />
        ) : (
          <div className="w-5 h-5 rounded-full border-2 border-current" />
        )}
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-mono text-sm text-muted-foreground">{task.id}</span>
          {task.worklog && task.worklog !== 'pending' && (
            <button
              onClick={() => {
                // Open worklog file
                window.electronAPI.shell.openPath(task.worklog!);
              }}
              className="flex items-center gap-1 text-xs text-blue-400 hover:text-blue-300 transition-colors"
              title={task.worklog}
            >
              <FileText className="w-3 h-3" />
              worklog
            </button>
          )}
        </div>
        <p className={`text-sm mt-1 ${isCompleted ? 'text-muted-foreground line-through' : 'text-foreground'}`}>
          {task.description}
        </p>
        {task.createdAt && (
          <p className="text-xs text-muted-foreground mt-1">
            Created: {task.createdAt.toLocaleString()}
            {task.completedAt && (
              <span className="ml-3">Completed: {task.completedAt.toLocaleString()}</span>
            )}
          </p>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Stats Card
// ============================================================================
interface StatCardProps {
  label: string;
  value: number | string;
  icon: React.ReactNode;
  color?: string;
}

function StatCard({ label, value, icon, color = 'text-muted-foreground' }: StatCardProps) {
  return (
    <div className="flex items-center gap-3 p-4 bg-secondary/30 rounded-xl border border-border/50">
      <div className={`p-2 rounded-lg bg-secondary ${color}`}>
        {icon}
      </div>
      <div>
        <p className="text-2xl font-bold text-foreground">{value}</p>
        <p className="text-xs text-muted-foreground">{label}</p>
      </div>
    </div>
  );
}

// ============================================================================
// Settings Panel
// ============================================================================
interface SettingsPanelProps {
  displayLimit: number;
  onLimitChange: (limit: number) => void;
  onClose: () => void;
}

function SettingsPanel({ displayLimit, onLimitChange, onClose }: SettingsPanelProps) {
  return (
    <div className="absolute top-12 right-4 z-10 w-64 p-4 bg-background border border-border rounded-xl shadow-xl">
      <div className="flex items-center justify-between mb-4">
        <span className="text-sm font-medium">Display Settings</span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <Settings className="w-4 h-4" />
        </button>
      </div>
      <label className="block text-xs text-muted-foreground mb-2">
        Task limit (0 = all)
      </label>
      <input
        type="number"
        min="0"
        value={displayLimit}
        onChange={(e) => onLimitChange(parseInt(e.target.value) || 0)}
        className="w-full px-3 py-2 text-sm bg-secondary border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary"
      />
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================
export function ClaudeTaskMonitor() {
  const { tasks, stats, isLoading, error, displayLimit, loadTasks, setTodoPath, setDisplayLimit } = useClaudeTaskStore();
  const { projectSettings } = useSettingsStore();
  const [showSettings, setShowSettings] = useState(false);

  // Compute todo path
  const todoPath = useMemo(() => {
    const projectPath = projectSettings.projectPath || process.cwd();
    return `${projectPath}\\ai\\todo.md`;
  }, [projectSettings.projectPath]);

  // Set todo path in store
  useEffect(() => {
    setTodoPath(todoPath);
  }, [todoPath, setTodoPath]);

  // Load tasks on mount
  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // File watcher callback - memoized to prevent re-subscriptions
  const handleFileChange = useCallback(() => {
    loadTasks();
  }, [loadTasks]);

  // Watch todo.md for changes - auto-refresh when file is modified
  useFileWatch(todoPath, handleFileChange);

  // Polling fallback - refresh every 2 seconds (file watcher may not work on all systems)
  useEffect(() => {
    const interval = setInterval(() => {
      loadTasks();
    }, 2000);
    return () => clearInterval(interval);
  }, [loadTasks]);

  // Calculate max elapsed time for Gantt scaling
  const maxElapsed = useMemo(() => {
    const now = new Date();
    return Math.max(
      ...tasks.map(t => {
        const start = t.createdAt || now;
        const end = t.completedAt || now;
        return end.getTime() - start.getTime();
      }),
      60000 // Minimum 1 minute scale
    );
  }, [tasks]);

  // Get filtered tasks for display
  const displayTasks = getDisplayTasks(tasks, displayLimit);

  return (
    <div className="h-full flex flex-col bg-background overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-gradient-to-br from-violet-500/20 to-purple-500/20">
            <Sparkles className="w-5 h-5 text-violet-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Claude Task Monitor</h1>
            <p className="text-xs text-muted-foreground">
              Via Kuroryuu plugin hooks for Claude Code CLI 2.1.19+ Tasks
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadTasks()}
            disabled={isLoading}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
          </button>
          <button
            onClick={() => setShowSettings(!showSettings)}
            className="p-2 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
            title="Settings"
          >
            <Settings className="w-4 h-4" />
          </button>
        </div>

        {/* Settings dropdown */}
        {showSettings && (
          <SettingsPanel
            displayLimit={displayLimit}
            onLimitChange={setDisplayLimit}
            onClose={() => setShowSettings(false)}
          />
        )}
      </div>

      {/* Error state */}
      {error && (
        <div className="mx-6 mt-4 px-4 py-3 bg-red-500/10 border border-red-500/30 rounded-lg text-sm text-red-400">
          {error}
        </div>
      )}

      {/* Loading state */}
      {isLoading && tasks.length === 0 && (
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 text-muted-foreground animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoading && tasks.length === 0 && (
        <div className="flex-1 flex flex-col items-center justify-center text-center px-6">
          <div className="p-4 rounded-full bg-secondary/50 mb-4">
            <Activity className="w-8 h-8 text-muted-foreground" />
          </div>
          <h2 className="text-lg font-medium text-foreground mb-2">No Tasks Found</h2>
          <p className="text-sm text-muted-foreground max-w-md">
            Tasks from ai/todo.md will appear here. Format: <code className="text-xs bg-secondary px-1 rounded">- [ ] T###: description</code>
          </p>
        </div>
      )}

      {/* Main content */}
      {tasks.length > 0 && (
        <div className="flex-1 overflow-auto p-6 space-y-6">
          {/* Stats row */}
          <div className="grid grid-cols-5 gap-4">
            <StatCard
              label="Total Tasks"
              value={stats.total}
              icon={<Activity className="w-5 h-5" />}
              color="text-blue-400"
            />
            <StatCard
              label="Backlog"
              value={stats.pending}
              icon={<FileText className="w-5 h-5" />}
              color="text-muted-foreground"
            />
            <StatCard
              label="In Progress"
              value={stats.inProgress}
              icon={<Clock className="w-5 h-5" />}
              color="text-amber-400"
            />
            <StatCard
              label="Completed"
              value={stats.completed}
              icon={<CheckCircle2 className="w-5 h-5" />}
              color="text-emerald-400"
            />
            <StatCard
              label="Completion Rate"
              value={`${stats.completionRate}%`}
              icon={<Sparkles className="w-5 h-5" />}
              color="text-violet-400"
            />
          </div>

          {/* Charts row */}
          <div className="grid grid-cols-2 gap-6">
            {/* Donut chart */}
            <div className="p-6 bg-secondary/20 rounded-2xl border border-border/50">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Progress</h3>
              <div className="flex items-center justify-center">
                <DonutChart
                  completed={stats.completed}
                  inProgress={stats.inProgress}
                  pending={stats.pending}
                />
              </div>
              <div className="flex flex-wrap justify-center gap-4 mt-4 text-xs">
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-emerald-500" />
                  <span className="text-muted-foreground">Done ({stats.completed})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-amber-500" />
                  <span className="text-muted-foreground">Active ({stats.inProgress})</span>
                </div>
                <div className="flex items-center gap-2">
                  <div className="w-3 h-3 rounded-full bg-secondary" />
                  <span className="text-muted-foreground">Backlog ({stats.pending})</span>
                </div>
              </div>
            </div>

            {/* Gantt timeline */}
            <div className="p-6 bg-secondary/20 rounded-2xl border border-border/50">
              <h3 className="text-sm font-medium text-muted-foreground mb-4">Task Timeline</h3>
              <div className="space-y-1 max-h-48 overflow-y-auto">
                {displayTasks.map(task => (
                  <GanttBar key={task.id} task={task} maxElapsed={maxElapsed} />
                ))}
              </div>
            </div>
          </div>

          {/* Task list */}
          <div className="bg-secondary/20 rounded-2xl border border-border/50">
            <div className="px-6 py-4 border-b border-border/50">
              <h3 className="text-sm font-medium text-foreground">Task List</h3>
              <p className="text-xs text-muted-foreground">
                Showing {displayTasks.length} of {tasks.length} tasks
              </p>
            </div>
            <div className="max-h-80 overflow-y-auto">
              {displayTasks.map(task => (
                <TaskRow key={task.id} task={task} />
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
