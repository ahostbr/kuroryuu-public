import { useState, useEffect, useCallback } from 'react';
import { KanbanBoard } from './components/KanbanBoard';
import { TerminalGrid } from './components/TerminalGrid';
import { Inspector } from './components/Inspector';
import { StatusBar } from './components/StatusBar';
import { TaskDetailModal } from './components/TaskDetailModal';
import { TaskWizard } from './components/TaskWizard';
import { ErrorBoundary } from './components/ui/error-boundary';
import { ToastContainer, toast } from './components/ui/toast';
import { KuroryuuDialogProvider, showDestructive, showConfirm, showAlert } from './components/ui/dialog';  // Genmu Spirit Dialog System
import { Sidebar, View } from './components/Sidebar';
import { WelcomeScreen } from './components/WelcomeScreen';
import { CommandCenter } from './components/command-center';
// NOTE: Insights.tsx was renamed to _old_Insights_not_in_use.tsx
// The 'insights' route uses KuroryuuDesktopAssistantPanel instead (line 330)
import { KuroryuuDesktopAssistantPanel } from './components/code-editor';
import { Ideation } from './components/ideation/Ideation';
import { Changelog } from './components/changelog/Changelog';
import { Context } from './components/context/Context';
import { Worktrees } from './components/Worktrees';
import { MemoryPanel } from './components/memory';  // AI Memory (Graphiti)
import { TrafficFlowPanel } from './components/traffic/TrafficFlowPanel';  // HTTP traffic visualization
import { PTYTrafficPanel } from './components/pty-traffic';  // PTY traffic visualization
import { CapturePanel } from './components/capture/CapturePanel';  // SOTS capture control
import { GlobalRecordingIndicator } from './components/capture/GlobalRecordingIndicator';  // Global recording warning
import { EditDocModal } from './components/editdoc';  // Global markdown editor modal
import { Dojo } from './components/dojo';  // Feature planning workspace
import { Transcripts } from './components/transcripts';  // Archived conversations
import { ClaudeTaskMonitor } from './components/monitor';  // Claude Code task monitoring
import { ClaudeTeams } from './components/claude-teams';  // Claude Code Agent Teams orchestration
import { KuroryuuAgents } from './components/kuroryuu-agents';  // Kuroryuu Agents (rebranded coding-agents)
import { SchedulerPanel } from './components/scheduler';  // Job scheduler
import { MarketingPanel } from './components/marketing';  // Marketing workflow
import { LLMAppsPanel } from './components/llm-apps';  // LLM Apps catalog browser
import { ExcalidrawPanel } from './components/excalidraw';  // Excalidraw diagramming
// BackupManagerPage opened as dialog from IntegrationsDialog
import { RichVizPopupLayer } from './components/RichVizPopupLayer';  // Rich tool visualization popups
import {
  AppSettingsDialog,
  ProjectSettingsDialog,
  ClaudeProfilesDialog,
  ModelConfigDialog,
  DomainConfigDialog,
  IntegrationsDialog,
  AboutDialog,
} from './components/settings';
import { InitializeProjectDialog } from './components/project';
import { UpdateNotification } from './components/UpdateNotification';
import { LeaderDeathWarning } from './components/LeaderDeathWarning';
import { SecurityAlert, type SecurityAlertData } from './components/SecurityAlert';
import { ShutdownProgressModal } from './components/ShutdownProgressModal';
import { useSettingsStore } from './stores/settings-store';
import { useShutdownStore } from './stores/shutdown-store';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { useTheme, useIsThemedStyle } from './hooks/useTheme';
import { MatrixRain } from './components/effects/MatrixRain';
import { ThemedBackgroundOverlay } from './components/ui/ThemedBackground';
import type { Task } from './types/task';
import { initAgentConfigFromFile, useAgentConfigStore } from './stores/agent-config-store';
import { initArchivalListener } from './stores/kuroryuu-agents-store';
import { gatewayWebSocket } from './lib/websocket-client';
import { useTrafficStore } from './stores/traffic-store';
import { useAgentStore } from './stores/agent-store';
import { clearAllLocalStorage, clearAllIndexedDB } from './lib/storage-reset';

