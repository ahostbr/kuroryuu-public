import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import * as Tabs from '@radix-ui/react-tabs';
import type { Task, TaskCategory } from '../types/task';
import { TaskOverview } from './TaskOverview';
import { TaskFiles } from './TaskFiles';
import { TaskLogs } from './TaskLogs';
import { X, Lock, RotateCcw, Edit, Trash2, GitMerge, Save, XCircle, AlertTriangle } from 'lucide-react';
import { useTaskStore } from '../stores/task-store';
import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { ThemedFrame } from './ui/ThemedFrame';
import { useIsThemedStyle } from '../hooks/useTheme';

interface TaskDetailModalProps {
  task: Task | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectRoot: string;
}

interface EditFormData {
  title: string;
  description: string;
  priority: 'low' | 'medium' | 'high';
  category: TaskCategory | '';
  complexity: 'sm' | 'md' | 'lg' | '';
  tags: string;
}

const CATEGORY_OPTIONS: { value: TaskCategory; label: string }[] = [
  { value: 'feature', label: 'Feature' },
  { value: 'bug_fix', label: 'Bug Fix' },
  { value: 'refactoring', label: 'Refactoring' },
  { value: 'documentation', label: 'Documentation' },
  { value: 'security', label: 'Security' },
  { value: 'performance', label: 'Performance' },
  { value: 'ui_ux', label: 'UI/UX' },
  { value: 'infrastructure', label: 'Infrastructure' },
  { value: 'testing', label: 'Testing' },
];

