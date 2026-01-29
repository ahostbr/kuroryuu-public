/**
 * InitializeProjectDialog - Dialog for initializing Kuroryuu in a project
 */
import React, { useState } from 'react';
import {
  FolderOpen,
  Folder,
  FileCode,
  FileText,
  GitBranch,
  Brain,
  Check,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  X,
} from 'lucide-react';
import * as Dialog from '@radix-ui/react-dialog';
import { Button } from '../ui/button';
import { useProjectStore, useInitDialogOpen, useInitProgress } from '../../stores/project-store';
import { InitializationOptions, DEFAULT_INIT_OPTIONS } from '../../types/project';
import { cn } from '../../lib/utils';
import { ThemedFrame } from '../ui/ThemedFrame';
import { useIsThemedStyle } from '../../hooks/useTheme';

interface OptionToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  icon: React.ReactNode;
  label: string;
  description: string;
}

function OptionToggle({ checked, onChange, icon, label, description }: OptionToggleProps) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'flex items-start gap-3 p-4 rounded-xl border-2 transition-all duration-200 text-left w-full',
        checked
          ? 'border-primary/30 bg-primary/5'
          : 'border-border bg-card/50 hover:border-border'
      )}
    >
      <div
        className={cn(
          'w-5 h-5 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all',
          checked ? 'border-primary bg-primary' : 'border-muted bg-transparent'
        )}
      >
        {checked && <Check className="w-3 h-3 text-background" />}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2 mb-1">
          {icon}
          <span className="font-medium text-white">{label}</span>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
    </button>
  );
}

