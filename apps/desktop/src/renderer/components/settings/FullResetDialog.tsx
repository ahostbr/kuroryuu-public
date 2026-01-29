/**
 * Full Reset Dialog
 * Comprehensive app reset with backup option and progress indication
 */

import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  AlertTriangle,
  Archive,
  Trash2,
  Settings,
  Terminal,
  Database,
  Loader2,
  CheckCircle,
  Bot,
} from 'lucide-react';
import { useState, useEffect } from 'react';
import { toast } from '../ui/toaster';
import {
  exportLocalStorageBackup,
  clearAllLocalStorage,
  clearAllIndexedDB,
  getLocalStorageInfo,
  getIndexedDBInfo,
} from '../../lib/storage-reset';
import { ThemedFrame } from '../ui/ThemedFrame';
import { useIsThemedStyle } from '../../hooks/useTheme';
import { useAgentConfigStore } from '../../stores/agent-config-store';
import { useSubAgentConfigStore } from '../../stores/subagent-config-store';
import { useKuroryuuDialog } from '../../hooks/useKuroryuuDialog';

interface FullResetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ResetOptions {
  createBackup: boolean;
  resetUserSettings: boolean;
  resetProjectSettings: boolean;
  clearPTY: boolean;
  clearLocalStorage: boolean;
  clearIndexedDB: boolean;
}

type ResetStep = 'options' | 'confirm' | 'progress' | 'complete';