export function TaskDetailModal({ task, open, onOpenChange, projectRoot }: TaskDetailModalProps) {
  const { isLocked, getLockedBy, lockTask, unlockTask, updateTask, deleteTask } = useTaskStore();
  const { isKuroryuu, isGrunge } = useIsThemedStyle();
  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [formData, setFormData] = useState<EditFormData>({
    title: '',
    description: '',
    priority: 'medium',
    category: '',
    complexity: '',
    tags: '',
  });

  // Reset form when task changes or modal opens
  useEffect(() => {
    if (task && open) {
      setFormData({
        title: task.title,
        description: task.description || '',
        priority: task.priority || 'medium',
        category: task.category || '',
        complexity: task.complexity || '',
        tags: task.tags?.join(', ') || '',
      });
      setIsEditing(false);
      setShowDeleteConfirm(false);
    }
  }, [task, open]);

  if (!task) return null;

  const locked = isLocked(task.id);
  const lockedBy = getLockedBy(task.id);

  const handleLockToggle = () => {
    if (locked) {
      unlockTask(task.id);
    } else {
      lockTask(task.id, 'current-agent');
    }
  };

  const handleEditToggle = () => {
    if (isEditing) {
      // Cancel - reset form data
      setFormData({
        title: task.title,
        description: task.description || '',
        priority: task.priority || 'medium',
        category: task.category || '',
        complexity: task.complexity || '',
        tags: task.tags?.join(', ') || '',
      });
    }
    setIsEditing(!isEditing);
  };

  const handleSave = async () => {
    const updates: Partial<Omit<Task, 'id'>> = {
      title: formData.title.trim(),
      description: formData.description.trim() || undefined,
      priority: formData.priority,
      category: formData.category || undefined,
      complexity: formData.complexity || undefined,
      tags: formData.tags
        ? formData.tags.split(',').map(t => t.trim()).filter(Boolean)
        : undefined,
    };

    await updateTask(task.id, updates);
    setIsEditing(false);
  };

  const handleFormChange = (field: keyof EditFormData, value: string) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleDelete = async () => {
    await deleteTask(task.id);
    setShowDeleteConfirm(false);
    onOpenChange(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed top-[5%] left-[50%] translate-x-[-50%] z-50 focus:outline-none">
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="lg"
            className="w-[90vw] max-w-4xl h-[90vh] overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
            contentClassName="flex-1 flex flex-col min-h-0"
          >
            {/* Header */}
          <div className="flex-shrink-0 bg-card border-b border-border p-4">
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-mono font-bold text-muted-foreground bg-secondary/50 px-2 py-0.5 rounded">
                    {task.id}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded font-medium uppercase tracking-wider ${
                     task.status === 'done' ? 'bg-green-500/10 text-green-500' :
                     task.status === 'active' ? 'bg-primary/10 text-primary' :
                     'bg-secondary text-muted-foreground'
                   }`}>
                     {task.status}
                   </span>
                   {locked && (
                     <div className="flex items-center gap-1.5 text-xs text-primary bg-primary/10 px-2 py-0.5 rounded border border-primary/20">
                       <Lock className="w-3 h-3" />
                       <span className="font-medium">Locked by {lockedBy}</span>
                     </div>
                   )}
                   {isEditing && (
                     <span className="text-xs px-2 py-0.5 rounded font-medium bg-amber-500/10 text-amber-500 border border-amber-500/20">
                       Editing
                     </span>
                   )}
                </div>
                {isEditing ? (
                  <input
                    type="text"
                    value={formData.title}
                    onChange={(e) => handleFormChange('title', e.target.value)}
                    className="w-full text-xl font-bold text-foreground bg-secondary/50 border border-border rounded-lg px-3 py-1.5 focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="Task title"
                  />
                ) : (
                  <Dialog.Title className="text-xl font-bold text-foreground truncate">
                    {task.title}
                  </Dialog.Title>
                )}
                <Dialog.Description className="sr-only">
                  Task details for {task.id}: {task.title}
                </Dialog.Description>
              </div>

              {/* Header Actions */}
              <div className="flex items-center gap-2">
                 {isEditing ? (
                   <>
                     <button
                       onClick={handleSave}
                       className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
                     >
                       <Save className="w-4 h-4" />
                       Save
                     </button>
                     <button
                       onClick={handleEditToggle}
                       className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-secondary text-foreground rounded-lg hover:bg-muted transition-colors"
                     >
                       <XCircle className="w-4 h-4" />
                       Cancel
                     </button>
                   </>
                 ) : (
                   <>
                     <button
                       onClick={handleEditToggle}
                       className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
                       title="Edit Task"
                     >
                       <Edit className="w-4 h-4" />
                     </button>
                     <button
                       onClick={() => setShowDeleteConfirm(true)}
                       className="p-2 text-muted-foreground hover:text-destructive hover:bg-destructive/10 rounded-lg transition-colors"
                       title="Delete Task"
                     >
                       <Trash2 className="w-4 h-4" />
                     </button>
                   </>
                 )}
                 <Dialog.Close asChild>
                   <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors ml-2">
                     <X className="w-5 h-5" />
                   </button>
                 </Dialog.Close>
              </div>
            </div>
            
            {/* Extended Actions Bar (Mock for now per plan 'Recover/Merge/Discard') */}
            {!isEditing && (
              <div className="mt-4 flex items-center gap-2">
                 <button onClick={handleLockToggle} className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium border transition-colors ${locked ? 'bg-primary/10 text-primary border-primary/20 hover:bg-primary/20' : 'bg-secondary text-foreground border-border hover:bg-muted'}`}>
                    <Lock className="w-3 h-3" />
                    {locked ? 'Unlock Task' : 'Lock Task'}
                 </button>
                 <button className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-secondary text-foreground border border-border hover:bg-muted transition-colors">
                    <RotateCcw className="w-3 h-3" />
                    Recover
                 </button>
                 <button className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-secondary text-foreground border border-border hover:bg-muted transition-colors">
                    <GitMerge className="w-3 h-3" />
                    Merge Work
                 </button>
              </div>
            )}

            {/* Edit Form */}
            {isEditing && (
              <div className="mt-4 grid grid-cols-2 gap-4">
                {/* Description */}
                <div className="col-span-2">
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Description</label>
                  <textarea
                    value={formData.description}
                    onChange={(e) => handleFormChange('description', e.target.value)}
                    rows={3}
                    className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50 resize-none"
                    placeholder="Task description..."
                  />
                </div>

                {/* Priority */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Priority</label>
                  <select
                    value={formData.priority}
                    onChange={(e) => handleFormChange('priority', e.target.value)}
                    className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="low">Low</option>
                    <option value="medium">Medium</option>
                    <option value="high">High</option>
                  </select>
                </div>

                {/* Category */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Category</label>
                  <select
                    value={formData.category}
                    onChange={(e) => handleFormChange('category', e.target.value)}
                    className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">None</option>
                    {CATEGORY_OPTIONS.map(opt => (
                      <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                  </select>
                </div>

                {/* Complexity */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Complexity</label>
                  <select
                    value={formData.complexity}
                    onChange={(e) => handleFormChange('complexity', e.target.value)}
                    className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                  >
                    <option value="">None</option>
                    <option value="sm">Small (SM)</option>
                    <option value="md">Medium (MD)</option>
                    <option value="lg">Large (LG)</option>
                  </select>
                </div>

                {/* Tags */}
                <div>
                  <label className="block text-xs font-medium text-muted-foreground mb-1.5">Tags (comma-separated)</label>
                  <input
                    type="text"
                    value={formData.tags}
                    onChange={(e) => handleFormChange('tags', e.target.value)}
                    className="w-full bg-secondary/50 border border-border rounded-lg px-3 py-2 text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                    placeholder="ui, backend, api..."
                  />
                </div>
              </div>
            )}
          </div>

          {/* Tabs */}
          <Tabs.Root defaultValue="overview" className="flex-1 flex flex-col min-h-0 bg-card/50">
            <div className="px-4 border-b border-border bg-card">
              <Tabs.List className="flex gap-6">
                {['Overview', 'Logs', 'Files'].map(tab => (
                  <Tabs.Trigger 
                    key={tab} 
                    value={tab.toLowerCase()}
                    className="group relative py-3 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors
                               data-[state=active]:text-primary outline-none"
                  >
                    {tab}
                    <div className="absolute bottom-0 left-0 right-0 h-0.5 bg-primary scale-x-0 group-data-[state=active]:scale-x-100 transition-transform origin-left" />
                  </Tabs.Trigger>
                ))}
              </Tabs.List>
            </div>

            <div className="flex-1 overflow-auto min-h-0 bg-background/30">
              <Tabs.Content value="overview" className="h-full p-6 outline-none animate-in fade-in slide-in-from-bottom-2 duration-200">
                <TaskOverview task={task} />
              </Tabs.Content>
              
              <Tabs.Content value="logs" className="h-full p-0 outline-none animate-in fade-in slide-in-from-bottom-2 duration-200">
                 <TaskLogs taskId={task.id} projectRoot={projectRoot} isLive={task.status === 'active'} />
              </Tabs.Content>
              
              <Tabs.Content value="files" className="h-full p-6 outline-none animate-in fade-in slide-in-from-bottom-2 duration-200">
                <TaskFiles task={task} projectRoot={projectRoot} />
              </Tabs.Content>
            </div>
          </Tabs.Root>

          {/* Delete Confirmation Dialog */}
          <AlertDialog.Root open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
            <AlertDialog.Portal>
              <AlertDialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[60] animate-in fade-in duration-200" />
              <AlertDialog.Content className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-[60] focus:outline-none">
                <ThemedFrame
                  variant={isKuroryuu ? 'dragon' : 'grunge-square'}
                  size="sm"
                  className="w-[90vw] max-w-md animate-in zoom-in-95 duration-200"
                >
                  <div className="flex items-start gap-4">
                  <div className="flex-shrink-0 w-10 h-10 rounded-full bg-destructive/10 flex items-center justify-center">
                    <AlertTriangle className="w-5 h-5 text-destructive" />
                  </div>
                  <div className="flex-1">
                    <AlertDialog.Title className="text-lg font-semibold text-foreground">
                      Delete Task
                    </AlertDialog.Title>
                    <AlertDialog.Description className="mt-2 text-sm text-muted-foreground">
                      Are you sure you want to delete <span className="font-medium text-foreground">{task.id}</span>? This will permanently remove the task from todo.md. This action cannot be undone.
                    </AlertDialog.Description>
                  </div>
                </div>
                <div className="mt-6 flex justify-end gap-3">
                  <AlertDialog.Cancel asChild>
                    <button className="px-4 py-2 text-sm font-medium bg-secondary text-foreground rounded-lg hover:bg-muted transition-colors">
                      Cancel
                    </button>
                  </AlertDialog.Cancel>
                  <AlertDialog.Action asChild>
                    <button
                      onClick={handleDelete}
                      className="px-4 py-2 text-sm font-medium bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors"
                    >
                      Delete Task
                    </button>
                  </AlertDialog.Action>
                </div>
                </ThemedFrame>
              </AlertDialog.Content>
            </AlertDialog.Portal>
          </AlertDialog.Root>
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
