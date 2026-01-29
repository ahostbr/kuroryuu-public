/**
 * ProjectSelector - Dropdown for switching between projects
 */
import React from 'react';
import {
  ChevronDown,
  FolderOpen,
  Plus,
  Check,
  Trash2,
  ExternalLink,
  Settings,
} from 'lucide-react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useProjectStore, useProjects, useActiveProject } from '../../stores/project-store';
import { cn } from '../../lib/utils';

interface ProjectSelectorProps {
  className?: string;
}

export function ProjectSelector({ className }: ProjectSelectorProps) {
  const projects = useProjects();
  const activeProject = useActiveProject();
  const { setActiveProject, removeProject, openInitDialog } = useProjectStore();

  const handleOpenFolder = () => {
    // In a real implementation, this would use Electron's dialog API
    // and then call openInitDialog or addProject
    openInitDialog();
  };

  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          className={cn(
            'flex items-center gap-2 px-3 py-2 rounded-lg bg-card border border-border hover:border-border transition-colors',
            className
          )}
        >
          <FolderOpen className="w-4 h-4 text-primary" />
          <span className="text-sm font-medium text-white truncate max-w-[150px]">
            {activeProject?.name || 'No Project'}
          </span>
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        </button>
      </DropdownMenu.Trigger>

      <DropdownMenu.Portal>
        <DropdownMenu.Content
          align="start"
          sideOffset={4}
          className="min-w-[240px] bg-card border border-border rounded-xl shadow-xl overflow-hidden z-50"
        >
          {/* Project list */}
          {projects.length > 0 && (
            <>
              <div className="px-2 py-1.5">
                <span className="text-xs text-muted-foreground uppercase tracking-wider px-2">
                  Recent Projects
                </span>
              </div>
              
              {projects
                .sort((a, b) => b.lastOpenedAt - a.lastOpenedAt)
                .slice(0, 5)
                .map((project) => (
                  <DropdownMenu.Item
                    key={project.id}
                    onSelect={() => setActiveProject(project.id)}
                    className="flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer outline-none hover:bg-secondary focus:bg-secondary"
                  >
                    <FolderOpen className="w-4 h-4 text-muted-foreground" />
                    <div className="flex-1 min-w-0">
                      <span className="text-sm text-white block truncate">{project.name}</span>
                      <span className="text-xs text-muted-foreground truncate block">{project.path}</span>
                    </div>
                    {project.id === activeProject?.id && (
                      <Check className="w-4 h-4 text-primary" />
                    )}
                  </DropdownMenu.Item>
                ))}
              
              <DropdownMenu.Separator className="h-px bg-secondary my-1" />
            </>
          )}

          {/* Actions */}
          <DropdownMenu.Item
            onSelect={handleOpenFolder}
            className="flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer outline-none hover:bg-secondary focus:bg-secondary"
          >
            <Plus className="w-4 h-4 text-primary" />
            <span className="text-sm text-white">New Project</span>
          </DropdownMenu.Item>

          <DropdownMenu.Item
            onSelect={handleOpenFolder}
            className="flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer outline-none hover:bg-secondary focus:bg-secondary"
          >
            <FolderOpen className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-white">Open Folder...</span>
          </DropdownMenu.Item>

          {activeProject && (
            <>
              <DropdownMenu.Separator className="h-px bg-secondary my-1" />

              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer outline-none hover:bg-secondary focus:bg-secondary"
              >
                <ExternalLink className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-white">Open in Explorer</span>
              </DropdownMenu.Item>

              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer outline-none hover:bg-secondary focus:bg-secondary"
              >
                <Settings className="w-4 h-4 text-muted-foreground" />
                <span className="text-sm text-white">Project Settings</span>
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="h-px bg-secondary my-1" />

              <DropdownMenu.Item
                onSelect={() => removeProject(activeProject.id)}
                className="flex items-center gap-2 px-3 py-2 mx-1 rounded-lg cursor-pointer outline-none hover:bg-red-500/10 focus:bg-red-500/10 text-red-400"
              >
                <Trash2 className="w-4 h-4" />
                <span className="text-sm">Remove from List</span>
              </DropdownMenu.Item>
            </>
          )}

          <div className="h-1" />
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