function Checkbox({
  checked,
  onChange,
  label,
  description,
  disabled,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
}) {
  return (
    <label className={`flex items-start gap-3 cursor-pointer ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}>
      <div className="pt-0.5">
        <input
          type="checkbox"
          checked={checked}
          onChange={(e) => !disabled && onChange(e.target.checked)}
          disabled={disabled}
          className="w-4 h-4 rounded border-border bg-secondary accent-primary cursor-pointer disabled:cursor-not-allowed"
        />
      </div>
      <div className="flex-1">
        <span className="text-sm text-foreground">{label}</span>
        {description && (
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        )}
      </div>
    </label>
  );
}

export function FullResetDialog({ open, onOpenChange }: FullResetDialogProps) {
  const { isKuroryuu, isGrunge } = useIsThemedStyle();
  const [step, setStep] = useState<ResetStep>('options');
  const [options, setOptions] = useState<ResetOptions>({
    createBackup: true, // Default to backup enabled
    resetUserSettings: true,
    resetProjectSettings: true,
    clearPTY: true,
    clearLocalStorage: true,
    clearIndexedDB: true,
  });
  const [progress, setProgress] = useState<string[]>([]);
  const [backupPaths, setBackupPaths] = useState<string[]>([]);
  const [isResettingAgents, setIsResettingAgents] = useState(false);
  const { confirmDestructive } = useKuroryuuDialog();

  const { resetSetup: resetAgentConfig } = useAgentConfigStore();
  const [storageInfo, setStorageInfo] = useState<{
    localStorage: { key: string; size: number; exists: boolean }[];
    indexedDB: { name: string; exists: boolean }[];
  }>({ localStorage: [], indexedDB: [] });

  // Load storage info when dialog opens
  useEffect(() => {
    if (open) {
      setStep('options');
      setProgress([]);
      setBackupPaths([]);
      loadStorageInfo();
    }
  }, [open]);

  const loadStorageInfo = async () => {
    const localStorageData = getLocalStorageInfo();
    const indexedDBData = await getIndexedDBInfo();
    setStorageInfo({
      localStorage: localStorageData,
      indexedDB: indexedDBData,
    });
  };

  const handleResetAgentsOnly = async () => {
    const yes = await confirmDestructive({
      title: 'Reset Agents',
      message: 'Reset agent configuration? This will stop all agents, clear all terminals, and show the setup wizard.',
      confirmLabel: 'Reset Agents',
      cancelLabel: 'Cancel',
    });
    if (!yes) return;

    setIsResettingAgents(true);
    try {
      // 1. Force save empty terminal state FIRST to prevent race condition
      await window.electronAPI?.pty?.saveTerminalState?.([]);

      // 2. Kill all daemon PTYs and clear persistence via main process
      await window.electronAPI?.pty?.resetAll?.();

      // 3. Clear sub-agent configs
      useSubAgentConfigStore.getState().clearAll();

      // 4. Reset agent config (stops heartbeats, clears gateway)
      resetAgentConfig();

      onOpenChange(false);

      // 5. Force reload to show wizard
      window.location.reload();
    } catch (error) {
      console.error('[Reset Agents] Failed to fully reset:', error);
      toast.error('Failed to reset agents');
      // Still try to reset agent config and reload
      resetAgentConfig();
      onOpenChange(false);
      window.location.reload();
    }
  };

  const handleOptionChange = (key: keyof ResetOptions) => (value: boolean) => {
    setOptions((prev) => ({ ...prev, [key]: value }));
  };

  const handleContinue = () => {
    setStep('confirm');
  };

  const handleReset = async () => {
    setStep('progress');
    const logs: string[] = [];
    const addLog = (msg: string) => {
      logs.push(msg);
      setProgress([...logs]);
    };

    try {
      // 1. Export localStorage backup if requested
      if (options.createBackup && options.clearLocalStorage) {
        addLog('Exporting localStorage backup...');
        const localStorageData = exportLocalStorageBackup();
        const timestamp = new Date().toISOString().replace(/[:-]/g, '').slice(0, 15);
        const filename = `localStorage_${timestamp}.bak.json`;
        const result = await window.electronAPI?.settings?.exportLocalStorage?.(localStorageData, filename);
        if (result?.path) {
          addLog(`Saved localStorage backup: ${result.path}`);
        }
      }

      // 2. Call main process full reset
      addLog('Initiating full reset...');
      const result = await window.electronAPI?.settings?.fullReset?.({
        createBackup: options.createBackup,
        resetUserSettings: options.resetUserSettings,
        resetProjectSettings: options.resetProjectSettings,
        clearPTY: options.clearPTY,
        clearLocalStorage: options.clearLocalStorage,
        clearIndexedDB: options.clearIndexedDB,
      });

      if (result?.backupPaths) {
        setBackupPaths(result.backupPaths);
        result.backupPaths.forEach((p: string) => addLog(`Backup created: ${p}`));
      }

      if (!result?.ok) {
        throw new Error(result?.error || 'Reset failed');
      }

      // 3. Clear browser storage (renderer side)
      // Note: The main process sends settings:clearBrowserStorage event
      // which is handled by App.tsx, but we do it here too for immediate effect
      if (options.clearLocalStorage) {
        addLog('Clearing localStorage...');
        clearAllLocalStorage();
      }

      if (options.clearIndexedDB) {
        addLog('Clearing IndexedDB...');
        await clearAllIndexedDB();
      }

      addLog('Reset complete!');
      setStep('complete');

      // Reload after short delay to show completion
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error) {
      addLog(`Error: ${error}`);
      toast.error(`Reset failed: ${error}`);
      // Stay on progress screen to show error
    }
  };

  const handleClose = () => {
    if (step === 'progress') return; // Don't allow closing during reset
    onOpenChange(false);
  };

  // Calculate what will be affected
  const activeLocalStorageKeys = storageInfo.localStorage.filter(k => k.exists).length;
  const activeIndexedDBs = storageInfo.indexedDB.filter(d => d.exists).length;

  return (
    <Dialog.Root open={open} onOpenChange={handleClose}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="md"
            className="w-[500px] max-h-[85vh] overflow-hidden flex flex-col"
            contentClassName="flex-1 flex flex-col min-h-0"
          >
            {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0 bg-destructive/5">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-destructive/20 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-destructive" />
              </div>
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  Full App Reset
                </Dialog.Title>
                <Dialog.Description className="text-sm text-muted-foreground">
                  {step === 'options' && 'Select what to reset'}
                  {step === 'confirm' && 'Confirm your selections'}
                  {step === 'progress' && 'Resetting...'}
                  {step === 'complete' && 'Reset complete'}
                </Dialog.Description>
              </div>
            </div>
            {step !== 'progress' && step !== 'complete' && (
              <Dialog.Close className="p-2 hover:bg-secondary rounded-lg transition-colors">
                <X className="w-5 h-5 text-muted-foreground" />
              </Dialog.Close>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0 p-4">
            {step === 'options' && (
              <div className="space-y-4">
                {/* Quick Action: Reset Agents Only */}
                <div className="p-3 bg-secondary border border-border rounded-lg">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="p-2 bg-primary/20 rounded-lg">
                        <Bot className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <h4 className="text-sm font-medium text-foreground">Reset Agents Only</h4>
                        <p className="text-xs text-muted-foreground">Stop all agents, clear terminals, show setup wizard</p>
                      </div>
                    </div>
                    <button
                      onClick={handleResetAgentsOnly}
                      disabled={isResettingAgents}
                      className="px-3 py-1.5 text-sm bg-primary/20 text-primary border border-primary/30 rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50"
                    >
                      {isResettingAgents ? 'Resetting...' : 'Reset Agents'}
                    </button>
                  </div>
                </div>

                <div className="relative">
                  <div className="absolute inset-0 flex items-center">
                    <div className="w-full border-t border-border" />
                  </div>
                  <div className="relative flex justify-center text-xs">
                    <span className="px-2 bg-background text-muted-foreground">or customize full reset below</span>
                  </div>
                </div>

                {/* Backup Option */}
                <div className="p-3 bg-primary/10 border border-primary/30 rounded-lg">
                  <Checkbox
                    checked={options.createBackup}
                    onChange={handleOptionChange('createBackup')}
                    label="Create backup before reset (Recommended)"
                    description="Save current settings to timestamped .bak files for recovery"
                  />
                </div>

                {/* What to Reset */}
                <div className="space-y-3">
                  <h4 className="text-sm font-medium text-foreground flex items-center gap-2">
                    <Settings className="w-4 h-4" />
                    What to reset:
                  </h4>

                  <div className="space-y-2 pl-2">
                    <Checkbox
                      checked={options.resetUserSettings}
                      onChange={handleOptionChange('resetUserSettings')}
                      label="User settings"
                      description="Theme, UI scale, terminal font, preferences"
                    />
                    <Checkbox
                      checked={options.resetProjectSettings}
                      onChange={handleOptionChange('resetProjectSettings')}
                      label="Project settings"
                      description="Audio, agents, onboarding, graphiti config"
                    />
                    <Checkbox
                      checked={options.clearPTY}
                      onChange={handleOptionChange('clearPTY')}
                      label="Terminal sessions"
                      description="Kill all PTY processes and clear session data"
                    />
                    <Checkbox
                      checked={options.clearLocalStorage}
                      onChange={handleOptionChange('clearLocalStorage')}
                      label="Browser storage (localStorage)"
                      description={`Conversations, projects, domain config, PRDs (${activeLocalStorageKeys} keys)`}
                    />
                    <Checkbox
                      checked={options.clearIndexedDB}
                      onChange={handleOptionChange('clearIndexedDB')}
                      label="Event archives (IndexedDB)"
                      description={`Traffic and graphiti event data (${activeIndexedDBs} databases)`}
                    />
                  </div>
                </div>

                {/* Preview */}
                <div className="mt-4 p-3 bg-secondary/50 border border-border rounded-lg">
                  <h4 className="text-xs font-medium text-muted-foreground mb-2">Preview of changes:</h4>
                  <ul className="text-xs text-muted-foreground space-y-1">
                    {options.resetUserSettings && <li>• settings.json will be reset to defaults</li>}
                    {options.resetProjectSettings && <li>• app-settings.json will be reset to defaults</li>}
                    {options.clearPTY && <li>• All terminal sessions will be terminated</li>}
                    {options.clearLocalStorage && <li>• {activeLocalStorageKeys} localStorage keys will be cleared</li>}
                    {options.clearIndexedDB && <li>• {activeIndexedDBs} IndexedDB databases will be deleted</li>}
                    <li className="text-primary">• App will reload and show the startup wizard</li>
                  </ul>
                </div>
              </div>
            )}

            {step === 'confirm' && (
              <div className="space-y-4">
                <div className="p-4 bg-destructive/10 border border-destructive/30 rounded-lg">
                  <p className="text-sm text-foreground font-medium mb-2">
                    Are you sure you want to reset?
                  </p>
                  <p className="text-sm text-muted-foreground">
                    This action cannot be undone{options.createBackup ? ' (backups will be created)' : ''}.
                    The app will reload after reset.
                  </p>
                </div>

                <div className="space-y-2">
                  <h4 className="text-sm font-medium text-foreground">Summary:</h4>
                  <ul className="text-sm text-muted-foreground space-y-1">
                    {options.createBackup && (
                      <li className="flex items-center gap-2 text-primary">
                        <Archive className="w-3 h-3" />
                        Backups will be created
                      </li>
                    )}
                    {options.resetUserSettings && (
                      <li className="flex items-center gap-2">
                        <Trash2 className="w-3 h-3" />
                        User settings reset
                      </li>
                    )}
                    {options.resetProjectSettings && (
                      <li className="flex items-center gap-2">
                        <Trash2 className="w-3 h-3" />
                        Project settings reset
                      </li>
                    )}
                    {options.clearPTY && (
                      <li className="flex items-center gap-2">
                        <Terminal className="w-3 h-3" />
                        Terminal sessions cleared
                      </li>
                    )}
                    {options.clearLocalStorage && (
                      <li className="flex items-center gap-2">
                        <Database className="w-3 h-3" />
                        localStorage cleared
                      </li>
                    )}
                    {options.clearIndexedDB && (
                      <li className="flex items-center gap-2">
                        <Database className="w-3 h-3" />
                        IndexedDB cleared
                      </li>
                    )}
                  </ul>
                </div>
              </div>
            )}

            {step === 'progress' && (
              <div className="space-y-4">
                <div className="flex items-center justify-center py-4">
                  <Loader2 className="w-8 h-8 text-primary animate-spin" />
                </div>
                <div className="space-y-1 font-mono text-xs bg-secondary/50 p-3 rounded-lg max-h-40 overflow-y-auto">
                  {progress.map((log, i) => (
                    <div key={i} className="text-muted-foreground">
                      {log}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {step === 'complete' && (
              <div className="space-y-4 text-center py-4">
                <CheckCircle className="w-12 h-12 text-green-500 mx-auto" />
                <div>
                  <p className="text-lg font-medium text-foreground">Reset Complete!</p>
                  <p className="text-sm text-muted-foreground mt-1">
                    The app will reload in a moment...
                  </p>
                </div>
                {backupPaths.length > 0 && (
                  <div className="text-left p-3 bg-secondary/50 rounded-lg">
                    <p className="text-xs font-medium text-muted-foreground mb-2">Backups created:</p>
                    {backupPaths.map((p, i) => (
                      <p key={i} className="text-xs text-muted-foreground truncate">{p}</p>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          {step !== 'progress' && step !== 'complete' && (
            <div className="flex items-center justify-end gap-3 p-4 border-t border-border flex-shrink-0">
              {step === 'options' && (
                <>
                  <button
                    onClick={handleClose}
                    className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Cancel
                  </button>
                  <button
                    onClick={handleContinue}
                    disabled={!options.resetUserSettings && !options.resetProjectSettings && !options.clearPTY && !options.clearLocalStorage && !options.clearIndexedDB}
                    className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                  </button>
                </>
              )}
              {step === 'confirm' && (
                <>
                  <button
                    onClick={() => setStep('options')}
                    className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    Back
                  </button>
                  <button
                    onClick={handleReset}
                    className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors text-sm font-medium"
                  >
                    Reset Everything
                  </button>
                </>
              )}
            </div>
          )}
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