export function InitializeProjectDialog() {
  const { isKuroryuu, isGrunge } = useIsThemedStyle();
  const initDialogOpen = useInitDialogOpen();
  const initProgress = useInitProgress();
  const { closeInitDialog, initializeProject } = useProjectStore();

  const [projectPath, setProjectPath] = useState('');
  const [options, setOptions] = useState<InitializationOptions>(DEFAULT_INIT_OPTIONS);

  const handleBrowse = async () => {
    try {
      const result = await window.electronAPI?.dialog?.showOpenDialog({
        title: 'Select Project Folder',
        properties: ['openDirectory'],
      });

      if (result && !result.canceled && result.filePaths.length > 0) {
        setProjectPath(result.filePaths[0]);
      }
    } catch (error) {
      console.error('Failed to open folder dialog:', error);
    }
  };

  const handleInitialize = () => {
    if (!projectPath) return;
    initializeProject(projectPath, options);
  };

  const updateOption = (key: keyof InitializationOptions, value: boolean) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const isInitializing = initProgress && !initProgress.isComplete && !initProgress.error;
  const isComplete = initProgress?.isComplete;
  const hasError = initProgress?.error;

  return (
    <Dialog.Root open={initDialogOpen} onOpenChange={(open) => !open && closeInitDialog()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-full max-w-lg z-50">
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="lg"
            className="overflow-hidden max-h-[85vh] flex flex-col"
          >
            {/* Header */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-border">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
                <Folder className="w-5 h-5 text-primary" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-semibold text-white">
                  Initialize Kuroryuu
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  Set up AI-powered development for this project
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button className="p-2 rounded-lg text-muted-foreground hover:text-white hover:bg-secondary transition-colors">
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0 p-6">
            {!isInitializing && !isComplete && !hasError ? (
              // Configuration view
              <>
                {/* Project path */}
                <div className="mb-6">
                  <label className="block text-sm font-medium text-foreground mb-2">
                    Project Location
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={projectPath}
                      onChange={(e) => setProjectPath(e.target.value)}
                      placeholder="Select a folder..."
                      className="flex-1 px-3 py-2 rounded-lg bg-card border border-border text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
                    />
                    <Button
                      onClick={handleBrowse}
                      variant="outline"
                      className="border-border hover:bg-secondary"
                    >
                      <FolderOpen className="w-4 h-4" />
                    </Button>
                  </div>
                </div>

                {/* Options */}
                <div className="space-y-3 mb-6">
                  <h3 className="text-sm font-medium text-muted-foreground mb-3">Initialization Options</h3>

                  <OptionToggle
                    checked={options.createKuroryuu}
                    onChange={(v) => updateOption('createKuroryuu', v)}
                    icon={<Folder className="w-4 h-4 text-primary" />}
                    label="Create .kuroryuu folder"
                    description="Configuration and state files for Kuroryuu"
                  />

                  <OptionToggle
                    checked={options.copyFrameworkFiles}
                    onChange={(v) => updateOption('copyFrameworkFiles', v)}
                    icon={<FileCode className="w-4 h-4 text-blue-400" />}
                    label="Copy framework files"
                    description="Templates and boilerplate for AI-powered development"
                  />

                  <OptionToggle
                    checked={options.setupSpecsDirectory}
                    onChange={(v) => updateOption('setupSpecsDirectory', v)}
                    icon={<FileText className="w-4 h-4 text-purple-400" />}
                    label="Set up specs directory"
                    description="Structure for storing feature specifications"
                  />

                  <OptionToggle
                    checked={options.initializeGit}
                    onChange={(v) => updateOption('initializeGit', v)}
                    icon={<GitBranch className="w-4 h-4 text-orange-400" />}
                    label="Initialize git repository"
                    description="Create git repo if not already present"
                  />

                  <OptionToggle
                    checked={options.enableMemory}
                    onChange={(v) => updateOption('enableMemory', v)}
                    icon={<Brain className="w-4 h-4 text-pink-400" />}
                    label="Enable AI memory"
                    description="Connect Graphiti for persistent context"
                  />
                </div>

                {/* Info box */}
                <div className="p-4 rounded-lg bg-card/50 border border-border mb-6">
                  <p className="text-sm text-muted-foreground">
                    <span className="text-foreground">What this does:</span> Creates the necessary
                    configuration files and directory structure for Kuroryuu to manage tasks
                    and interact with your codebase.
                  </p>
                </div>
              </>
            ) : isInitializing ? (
              // Progress view
              <div className="py-8 text-center">
                <Loader2 className="w-12 h-12 text-primary animate-spin mx-auto mb-4" />
                <p className="text-white font-medium mb-2">{initProgress.currentTask}</p>
                <div className="w-full h-2 bg-secondary rounded-full overflow-hidden mb-2">
                  <div
                    className="h-full bg-primary transition-all duration-300"
                    style={{ width: `${(initProgress.step / initProgress.totalSteps) * 100}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Step {initProgress.step} of {initProgress.totalSteps}
                </p>
              </div>
            ) : isComplete ? (
              // Success view
              <div className="py-8 text-center">
                <CheckCircle2 className="w-12 h-12 text-green-400 mx-auto mb-4" />
                <p className="text-white font-medium mb-2">Project Initialized!</p>
                <p className="text-sm text-muted-foreground">
                  Kuroryuu is ready to help you build.
                </p>
              </div>
            ) : hasError ? (
              // Error view
              <div className="py-8 text-center">
                <AlertTriangle className="w-12 h-12 text-red-400 mx-auto mb-4" />
                <p className="text-white font-medium mb-2">Initialization Failed</p>
                <p className="text-sm text-red-400">{initProgress.error}</p>
              </div>
            ) : null}
          </div>

          {/* Footer */}
          {!isInitializing && !isComplete && (
            <div className="flex-shrink-0 flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
              <Button
                variant="ghost"
                onClick={closeInitDialog}
                className="text-muted-foreground hover:text-white"
              >
                Skip
              </Button>
              <Button
                onClick={handleInitialize}
                disabled={!projectPath}
                className="bg-primary hover:bg-[#c5c76a] text-background disabled:opacity-50"
              >
                Initialize Project
              </Button>
            </div>
          )}
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
