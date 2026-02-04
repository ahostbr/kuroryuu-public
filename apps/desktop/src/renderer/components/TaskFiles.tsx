import React, { useEffect } from 'react';
import { EvidenceList } from './Inspector/EvidenceList';
import { FileText, FolderOpen, AlertCircle } from 'lucide-react';
import type { Task } from '../types/task';
import { useClaudeTaskStore } from '../stores/claude-task-store';

interface TaskFilesProps {
  task: Task;
  projectRoot: string;
}

export function TaskFiles({ task, projectRoot }: TaskFilesProps) {
  const { tasks: claudeTasks, loadTasks } = useClaudeTaskStore();

  useEffect(() => {
    loadTasks();
  }, [loadTasks]);

  // Find matching ClaudeTask to get worklog/checkpoint metadata
  const claudeTask = claudeTasks.find(ct => ct.id === task.id);

  return (
    <div className="space-y-6 h-full flex flex-col">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-muted-foreground flex items-center gap-2">
           <FileText className="w-4 h-4" />
           Checkpoints & Sessions
        </h3>
        <button
           className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
           onClick={() => (window as unknown as { Electron?: { openPath?: (path: string) => void } }).Electron?.openPath?.(`${projectRoot}/WORKING/evidence/${task.id}`)}
        >
           <FolderOpen className="w-3 h-3" />
           Open Folder
        </button>
      </div>

      <div className="bg-background rounded-lg border border-border p-0 flex-1 overflow-hidden flex flex-col min-h-[300px]">
        {/* Info Banner */}
        <div className="bg-blue-900/10 border-b border-blue-900/20 p-3 flex items-start gap-3">
           <AlertCircle className="w-4 h-4 text-blue-400 mt-0.5 shrink-0" />
           <div className="text-xs text-blue-200/80">
              Checkpoints and session files related to this task.
              Worklogs are shown in the Logs tab.
           </div>
        </div>

        <div className="p-4 overflow-auto flex-1">
           <EvidenceList
             projectRoot={projectRoot}
             taskId={task.id}
             taskTitle={task.title}
             worklog={claudeTask?.worklog}
             checkpoint={claudeTask?.checkpoint}
           />
        </div>
      </div>
    </div>
  );
}