export function App() {
  // Initialize agent config from file on mount
  useEffect(() => {
    initAgentConfigFromFile();
  }, []);

  // Persistent archival listener — archives completed agent sessions regardless of active panel
  useEffect(() => {
    initArchivalListener();
  }, []);

  // Load persisted settings from electron-store on mount
  useEffect(() => {
    useSettingsStore.getState().loadSettings();
  }, []);
  // Project root - loaded from main process (not hardcoded)
  const [projectRoot, setProjectRoot] = useState<string>('');
  const todoPath = projectRoot ? `${projectRoot}/ai/todo.md` : '';

  // Theme detection for conditional rendering
  const { isKuroryuu } = useIsThemedStyle();

  // Settings store for projectPath
  const setProjectPath = useSettingsStore((s) => s.setProjectPath);

  // Fetch project root on mount and sync to settings store
  useEffect(() => {
    window.electronAPI?.app?.getProjectRoot?.()
      .then((root: string) => {
        const normalizedRoot = root.replace(/\\/g, '/');
        setProjectRoot(normalizedRoot);
        // Also set in settings store so all components can access it
        setProjectPath(root); // Keep backslashes for Windows paths in settings
      })
      .catch((err) => {
        console.error('[App] Failed to get project root from main process:', err);
        // Fallback to current working directory
        const fallbackPath = process.cwd();
        setProjectRoot(fallbackPath.replace(/\\/g, '/'));
        setProjectPath(fallbackPath);
      });
  }, [setProjectPath]);

  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  const [activeView, setActiveView] = useState<View>('welcome');
  const [terminalMounted, setTerminalMounted] = useState(false);
  const [marketingMounted, setMarketingMounted] = useState(false);
  const [excalidrawMounted, setExcalidrawMounted] = useState(false);
  const [showInspector, setShowInspector] = useState(false);


  // Leader death detection - blocks UI and requires app restart
  const [leaderDead, setLeaderDead] = useState(false);

  useEffect(() => {
    const cleanup = window.electronAPI?.app?.onLeaderDied?.(() => {
      console.log('[App] Leader terminal died - showing warning');
      setLeaderDead(true);
    });
    return () => { cleanup?.(); };
  }, []);

  // Listen for Kanban tab switch event from PRD store (LMStudio unavailable fallback)
  useEffect(() => {
    const handleSwitchToKanban = () => {
      console.log('[App] Switching to Kanban tab (PRD fallback)');
      setActiveView('kanban');
    };
    window.addEventListener('switch-to-kanban', handleSwitchToKanban);
    return () => window.removeEventListener('switch-to-kanban', handleSwitchToKanban);
  }, []);

  // Listen for navigate-to-view events from WelcomeHub components
  useEffect(() => {
    const handleNavigateToView = (e: CustomEvent<{ view: string }>) => {
      const view = e.detail.view as View;
      console.log('[App] Navigating to view:', view);
      setActiveView(view);
    };
    window.addEventListener('navigate-to-view', handleNavigateToView as EventListener);
    return () => window.removeEventListener('navigate-to-view', handleNavigateToView as EventListener);
  }, []);

  // Listen for full reset browser storage clear signal from main process
  useEffect(() => {
    const cleanup = window.electronAPI?.settings?.onClearBrowserStorage?.(async (opts) => {
      console.log('[App] Received clearBrowserStorage signal:', opts);
      if (opts.clearLocalStorage) {
        clearAllLocalStorage();
      }
      if (opts.clearIndexedDB) {
        await clearAllIndexedDB();
      }
      // Reload to apply reset
      window.location.reload();
    });
    return () => { cleanup?.(); };
  }, []);

  // CLIProxyAPIPlus update check on startup
  // If auto-start found a pending update, show global modal
  useEffect(() => {
    const checkPendingUpdate = async () => {
      try {
        const pending = await window.electronAPI?.cliproxy?.native?.pendingUpdate?.();
        if (!pending?.updateAvailable) return;

        const autoUpdate = await showConfirm(
          'CLIProxyAPIPlus Update Available',
          `Version ${pending.latestVersion} is available (current: ${pending.currentVersion || 'unknown'}).\n\nRunning outdated binaries is a security risk.`,
          { confirmLabel: 'Auto Update', cancelLabel: 'Update Manually' }
        );

        if (autoUpdate) {
          toast.info('Updating CLIProxyAPIPlus...');
          const result = await window.electronAPI?.cliproxy?.native?.updateResponse?.('auto');
          if (result?.success && !result.skipped) {
            toast.success(`CLIProxyAPIPlus updated to v${result.version}`);
          } else if (result?.error) {
            toast.error(`Update failed: ${result.error}`);
          }
        } else {
          await window.electronAPI?.cliproxy?.native?.updateResponse?.('manual');
          await showAlert(
            'Manual Update Instructions',
            'To update CLIProxyAPIPlus manually:\n\n1. Shut down Kuroryuu Desktop\n2. Download the latest release from GitHub\n3. Replace the binary in .cliproxyapi/\n4. Restart Kuroryuu',
          );
        }
      } catch (e) {
        console.error('[App] CLIProxy update check failed:', e);
      }
    };

    // Small delay to let the UI settle before showing modal
    const timer = setTimeout(checkPendingUpdate, 2000);
    return () => clearTimeout(timer);
  }, []);

  // Security alert state
  const [securityAlert, setSecurityAlert] = useState<SecurityAlertData | null>(null);
  const setDefenseMode = useTrafficStore((s) => s.setDefenseMode);
  const setThreatEvent = useTrafficStore((s) => s.setThreatEvent);

  // Listen for security alerts via WebSocket
  useEffect(() => {
    // Connect WebSocket if not already connected
    gatewayWebSocket.connect();

    const handleSecurityAlert = (data: any) => {
      console.error('[SECURITY] External connection detected:', data);

      const alertData: SecurityAlertData = {
        eventId: data.event_id || '',
        clientIp: data.client_ip || '',
        userAgent: data.user_agent || '',
        endpoint: data.endpoint || '',
        method: data.method || '',
        headers: data.headers || {},
        timestamp: data.timestamp || new Date().toISOString(),
        message: data.message || 'External connection detected',
        autoBlocked: data.auto_blocked ?? true,
      };

      setSecurityAlert(alertData);

      // Also activate defense mode in traffic store
      setDefenseMode?.(true);
      setThreatEvent?.({
        ip: alertData.clientIp,
        timestamp: alertData.timestamp,
        endpoint: alertData.endpoint,
        method: alertData.method,
        userAgent: alertData.userAgent,
      });
    };

    const unsubscribe = gatewayWebSocket.on('security_alert', handleSecurityAlert);

    return () => {
      unsubscribe();
    };
  }, [setDefenseMode, setThreatEvent]);

  // Shutdown event listeners
  useEffect(() => {
    const unsubStart = window.electronAPI?.shutdown?.onStart?.(() => {
      console.log('[App] Shutdown started - stopping all polling and disconnecting');
      // Stop all polling and heartbeats to prevent connection errors during shutdown
      useAgentStore.getState().stopPolling();
      useAgentConfigStore.getState().stopAllHeartbeats();
      // Disconnect WebSocket to prevent further requests
      gatewayWebSocket.disconnect();
      useShutdownStore.getState().openDialog();
    });

    const unsubProgress = window.electronAPI?.shutdown?.onProgressUpdate?.(({ step, progress }) => {
      console.log('[App] Shutdown progress:', step, progress);
      useShutdownStore.getState().updateProgress(step, progress);
    });

    const unsubCountdown = window.electronAPI?.shutdown?.onCountdownUpdate?.((count) => {
      console.log('[App] Shutdown countdown:', count);
      useShutdownStore.getState().setCountdown(count);
    });

    return () => {
      unsubStart?.();
      unsubProgress?.();
      unsubCountdown?.();
    };
  }, []);

  // Quit confirmation listener (Kuroryuu themed dialog)
  useEffect(() => {
    const unsubQuit = window.electronAPI?.app?.onQuitConfirmRequest?.(async () => {
      console.log('[App] Quit confirmation requested');
      const confirmed = await showDestructive(
        'Quit Kuroryuu',
        'Are you sure you want to quit?\n\nAll terminals and sessions will be saved before closing.',
        { confirmLabel: 'Quit', cancelLabel: 'Cancel' }
      );
      window.electronAPI?.app?.sendQuitConfirmResponse?.(confirmed);
    });

    return () => {
      unsubQuit?.();
    };
  }, []);

  // Memory injection modal — show once after First Book bootstrap completes
  useEffect(() => {
    const unsub = window.electronAPI?.identity?.onBootstrapCompleted?.(async () => {
      if (localStorage.getItem('memoryInjectionModalShown')) return;
      localStorage.setItem('memoryInjectionModalShown', 'true');

      // Let bootstrap UI settle before showing dialog
      await new Promise(r => setTimeout(r, 1500));

      const enable = await showConfirm(
        'Enable Memory Injection?',
        'Your assistant has been created.\n\n' +
        'Enabling memory injection will make every Claude CLI session in Kuroryuu ' +
        'automatically start as your configured assistant.\n\n' +
        'Leave this off for normal use.\n' +
        'Turn this on when running your assistant in heartbeat mode.',
        { confirmLabel: 'Enable Memory Injection', cancelLabel: 'Keep Off' }
      );

      if (enable) {
        try {
          const result = await window.electronAPI?.kuroConfig?.load?.();
          if (result?.ok && result.config) {
            const { elevenlabsKeyConfigured, ...configToSave } = result.config as any;
            configToSave.features = {
              ...configToSave.features,
              smartSessionStart: true,
              autoCheckpointOnEnd: true,
              previouslySection: true,
            };
            await window.electronAPI?.kuroConfig?.save?.(configToSave);
            toast.success('Memory injection enabled');
          }
        } catch (err) {
          console.error('[App] Failed to enable memory injection:', err);
        }
      }
    });

    return () => { unsub?.(); };
  }, []);

  // Handler for "View in Traffic" - enables defense mode and navigates to traffic page
  const handleViewInTraffic = useCallback(() => {
    setDefenseMode?.(true);
    setActiveView('traffic-flow');
  }, [setDefenseMode]);

  // Handler to dismiss security alert
  const handleDismissSecurityAlert = useCallback(() => {
    setSecurityAlert(null);
  }, []);

  // Settings store
  const openDialog = useSettingsStore((s) => s.openDialog);

  // Keyboard shortcuts DISABLED - terminals need full keyboard input passthrough
  // Previously: single-letter shortcuts (K, A, N, D, I, L, C, M, W) were capturing input
  // that should go to terminals (including Shift+Tab, etc.)
  const handleOpenSettings = useCallback(() => {
    openDialog('app');
  }, [openDialog]);

  // Navigate to Capture panel (used by global recording indicator)
  const handleNavigateToCapture = useCallback(() => {
    setActiveView('capture');
  }, []);

  // Enable keyboard shortcuts when devMode is on
  const devMode = useSettingsStore((s) => s.appSettings.devMode);
  console.log('[App] devMode:', devMode, 'modalOpen:', modalOpen, 'shortcuts enabled:', devMode && !modalOpen);
  useKeyboardShortcuts(setActiveView, handleOpenSettings, devMode && !modalOpen);

  // Apply theme
  useTheme();

  // Open modal when task is selected
  const handleTaskSelect = (task: Task) => {
    setSelectedTask(task);
    setModalOpen(true);
  };

  // Mount terminal only when first viewed, then keep it mounted
  useEffect(() => {
    if (activeView === 'terminals' && !terminalMounted) {
      setTerminalMounted(true);
    }
    if (activeView === 'marketing' && !marketingMounted) {
      setMarketingMounted(true);
    }
    if (activeView === 'excalidraw' && !excalidrawMounted) {
      setExcalidrawMounted(true);
    }
  }, [activeView, terminalMounted, marketingMounted, excalidrawMounted]);

  return (
    <ErrorBoundary>
      <KuroryuuDialogProvider>
        {/* Matrix digital rain effect - only shows when Matrix theme is active */}
        <MatrixRain />

        {/* Themed background texture overlay */}
        <ThemedBackgroundOverlay />

        <div className="h-screen w-screen flex bg-background text-foreground font-sans overflow-hidden">

          {/* Sidebar Navigation */}
          <Sidebar activeView={activeView} onSelectView={setActiveView} />

          {/* Main Content Area */}
          <div
            className="flex-1 min-w-0 flex flex-col h-full overflow-hidden relative transition-all duration-300"
          >

            {/* View Content */}
            <main className="flex-1 overflow-hidden relative bg-background">
              <ErrorBoundary>

                {/* Welcome Screen */}
                {activeView === 'welcome' && <WelcomeScreen />}

                {/* Kanban Board */}
                <div className={`absolute inset-0 ${activeView === 'kanban' ? '' : 'hidden pointer-events-none'}`}>
                  <KanbanBoard
                    todoPath={todoPath}
                    onNewTaskRequest={() => setWizardOpen(true)}
                    onTaskSelect={handleTaskSelect}
                  />
                </div>

                {/* Terminal Grid (Keep mounted for session persistence) */}
                {terminalMounted && (
                  <div className={`absolute inset-0 ${activeView === 'terminals' ? '' : 'hidden pointer-events-none'}`}>
                    <TerminalGrid maxTerminals={12} projectRoot={projectRoot} />
                  </div>
                )}


                {/* Other Views (Placeholders) */}
                {activeView === 'insights' && <KuroryuuDesktopAssistantPanel mode="fullscreen" />}
                {activeView === 'ideation' && <Ideation />}
                {activeView === 'changelog' && <Changelog />}
                {activeView === 'context' && <Context />}
                {activeView === 'memory' && <MemoryPanel />}
                {activeView === 'command-center' && <CommandCenter />}
                {activeView === 'worktrees' && <Worktrees />}
                {activeView === 'traffic-flow' && <TrafficFlowPanel />}
                {activeView === 'pty-traffic' && <PTYTrafficPanel />}
                {activeView === 'capture' && <CapturePanel />}

                {/* Dojo - Feature Planning Workspace */}
                {activeView === 'dojo' && <Dojo />}

                {/* Transcripts - Browse archived conversations */}
                {activeView === 'transcripts' && <Transcripts />}

                {/* Claude Task Monitor - Real-time Claude Code task tracking */}
                {activeView === 'claude-tasks' && <ClaudeTaskMonitor />}

                {/* Claude Teams - Agent Teams orchestration */}
                {activeView === 'claude-teams' && <ClaudeTeams />}

                {/* Kuroryuu Agents - Background agent session management */}
                {activeView === 'kuroryuu-agents' && <KuroryuuAgents />}

                {/* Scheduler - Automated job scheduling */}
                {activeView === 'scheduler' && <SchedulerPanel />}

                {/* Marketing - Research, positioning, copy, ads workflow (keep mounted) */}
                {marketingMounted && (
                  <div className={`absolute inset-0 ${activeView === 'marketing' ? '' : 'hidden pointer-events-none'}`}>
                    <MarketingPanel />
                  </div>
                )}

                {/* LLM Apps - Browse awesome-llm-apps catalog */}
                {activeView === 'llm-apps' && <LLMAppsPanel />}

                {/* Excalidraw - Agent diagramming workspace (keep mounted) */}
                {excalidrawMounted && (
                  <div className={`absolute inset-0 ${activeView === 'excalidraw' ? '' : 'hidden pointer-events-none'}`}>
                    <ExcalidrawPanel />
                  </div>
                )}

              </ErrorBoundary>
            </main>
          </div>

          {/* Inspector Panel (Optional / Togglable) */}
          {showInspector && (
            <div className="w-80 border-l border-zinc-800 bg-zinc-900 flex-shrink-0">
              <Inspector
                projectRoot={projectRoot}
                selectedTaskId={selectedTask?.id}
              />
            </div>
          )}

          {/* Task Detail Modal */}
          <TaskDetailModal
            task={selectedTask}
            open={modalOpen}
            onOpenChange={setModalOpen}
            projectRoot={projectRoot}
          />

          {/* Task Creation Wizard */}
          <TaskWizard
            open={wizardOpen}
            onOpenChange={setWizardOpen}
          />

          {/* Settings Dialogs */}
          <AppSettingsDialog />
          <ProjectSettingsDialog />
          <ClaudeProfilesDialog />
          <ModelConfigDialog />
          <DomainConfigDialog />
          <IntegrationsDialog />
          <AboutDialog />

          {/* Project Initialization Dialog */}
          <InitializeProjectDialog />

          {/* EditDoc Modal - Global markdown editor */}
          <EditDocModal />


          {/* Global Recording Indicator - visible on all pages except terminals (has header indicator) */}
          <GlobalRecordingIndicator onNavigateToCapture={handleNavigateToCapture} activeView={activeView} />

          {/* Rich tool visualization popups (terminal tool outputs when enabled) */}
          <RichVizPopupLayer />

          {/* Toast notifications */}
          <ToastContainer />

          {/* Auto-update notifications */}
          <UpdateNotification />

          {/* Leader death warning - blocks all UI, requires restart */}
          <LeaderDeathWarning isOpen={leaderDead} />

          {/* Security alert - blocks UI when external connection detected */}
          <SecurityAlert
            alert={securityAlert}
            onDismiss={handleDismissSecurityAlert}
            onViewInTraffic={handleViewInTraffic}
          />

          {/* Shutdown progress modal - shows cleanup progress when app is closing */}
          <ShutdownProgressModal />
        </div>
      </KuroryuuDialogProvider>
    </ErrorBoundary>
  );
}
