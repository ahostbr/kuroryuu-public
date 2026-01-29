import React, { useState } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, ArrowRight, ArrowLeft, Check, Brain } from 'lucide-react';
import { useTaskStore } from '../stores/task-store';
import { Task } from '../types/task';
import { toast } from './ui/toast';
import { ThemedFrame } from './ui/ThemedFrame';
import { useIsThemedStyle } from '../hooks/useTheme';

interface TaskWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

type WizardStep = 'define' | 'review';

export function TaskWizard({ open, onOpenChange }: TaskWizardProps) {
  const [step, setStep] = useState<WizardStep>('define');
  const [formData, setFormData] = useState({
    title: '',
    description: '',
    type: 'feature',
    priority: 'medium',
    contextFiles: [] as string[],
    agent: ''
  });

  const { createTask } = useTaskStore();
  const { isKuroryuu, isGrunge } = useIsThemedStyle();

  const handleNext = () => {
    if (step === 'define') setStep('review');
  };

  const handleBack = () => {
    if (step === 'review') setStep('define');
  };

  const handleSubmit = async () => {
    const newTask: Task = {
      id: `T${Date.now().toString(36).toUpperCase()}`, // T + timestamp-based ID
      title: formData.title,
      description: formData.description,
      status: 'backlog',
      priority: formData.priority as Task['priority'],
      category: formData.type as Task['category'],
      tags: formData.agent ? [formData.type, formData.agent] : [formData.type],
      contextFiles: formData.contextFiles.length > 0 ? formData.contextFiles : undefined,
      assignee: formData.agent || undefined,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await createTask(newTask);
    toast.success(`Task ${newTask.id} created`);
    onOpenChange(false);
    // Reset form
    setStep('define');
    setFormData({
      title: '',
      description: '',
      type: 'feature',
      priority: 'medium',
      contextFiles: [],
      agent: ''
    });
  };

  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-50 focus:outline-none">
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="lg"
            className="w-[90vw] max-w-2xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
            contentClassName="flex-1 flex flex-col min-h-0"
          >
            {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border bg-card">
            <div>
               <Dialog.Title className="text-lg font-bold text-foreground">
                  New Task
               </Dialog.Title>
               <div className="flex items-center gap-2 mt-1">
                  {['define', 'review'].map((s, i) => (
                     <div key={s} className={`h-1.5 w-8 rounded-full transition-colors ${
                        ['define', 'review'].indexOf(step) >= i ? 'bg-primary' : 'bg-secondary'
                     }`} />
                  ))}
                  <span className="text-xs text-muted-foreground uppercase font-medium ml-2">
                     Step {['define', 'review'].indexOf(step) + 1} of 2
                  </span>
               </div>
            </div>
            <Dialog.Close asChild>
              <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors">
                <X className="w-5 h-5" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="p-6 h-[400px] overflow-y-auto">
            
            {step === 'define' && (
               <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div>
                     <label className="block text-sm font-medium text-muted-foreground mb-1">Title</label>
                     <input 
                        className="w-full bg-background border border-border rounded p-2 text-foreground focus:border-primary/50 focus:outline-none"
                        placeholder="e.g. Implement user authentication"
                        value={formData.title}
                        onChange={e => setFormData({...formData, title: e.target.value})}
                        autoFocus
                     />
                  </div>
                  <div>
                     <label className="block text-sm font-medium text-muted-foreground mb-1">Description</label>
                     <textarea 
                        className="w-full h-32 bg-background border border-border rounded p-2 text-foreground focus:border-primary/50 focus:outline-none resize-none"
                        placeholder="Describe the task in detail..."
                        value={formData.description}
                        onChange={e => setFormData({...formData, description: e.target.value})}
                     />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                     <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Type</label>
                        <select 
                           className="w-full bg-background border border-border rounded p-2 text-foreground focus:border-primary/50 focus:outline-none"
                           value={formData.type}
                           onChange={e => setFormData({...formData, type: e.target.value})}
                        >
                           <option value="feature">Feature</option>
                           <option value="bug">Bug</option>
                           <option value="chore">Chore</option>
                           <option value="refactor">Refactor</option>
                        </select>
                     </div>
                     <div>
                        <label className="block text-sm font-medium text-muted-foreground mb-1">Priority</label>
                        <select 
                           className="w-full bg-background border border-border rounded p-2 text-foreground focus:border-primary/50 focus:outline-none"
                           value={formData.priority}
                           onChange={e => setFormData({...formData, priority: e.target.value})}
                        >
                           <option value="low">Low</option>
                           <option value="medium">Medium</option>
                           <option value="high">High</option>
                           <option value="urgent">Urgent</option>
                        </select>
                     </div>
                  </div>
               </div>
            )}

            {step === 'review' && (
               <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="bg-background rounded-lg p-4 border border-border">
                     <h3 className="text-sm font-medium text-muted-foreground uppercase mb-4">Task Summary</h3>
                     <div className="space-y-3">
                        <div>
                           <div className="text-xs text-muted-foreground">Title</div>
                           <div className="text-foreground font-medium">{formData.title}</div>
                        </div>
                        <div>
                           <div className="text-xs text-muted-foreground">Description</div>
                           <div className="text-foreground text-sm whitespace-pre-wrap">{formData.description || 'No description provided.'}</div>
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                           <div>
                              <div className="text-xs text-muted-foreground">Type</div>
                              <div className="text-foreground capitalize">{formData.type}</div>
                           </div>
                           <div>
                              <div className="text-xs text-muted-foreground">Priority</div>
                              <div className="text-foreground capitalize">{formData.priority}</div>
                           </div>
                        </div>
                     </div>
                  </div>
                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card p-3 rounded border border-border">
                     <Brain className="w-4 h-4 text-primary" />
                     Task will be added to backlog and saved to todo.md
                  </div>
               </div>
            )}

          </div>

          {/* Footer */}
          <div className="p-4 border-t border-border bg-card flex justify-between">
             <button
               disabled={step === 'define'}
               onClick={handleBack}
               className="px-4 py-2 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
             >
                <div className="flex items-center gap-2">
                   <ArrowLeft className="w-4 h-4" />
                   Back
                </div>
             </button>
             
             {step !== 'review' ? (
                <button
                  disabled={!formData.title}
                  onClick={handleNext}
                  className="px-4 py-2 bg-foreground hover:bg-white text-background rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                   <div className="flex items-center gap-2">
                      Next
                      <ArrowRight className="w-4 h-4" />
                   </div>
                </button>
             ) : (
                <button
                  onClick={handleSubmit}
                  className="px-4 py-2 bg-primary hover:bg-primary text-black rounded font-medium transition-colors"
                >
                   <div className="flex items-center gap-2">
                      Create Task
                      <Check className="w-4 h-4" />
                   </div>
                </button>
             )}
          </div>
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
