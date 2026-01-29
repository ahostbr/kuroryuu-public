/**
 * Clawdbot Widget for HOME Screen
 * Interactive panel with status, quick task input, and recent results
 */

import { useState, useEffect } from 'react';
import {
  Bot,
  Play,
  Square,
  Loader2,
  Check,
  AlertCircle,
  Send,
  Settings,
  ExternalLink,
  RefreshCw,
  ChevronDown,
  ChevronUp,
  Clock,
} from 'lucide-react';
import { useSettingsStore } from '../../../stores/settings-store';
import { toast } from '../../ui/toast';
import { cn } from '../../../lib/utils';

interface ClawdbotStatus {
  enabled: boolean;
  dockerAvailable: boolean;
  containerExists: boolean;
  containerRunning: boolean;
  controlUiUrl?: string;
}

interface TaskResult {
  id: string;
  prompt: string;
  result?: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  timestamp: number;
}

export function ClawdbotWidget() {
  const { openDialog } = useSettingsStore();

  const [status, setStatus] = useState<ClawdbotStatus>({
    enabled: false,
    dockerAvailable: false,
    containerExists: false,
    containerRunning: false,
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [taskInput, setTaskInput] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [recentTasks, setRecentTasks] = useState<TaskResult[]>([]);
  const [lastResult, setLastResult] = useState<TaskResult | null>(null);
  const [showLastResult, setShowLastResult] = useState(false);

  // Load status on mount
  useEffect(() => {
    loadStatus();
    const interval = setInterval(loadStatus, 10000); // Poll every 10s
    return () => clearInterval(interval);
  }, []);

  const loadStatus = async () => {
    try {
      const result = await window.electronAPI.clawdbot.status();
      setStatus({
        enabled: result.enabled,
        dockerAvailable: result.dockerAvailable,
        containerExists: result.containerExists,
        containerRunning: result.containerRunning,
        controlUiUrl: result.controlUiUrl,
      });
    } catch (err) {
      console.error('Failed to load Clawdbot status:', err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStart = async () => {
    setIsStarting(true);
    try {
      const result = await window.electronAPI.clawdbot.start();
      if (result.ok) {
        toast.success('Clawdbot container started');
        await loadStatus();
      } else {
        toast.error(result.error || 'Failed to start container');
      }
    } catch (err) {
      toast.error('Failed to start container');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      const result = await window.electronAPI.clawdbot.stop();
      if (result.ok) {
        toast.info('Clawdbot container stopped');
        await loadStatus();
      } else {
        toast.error(result.error || 'Failed to stop container');
      }
    } catch (err) {
      toast.error('Failed to stop container');
    } finally {
      setIsStopping(false);
    }
  };

  const handleSubmitTask = async () => {
    if (!taskInput.trim()) return;

    const taskId = `task_${Date.now()}`;
    const newTask: TaskResult = {
      id: taskId,
      prompt: taskInput.trim(),
      status: 'running',
      timestamp: Date.now(),
    };

    setRecentTasks(prev => [newTask, ...prev].slice(0, 5));
    setIsSubmitting(true);
    setTaskInput('');

    try {
      const result = await window.electronAPI.clawdbot.task(newTask.prompt);

      const completedTask: TaskResult = {
        ...newTask,
        status: result.ok ? 'completed' : 'failed',
        result: result.ok ? result.result : result.error,
      };

      setRecentTasks(prev =>
        prev.map(t => (t.id === taskId ? completedTask : t))
      );
      setLastResult(completedTask);

      if (result.ok) {
        toast.success('Task completed');
      } else {
        toast.error(result.error || 'Task failed');
      }
    } catch (err) {
      const failedTask: TaskResult = {
        ...newTask,
        status: 'failed',
        result: String(err),
      };
      setRecentTasks(prev =>
        prev.map(t => (t.id === taskId ? failedTask : t))
      );
      toast.error('Task failed');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfigure = () => {
    openDialog('integrations');
  };

  // Status indicator
  const getStatusIndicator = () => {
    if (!status.enabled) {
      return { color: 'bg-muted', label: 'Disabled' };
    }
    if (!status.dockerAvailable) {
      return { color: 'bg-red-500', label: 'Docker Unavailable' };
    }
    if (status.containerRunning) {
      return { color: 'bg-green-500', label: 'Running' };
    }
    if (status.containerExists) {
      return { color: 'bg-yellow-500', label: 'Stopped' };
    }
    return { color: 'bg-muted', label: 'Not Created' };
  };

  const statusIndicator = getStatusIndicator();

  if (isLoading) {
    return (
      <div className="p-4 flex items-center justify-center">
        <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Status Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-cyan-500/10 rounded-lg">
            <Bot className="w-5 h-5 text-cyan-400" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h4 className="font-medium text-foreground">Clawdbot Worker</h4>
              <div className="flex items-center gap-1.5">
                <div className={cn('w-2 h-2 rounded-full', statusIndicator.color)} />
                <span className="text-xs text-muted-foreground">{statusIndicator.label}</span>
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Autonomous AI worker in Docker
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {status.controlUiUrl && status.containerRunning && (
            <a
              href={status.controlUiUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="p-2 text-muted-foreground hover:text-foreground transition-colors"
              title="Open Control UI"
            >
              <ExternalLink className="w-4 h-4" />
            </a>
          )}
          <button
            onClick={handleConfigure}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            title="Configure"
          >
            <Settings className="w-4 h-4" />
          </button>
          <button
            onClick={loadStatus}
            className="p-2 text-muted-foreground hover:text-foreground transition-colors"
            title="Refresh"
          >
            <RefreshCw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Container Controls */}
      {status.enabled && status.dockerAvailable && (
        <div className="flex gap-2">
          {!status.containerRunning ? (
            <button
              onClick={handleStart}
              disabled={isStarting}
              className="flex items-center gap-2 px-3 py-1.5 bg-cyan-500/20 text-cyan-400 rounded-lg hover:bg-cyan-500/30 transition-colors text-sm disabled:opacity-50"
            >
              {isStarting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Play className="w-4 h-4" />
              )}
              Start
            </button>
          ) : (
            <button
              onClick={handleStop}
              disabled={isStopping}
              className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 text-red-400 rounded-lg hover:bg-red-500/30 transition-colors text-sm disabled:opacity-50"
            >
              {isStopping ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Square className="w-4 h-4" />
              )}
              Stop
            </button>
          )}
        </div>
      )}

      {/* Quick Task Input */}
      {status.containerRunning && (
        <div className="space-y-2">
          <label className="text-xs text-muted-foreground">Quick Task</label>
          <div className="flex gap-2">
            <input
              type="text"
              value={taskInput}
              onChange={(e) => setTaskInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSubmitTask();
                }
              }}
              placeholder="Enter task for Clawdbot..."
              disabled={isSubmitting}
              className="flex-1 px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:border-cyan-500 focus:outline-none disabled:opacity-50"
            />
            <button
              onClick={handleSubmitTask}
              disabled={!taskInput.trim() || isSubmitting}
              className="flex items-center gap-2 px-3 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 transition-colors text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSubmitting ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Send className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>
      )}

      {/* Last Result Preview */}
      {lastResult && (
        <div className="space-y-2">
          <button
            onClick={() => setShowLastResult(!showLastResult)}
            className="flex items-center justify-between w-full text-left"
          >
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">Last Result</span>
              {lastResult.status === 'completed' && (
                <Check className="w-3 h-3 text-green-400" />
              )}
              {lastResult.status === 'failed' && (
                <AlertCircle className="w-3 h-3 text-red-400" />
              )}
            </div>
            {showLastResult ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground" />
            )}
          </button>

          {showLastResult && lastResult.result && (
            <div className="p-3 bg-secondary rounded-lg">
              <p className="text-xs text-muted-foreground mb-1 truncate">
                {lastResult.prompt}
              </p>
              <pre className="text-xs text-foreground whitespace-pre-wrap max-h-40 overflow-y-auto">
                {lastResult.result.slice(0, 500)}
                {lastResult.result.length > 500 && '...'}
              </pre>
            </div>
          )}
        </div>
      )}

      {/* Recent Tasks */}
      {recentTasks.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs text-muted-foreground">Recent Tasks</span>
          <div className="space-y-1">
            {recentTasks.slice(0, 3).map((task) => (
              <div
                key={task.id}
                className="flex items-center gap-2 p-2 bg-secondary/50 rounded text-sm"
              >
                {task.status === 'running' && (
                  <Loader2 className="w-3 h-3 animate-spin text-cyan-400" />
                )}
                {task.status === 'completed' && (
                  <Check className="w-3 h-3 text-green-400" />
                )}
                {task.status === 'failed' && (
                  <AlertCircle className="w-3 h-3 text-red-400" />
                )}
                <span className="flex-1 truncate text-foreground">{task.prompt}</span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  {new Date(task.timestamp).toLocaleTimeString()}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Not Enabled Message */}
      {!status.enabled && (
        <div className="p-4 bg-secondary/50 rounded-lg text-center">
          <p className="text-sm text-muted-foreground mb-2">
            Clawdbot is not enabled
          </p>
          <button
            onClick={handleConfigure}
            className="text-sm text-cyan-400 hover:underline"
          >
            Enable in Integrations
          </button>
        </div>
      )}

      {/* Docker Not Available */}
      {status.enabled && !status.dockerAvailable && (
        <div className="p-4 bg-red-500/10 rounded-lg text-center">
          <AlertCircle className="w-6 h-6 text-red-400 mx-auto mb-2" />
          <p className="text-sm text-red-400">
            Docker Desktop is not running
          </p>
          <p className="text-xs text-muted-foreground mt-1">
            Start Docker Desktop to use Clawdbot
          </p>
        </div>
      )}
    </div>
  );
}
