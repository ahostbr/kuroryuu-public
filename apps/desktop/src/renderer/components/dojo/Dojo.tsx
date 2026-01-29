/**
 * Dojo - Unified Planning Workspace
 *
 * Planning hub with tabs:
 * - Orchestration: Task queue with real-time agent status (default)
 * - PRD: LMStudio-powered workflow-first PRD experience
 * - Ideation: LMStudio-powered idea generation
 * - Roadmap: AI-powered roadmap generation with kanban view
 *
 * Formulas removed - functionality deprecated
 */
import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Swords,
  Plus,
  Loader2,
  Lightbulb,
  FileText,
  AlertTriangle,
  CheckCircle,
  RefreshCw,
  Workflow,
  Map,
} from 'lucide-react';
import { useDomainConfigStore } from '../../stores/domain-config-store';
import { PROVIDERS, type DomainId } from '../../types/domain-config';
import { useTaskStore } from '../../stores/task-store';
import { useSettingsStore } from '../../stores/settings-store';
import { useGatewayWebSocket } from '../../hooks/useGatewayWebSocket';
import { useCaptureStore } from '../../stores/capture-store';
import { Ideation } from '../ideation/Ideation';
import { Roadmap } from '../Roadmap';
import { PRDWorkflowPage } from '../prd/PRDWorkflowPage';
import { TaskWizard } from '../TaskWizard';
import { RecordingIndicator } from '../capture/RecordingIndicator';
import {
  TaskQueue,
  TaskDetailPane,
  AgentActivityFeed,
  OrchestrationTask,
  OrchestrationStats,
  OrchestrationEvent,
} from '../orchestration';
import type { Task, TaskStatus } from '../../types/task';

// ============================================================================
// Domain Status Banner - shows configured provider per domain
// ============================================================================
interface DomainStatusProps {
  domainId: DomainId;
}

function DomainStatus({ domainId }: DomainStatusProps) {
  // Get domain config
  const { getConfigForDomain, providerHealth, checkProviderHealth } = useDomainConfigStore();
  const config = getConfigForDomain(domainId);

  // Get provider info
  const providerInfo = PROVIDERS.find(p => p.id === config.provider);
  const providerName = providerInfo?.name || config.provider;
  const providerColor = providerInfo?.color || 'green';

  // Check if provider is healthy
  const health = providerHealth[config.provider];
  const isConnected = health?.healthy ?? false;

  const [isChecking, setIsChecking] = useState(false);

  // Check connection on mount
  useEffect(() => {
    checkProviderHealth();
  }, [checkProviderHealth]);

  const handleRefresh = async () => {
    setIsChecking(true);
    await checkProviderHealth();
    setIsChecking(false);
  };

  // Color classes based on provider
  const colorClasses = {
    green: { bg: 'bg-green-500/10', border: 'border-green-500/30', text: 'text-green-500', code: 'bg-green-500/20 text-green-400' },
    blue: { bg: 'bg-blue-500/10', border: 'border-blue-500/30', text: 'text-blue-500', code: 'bg-blue-500/20 text-blue-400' },
    purple: { bg: 'bg-purple-500/10', border: 'border-purple-500/30', text: 'text-purple-500', code: 'bg-purple-500/20 text-purple-400' },
    orange: { bg: 'bg-orange-500/10', border: 'border-orange-500/30', text: 'text-orange-500', code: 'bg-orange-500/20 text-orange-400' },
  };
  const colors = colorClasses[providerColor as keyof typeof colorClasses] || colorClasses.green;

  if (isConnected) {
    return (
      <div className={`flex items-center justify-between px-4 py-3 ${colors.bg} border ${colors.border} rounded-lg mx-6 mt-4`}>
        <div className="flex items-center gap-3">
          <CheckCircle className={`w-5 h-5 ${colors.text} flex-shrink-0`} />
          <div className="text-sm">
            <span className={`${colors.text} font-medium`}>{providerName} Connected</span>
            {config.modelId && (
              <span className="text-muted-foreground ml-2">
                Model: <code className={`${colors.code} px-1.5 py-0.5 rounded`}>{config.modelId}</code>
              </span>
            )}
          </div>
        </div>
        <button
          onClick={handleRefresh}
          disabled={isChecking}
          className="p-1.5 text-muted-foreground hover:text-foreground rounded-lg hover:bg-secondary transition-colors"
          title="Refresh connection"
        >
          <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
        </button>
      </div>
    );
  }

  // Provider-specific disconnection messages
  const disconnectMessage = {
    'lmstudio': 'Start LMStudio server at localhost:1234',
    'cliproxyapi': 'CLI Proxy not responding at localhost:8317',
    'gateway-auto': 'Gateway not responding at localhost:8200',
    'claude': 'Claude API key not configured',
  }[config.provider] || 'Provider not available';

  return (
    <div className="flex items-center justify-between px-4 py-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg mx-6 mt-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="w-5 h-5 text-yellow-500 flex-shrink-0" />
        <div className="text-sm">
          <span className="text-yellow-500 font-medium">{providerName} Not Connected</span>
          <span className="text-muted-foreground ml-1">
            {disconnectMessage}
          </span>
        </div>
      </div>
      <button
        onClick={handleRefresh}
        disabled={isChecking}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-yellow-500 hover:text-yellow-400 rounded-lg hover:bg-yellow-500/10 transition-colors"
      >
        <RefreshCw className={`w-4 h-4 ${isChecking ? 'animate-spin' : ''}`} />
        {isChecking ? 'Checking...' : 'Retry'}
      </button>
    </div>
  );
}

