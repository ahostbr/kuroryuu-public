import React, { useState, useEffect } from 'react';
import type { Task } from '../types/task';
import { User, Clock, Tag, Edit2, Check, X } from 'lucide-react';

interface TaskOverviewProps {
  task: Task;
  onDescriptionChange?: (description: string) => void;
}

export function TaskOverview({ task, onDescriptionChange }: TaskOverviewProps) {
  const [editing, setEditing] = useState(false);
  const [description, setDescription] = useState(task.description || '');

  // Sync local state when task prop changes (file watcher, store refresh)
  useEffect(() => {
    if (!editing) {
      setDescription(task.description || '');
    }
  }, [task.description]);

  const handleSave = () => {
    onDescriptionChange?.(description);
    setEditing(false);
  };

  const handleCancel = () => {
    setDescription(task.description || '');
    setEditing(false);
  };

  return (
    <div className="space-y-6">
      {/* Description */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium text-muted-foreground">Description</h3>
          {!editing && (
            <button
              onClick={() => setEditing(true)}
              className="text-xs flex items-center gap-1 text-muted-foreground hover:text-foreground transition-colors"
            >
              <Edit2 className="w-3 h-3" />
              Edit
            </button>
          )}
        </div>
        <div className="bg-background/50 p-4 rounded-lg border border-border/50 min-h-[100px]">
          {editing ? (
            <div className="space-y-2">
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full h-24 bg-card border border-border rounded p-2 text-sm text-foreground resize-none focus:outline-none focus:border-primary"
                placeholder="Add a description..."
              />
              <div className="flex items-center gap-2">
                <button
                  onClick={handleSave}
                  className="flex items-center gap-1 px-3 py-1 bg-primary text-black rounded text-xs font-medium hover:bg-primary"
                >
                  <Check className="w-3 h-3" />
                  Save
                </button>
                <button
                  onClick={handleCancel}
                  className="flex items-center gap-1 px-3 py-1 bg-secondary text-foreground rounded text-xs font-medium hover:bg-muted"
                >
                  <X className="w-3 h-3" />
                  Cancel
                </button>
              </div>
            </div>
          ) : task.description ? (
            <p className="text-sm text-foreground whitespace-pre-wrap leading-relaxed">{task.description}</p>
          ) : (
            <span className="text-sm text-muted-foreground italic">No description provided. Click Edit to add one.</span>
          )}
        </div>
      </div>
      
      {/* Metadata Grid */}
      <div className="grid grid-cols-2 gap-x-8 gap-y-4 p-4 bg-background/30 rounded-lg border border-border/30">
        <div className="flex items-center gap-3 text-sm">
          <User className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground w-20">Assignee:</span>
          {task.assignee ? (
            <span className="text-blue-400 bg-blue-500/10 px-2 py-0.5 rounded text-xs">{task.assignee}</span>
          ) : (
             <span className="text-muted-foreground italic">Unassigned</span>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground w-24 pl-7">Priority:</span>
          {task.priority ? (
            <span className={`px-2 py-0.5 rounded text-xs uppercase font-bold tracking-wider ${
              task.priority === 'high' ? 'bg-red-500/10 text-red-500' :
              task.priority === 'medium' ? 'bg-primary/10 text-primary' :
              'bg-secondary text-muted-foreground'
            }`}>
              {task.priority}
            </span>
          ) : (
             <span className="text-muted-foreground">-</span>
          )}
        </div>

        <div className="flex items-center gap-3 text-sm">
          <Clock className="w-4 h-4 text-muted-foreground" />
          <span className="text-muted-foreground w-20">Created:</span>
          <span className="text-foreground font-mono text-xs">
            {task.createdAt ? new Date(task.createdAt).toLocaleDateString() : '-'}
          </span>
        </div>

        <div className="flex items-center gap-3 text-sm">
          <span className="text-muted-foreground w-24 pl-7">Updated:</span>
          <span className="text-foreground font-mono text-xs">
            {task.updatedAt ? new Date(task.updatedAt).toLocaleDateString() : '-'}
          </span>
        </div>
      </div>
      
      {/* Tags */}
      <div>
        <h3 className="text-sm font-medium text-muted-foreground mb-2">Tags</h3>
        <div className="flex flex-wrap gap-2">
          {task.tags && task.tags.length > 0 ? (
            task.tags.map(tag => (
              <span 
                key={tag}
                className="inline-flex items-center gap-1.5 px-2.5 py-1 
                           text-xs bg-secondary/60 rounded-md text-foreground border border-border/50 hover:bg-secondary hover:border-muted-foreground transition-colors cursor-default"
              >
                <Tag className="w-3 h-3 text-muted-foreground" />
                {tag}
              </span>
            ))
          ) : (
            <span className="text-sm text-muted-foreground italic">No tags.</span>
          )}
        </div>
      </div>
    </div>
  );
}