// ============================================================================
// Tab Button Component for reuse
// ============================================================================
interface TabButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  activeColor?: string;
}

function TabButton({ active, onClick, icon, label, activeColor = 'bg-primary/20 text-primary' }: TabButtonProps) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
        active ? activeColor : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
      }`}
    >
      {icon}
      {label}
    </button>
  );
}

// ============================================================================
// Task Status Mapping (from OrchestrationPanel)
// ============================================================================
const mapTaskStatus = (status: TaskStatus): OrchestrationTask['status'] => {
  switch (status) {
    case 'backlog': return 'pending';
    case 'active': return 'in_progress';
    case 'delayed': return 'assigned';
    case 'done': return 'completed';
    default: return 'pending';
  }
};

const mapTaskToOrchestration = (task: Task): OrchestrationTask => ({
  task_id: task.id,
  title: task.title,
  description: task.description || '',
  status: mapTaskStatus(task.status),
  priority: task.priority === 'high' ? 1 : task.priority === 'medium' ? 2 : 3,
  submitted_by: task.assignee || 'user',
  created_at: task.createdAt || new Date().toISOString(),
  started_at: task.status === 'active' ? task.updatedAt || null : null,
  completed_at: task.status === 'done' ? task.updatedAt || null : null,
  subtasks: [],
  error: null,
});

// ============================================================================
// Dojo - Main Component
// ============================================================================
export function Dojo() {
  const [activeTab, setActiveTab] = useState<'orchestration' | 'prd' | 'ideation' | 'roadmap'>('orchestration');

  // TaskWizard state
  const [wizardOpen, setWizardOpen] = useState(false);

  // Orchestration state (from OrchestrationPanel)
  const [selectedTask, setSelectedTask] = useState<OrchestrationTask | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [events, setEvents] = useState<OrchestrationEvent[]>([]);

  const { isConnected, connectionState, agents } = useGatewayWebSocket();
  const isRecording = useCaptureStore((s) => s.isRecording);

  // Use task-store (same as Kanban) - reads from ai/todo.md
  const taskStore = useTaskStore();
  const { tasks: rawTasks, loadTasks, isLoading, todoPath, setTodoPath } = taskStore;
  const projectPath = useSettingsStore((s) => s.projectSettings.projectPath);

  // Initialize todoPath from settings store projectPath
  useEffect(() => {
    if (!todoPath) {
      const basePath = projectPath || process.cwd();
      setTodoPath(`${basePath}\\ai\\todo.md`);
    }
  }, [todoPath, setTodoPath, projectPath]);

  // Map tasks to orchestration format
  const tasks = useMemo(() =>
    rawTasks.map(mapTaskToOrchestration),
    [rawTasks]
  );

  // Compute stats from tasks
  const stats = useMemo<OrchestrationStats>(() => ({
    total: tasks.length,
    pending: tasks.filter(t => t.status === 'pending').length,
    breaking_down: 0,
    assigned: tasks.filter(t => t.status === 'assigned').length,
    in_progress: tasks.filter(t => t.status === 'in_progress').length,
    completed: tasks.filter(t => t.status === 'completed').length,
    failed: tasks.filter(t => t.status === 'failed').length,
    cancelled: tasks.filter(t => t.status === 'cancelled').length,
    total_subtasks: 0,
    pending_subtasks: 0,
  }), [tasks]);

  // Initial load
  useEffect(() => {
    if (todoPath) {
      loadTasks();
    }
  }, [todoPath, loadTasks]);

  // Add event when task created
  const addEvent = useCallback((type: OrchestrationEvent['type'], taskId: string, taskTitle: string) => {
    setEvents(prev => [{
      id: `${Date.now()}-${Math.random()}`,
      type,
      taskId,
      taskTitle,
      timestamp: new Date().toISOString(),
    }, ...prev].slice(0, 50));
  }, []);

  // Start task handler - moves to active
  const handleBreakdown = useCallback(async (taskId: string) => {
    try {
      await taskStore.updateTaskStatus(taskId, 'active');
      const task = rawTasks.find(t => t.id === taskId);
      if (task) addEvent('started', taskId, task.title);
    } catch (err) {
      console.error('Failed to start task:', err);
    }
  }, [taskStore, rawTasks, addEvent]);

  // Cancel/Complete task handler
  const handleCancel = useCallback(async (taskId: string) => {
    try {
      await taskStore.updateTaskStatus(taskId, 'done');
      const task = rawTasks.find(t => t.id === taskId);
      if (task) addEvent('completed', taskId, task.title);
      if (selectedTask?.task_id === taskId) {
        setSelectedTask(null);
      }
    } catch (err) {
      console.error('Failed to complete task:', err);
    }
  }, [taskStore, rawTasks, selectedTask, addEvent]);

  // Select task handler
  const handleSelectTask = useCallback((task: OrchestrationTask) => {
    setSelectedTask(prev => prev?.task_id === task.task_id ? null : task);
  }, []);

  // Tab header component for reuse
  const TabHeader = () => (
    <div className="flex items-center gap-1">
      <TabButton
        active={activeTab === 'orchestration'}
        onClick={() => setActiveTab('orchestration')}
        icon={<Workflow className="w-4 h-4" />}
        label="Orchestration"
        activeColor="bg-purple-500/20 text-purple-400"
      />
      <TabButton
        active={activeTab === 'prd'}
        onClick={() => setActiveTab('prd')}
        icon={<FileText className="w-4 h-4" />}
        label="PRD"
        activeColor="bg-blue-500/20 text-blue-400"
      />
      <TabButton
        active={activeTab === 'ideation'}
        onClick={() => setActiveTab('ideation')}
        icon={<Lightbulb className="w-4 h-4" />}
        label="Ideation"
        activeColor="bg-yellow-500/20 text-yellow-400"
      />
      <TabButton
        active={activeTab === 'roadmap'}
        onClick={() => setActiveTab('roadmap')}
        icon={<Map className="w-4 h-4" />}
        label="Roadmap"
        activeColor="bg-cyan-500/20 text-cyan-400"
      />
    </div>
  );

  // Orchestration tab
  if (activeTab === 'orchestration') {
    return (
      <div className="h-full flex flex-col bg-background">
        {/* Compact Header with tabs + stats */}
        <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/30">
          <div className="flex items-center gap-3">
            <TabHeader />
            {isRecording && <RecordingIndicator variant="compact" />}
          </div>

          <div className="flex items-center gap-3">
            {/* Inline stats badges */}
            <div className="flex items-center gap-1.5">
              <span className="text-xs px-2 py-0.5 rounded bg-muted text-muted-foreground">
                {stats.total} total
              </span>
              {stats.in_progress > 0 && (
                <span className="text-xs px-2 py-0.5 rounded bg-yellow-500/20 text-yellow-400">
                  {stats.in_progress} active
                </span>
              )}
              {stats.completed > 0 && (
                <span className="text-xs px-2 py-0.5 rounded bg-green-500/20 text-green-400">
                  {stats.completed} done
                </span>
              )}
              {stats.failed > 0 && (
                <span className="text-xs px-2 py-0.5 rounded bg-red-500/20 text-red-400">
                  {stats.failed} failed
                </span>
              )}
            </div>

            {/* New Task button */}
            <button
              onClick={() => setWizardOpen(true)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium rounded-lg bg-primary/20 text-primary hover:bg-primary/30 transition-colors"
            >
              <Plus className="w-4 h-4" />
              New Task
            </button>

            {/* Refresh button */}
            <button
              onClick={() => loadTasks()}
              className={`p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground hover:text-foreground ${isLoading ? 'animate-spin' : ''}`}
              title="Refresh"
              disabled={isLoading}
            >
              <RefreshCw className="w-4 h-4" />
            </button>

            {/* Connection status */}
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className={`w-2 h-2 rounded-full ${
                isConnected ? 'bg-green-400' :
                connectionState === 'connecting' ? 'bg-yellow-400 animate-pulse' :
                'bg-red-400'
              }`} />
              {connectionState}
            </div>
          </div>
        </div>

        {/* Error banner */}
        {error && (
          <div className="px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-sm text-red-400 flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-400 hover:text-red-300">
              Dismiss
            </button>
          </div>
        )}

        {/* Three-column layout */}
        <div className="flex-1 flex overflow-hidden">
          {/* Left: Task Queue */}
          <div className="w-64 flex-shrink-0">
            <TaskQueue
              tasks={tasks}
              selectedTaskId={selectedTask?.task_id || null}
              onSelectTask={handleSelectTask}
              onBreakdown={handleBreakdown}
              onCancel={handleCancel}
            />
          </div>

          {/* Center: Task Detail */}
          <div className="flex-1 min-w-0 border-x border-border">
            <TaskDetailPane task={selectedTask} />
          </div>

          {/* Right: Agent Activity Feed */}
          <div className="w-56 flex-shrink-0">
            <AgentActivityFeed agents={agents} isConnected={isConnected} events={events} />
          </div>
        </div>

        {/* TaskWizard Modal */}
        <TaskWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      </div>
    );
  }

  // Ideation tab
  if (activeTab === 'ideation') {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50">
          <TabHeader />
        </div>
        <DomainStatus domainId="ideation" />

        {/* Ideation Content */}
        <div className="flex-1 overflow-hidden">
          <Ideation />
        </div>

        {/* TaskWizard Modal */}
        <TaskWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      </div>
    );
  }

  // Roadmap tab
  if (activeTab === 'roadmap') {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50">
          <TabHeader />
        </div>
        <DomainStatus domainId="roadmap" />

        {/* Roadmap Content */}
        <div className="flex-1 overflow-hidden">
          <Roadmap />
        </div>

        {/* TaskWizard Modal */}
        <TaskWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      </div>
    );
  }

  // PRD tab - Workflow-first layout
  if (activeTab === 'prd') {
    return (
      <div className="h-full flex flex-col bg-background">
        <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50">
          <TabHeader />
        </div>
        <DomainStatus domainId="prd" />

        {/* PRD Workflow Page - Graph-centric layout */}
        <div className="flex-1 overflow-hidden">
          <PRDWorkflowPage />
        </div>

        {/* TaskWizard Modal */}
        <TaskWizard open={wizardOpen} onOpenChange={setWizardOpen} />
      </div>
    );
  }

  // Default to orchestration (shouldn't reach here but TypeScript safety)
  return (
    <div className="h-full flex flex-col bg-background">
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50">
        <TabHeader />
      </div>
      <div className="flex-1 overflow-hidden p-6">
        <p className="text-muted-foreground">Select a tab to continue</p>
      </div>
      <TaskWizard open={wizardOpen} onOpenChange={setWizardOpen} />
    </div>
  );
}
