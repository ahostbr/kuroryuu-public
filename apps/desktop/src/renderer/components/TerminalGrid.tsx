import { useState, useCallback, useEffect, useMemo, useRef, Fragment } from 'react';
// Note: react-resizable-panels and react-rnd removed - using CSS-only layout to prevent terminal unmounting
import { Terminal, type TerminalRef } from './Terminal';
import type { BufferReadMode, BufferReadOptions } from './terminal-buffer-utils';
import { FileExplorerPanel } from './FileExplorerPanel';
import { GatewayMcpStatus } from './GatewayMcpStatus';
import { AgentSetupWizard } from './AgentSetupWizard';
import { WorkerSetupWizard } from './WorkerSetupWizard';
import { ThinkerWizard } from './ThinkerWizard';
import { SpecialistWizard } from './SpecialistWizard';
import { WorkflowSpecialistWizard } from './WorkflowSpecialistWizard';
import { AgentWizard } from './AgentWizard';
import { AgentTerminalCog, AgentCogButton } from './AgentTerminalCog';
import { useSubAgentConfigStore } from '../stores/subagent-config-store';
import type { AgentConfig } from '../stores/agent-config-store';
import { useAgentConfigStore, deregisterAgent, checkAndClearStaleAgents } from '../stores/agent-config-store';
import { useGatewayWebSocket } from '../hooks/useGatewayWebSocket';
import { useSettings, type MicSettings } from '../hooks/useSettings';

// Layout settings type (for persistence)
type LayoutSettings = { gridLayout: 'auto' | '2x2' | '3x3'; layoutMode: 'grid' | 'splitter' | 'window'; };
import { useIsThemedStyle } from '../hooks/useTheme';
import { fileLogger } from '../utils/file-logger';
import { toast } from './ui/toast';
import { useKuroryuuDialog } from '../hooks/useKuroryuuDialog';

// Kuroryuu theme styling applied - v2
// Leader message hook - uses WebSocket for notifications, claims from inbox for content
function useLeaderMessages(workerId: string | null, onMessage: (msg: LeaderMessage) => void) {
  const { subscribe, isConnected } = useGatewayWebSocket();
  const onMessageRef = useRef(onMessage);
  onMessageRef.current = onMessage;

  // Helper to claim message from inbox and get full content
  const claimFromInbox = async (inboxId: string): Promise<LeaderMessage | null> => {
    try {
      // Claim the message
      const claimResponse = await fetch('http://127.0.0.1:8200/v1/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'k_inbox',
          arguments: { action: 'claim', id: inboxId }
        })
      });

      if (!claimResponse.ok) return null;

      // Read the claimed message
      const readResponse = await fetch('http://127.0.0.1:8200/v1/mcp/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'k_inbox',
          arguments: { action: 'read', id: inboxId, folder: 'cur' }
        })
      });

      if (!readResponse.ok) return null;

      const readData = await readResponse.json();
      const result = typeof readData.result === 'string' ? JSON.parse(readData.result) : readData.result;

      if (result?.ok && result?.message?.payload) {
        const payload = result.message.payload;
        return {
          id: inboxId.slice(0, 8),
          content: payload.content || '',
          type: payload.type || 'instruction',
          target_type: payload.target_type || 'agent',
          timestamp: result.message.created_at || new Date().toISOString(),
          from_leader: true,
          metadata: payload.metadata || {},
        };
      }
      return null;
    } catch {
      return null;
    }
  };

  useEffect(() => {
    if (!workerId) {
      return;
    }

    // Subscribe to WebSocket leader_message events
    const unsubscribe = subscribe('leader_message', async (data) => {
      // Filter messages for this worker only
      if (data.worker_id === workerId && data.message) {
        const msg = data.message as LeaderMessage & { inbox_id?: string };

        // Check if this is an inbox notification (new durable path)
        if (msg.type === 'inbox_notification' && msg.inbox_id) {
          // Claim from inbox to get full content
          const fullMessage = await claimFromInbox(msg.inbox_id);
          if (fullMessage) {
            onMessageRef.current(fullMessage);
          }
        } else {
          // Legacy path - full message content included
          onMessageRef.current(msg);
        }
      }
    });

    // Also fetch any pending messages on initial connect (backward compat)
    const fetchPending = async () => {
      try {
        const response = await fetch(`http://127.0.0.1:8200/v1/leader/messages/${workerId}?unread_only=true&mark_read=true`);
        if (response.ok) {
          const data = await response.json();
          if (data.messages && data.messages.length > 0) {
            for (const msg of data.messages) {
              onMessageRef.current(msg);
            }
          }
        }
      } catch {
        // Fetch error - messages will come via WebSocket
      }
    };
    fetchPending();

    return () => {
      unsubscribe();
    };
  }, [workerId, subscribe, isConnected]);
}

interface LeaderMessage {
  id: string;
  content: string;
  type: string;
  target_type?: 'agent' | 'terminal';  // 'agent' = chat, 'terminal' = PTY
  timestamp: string;
  from_leader: boolean;
  metadata?: Record<string, unknown>;
}
import {
  Plus,
  X,
  Grid2X2,
  Sparkles,
  FolderTree,
  History,
  LayoutGrid,
  ChevronDown,
  Skull,
  Activity,
  Crown,
  Loader2,
  Wifi,
  WifiOff,
  AlertTriangle,
  Settings,
  RefreshCw,
  Mic,
  Square,
  Copy,
  Clipboard,
  Brain,
  Play,
  Info,
  GripVertical,
  Layers,
  ToggleLeft,
  Shield,
  ShieldAlert,
  ShieldOff,
  Radio,
  MessageCircleQuestion,
  Eye
} from 'lucide-react';
import { LeaderMonitorModal } from './LeaderMonitorModal';
import { useAgentStore } from '../stores/agent-store';
import { useCaptureStore } from '../stores/capture-store';
import { useAgentStatusUpdates } from '../hooks/useWebSocket';
import type { Agent } from '../types/agents';

interface TerminalInstance {
  id: string;
  title: string;
  ptyId?: string;
  sessionId?: string; // Kuroryuu hook session ID
  claudeMode?: boolean;
  linkedAgentId?: string; // Link to registered agent
  roleOverride?: 'leader' | 'worker'; // Manual role override (takes precedence over agent ID)
  viewMode: 'pending' | 'terminal'; // pending = needs start button, terminal = xterm view
  showCogSettings?: boolean; // Show sub-agent settings panel
  planMode?: boolean; // Track plan mode state for PM button toggle
  restartCount?: number; // Increment to force Terminal remount on restart
  agentConfig?: AgentConfig; // Store config directly to avoid race condition in buildCliConfig
}

interface SessionHistory {
  id: string;
  date: string;
  terminalCount: number;
}

interface TerminalGridProps {
  maxTerminals?: number;
  projectRoot?: string;
}

// Session history is loaded from pty persistence

export function TerminalGrid({ maxTerminals = 12, projectRoot = '' }: TerminalGridProps) {
  // Agent configuration store
  const {
    isSetupComplete,
    isHydrated,
    leaderAgent,
    workerAgents,
    resetCounter,
    startAllHeartbeats,
    resetSetup,
    setLeaderAgent,
    addWorkerAgent,
    removeWorkerAgent,
    startHeartbeat,
  } = useAgentConfigStore();

  // Theme detection for Kuroryuu-specific styling
  const { isKuroryuu } = useIsThemedStyle();

  // Dialog hook for confirmations
  const { confirmDestructive } = useKuroryuuDialog();

  // Recording state for header indicator
  const isRecording = useCaptureStore((s) => s.isRecording);

  // Initialize terminals based on configured agents
  const [terminals, setTerminals] = useState<TerminalInstance[]>([]);
  const [activeId, setActiveId] = useState<string>('');
  const [showFileExplorer, setShowFileExplorer] = useState(false);
  const [showSessionHistory, setShowSessionHistory] = useState(false);
  const [sessions, setSessions] = useState<SessionHistory[]>([]);
  // Layout settings - local state with persistence
  const [gridLayout, setGridLayoutState] = useState<'auto' | '2x2' | '3x3'>('auto');
  const [layoutMode, setLayoutModeState] = useState<'grid' | 'splitter' | 'window'>('grid');

  // Load layout settings from electron-store on mount
  useEffect(() => {
    window.electronAPI?.settings?.get?.('ui.layout').then((raw: unknown) => {
      const settings = raw as LayoutSettings | null;
      if (settings) {
        if (settings.gridLayout) setGridLayoutState(settings.gridLayout);
        if (settings.layoutMode) setLayoutModeState(settings.layoutMode);
      }
    }).catch(console.error);
  }, []);

  // Persist layout settings when changed
  const setGridLayout = (value: 'auto' | '2x2' | '3x3') => {
    setGridLayoutState(value);
    window.electronAPI?.settings?.set?.('ui.layout', { gridLayout: value, layoutMode }).catch(console.error);
  };
  const setLayoutMode = (value: 'grid' | 'splitter' | 'window') => {
    setLayoutModeState(value);
    window.electronAPI?.settings?.set?.('ui.layout', { gridLayout, layoutMode: value }).catch(console.error);
  };

  // Buffer access mode state (for opt-in terminal buffer reading)
  // Two modes only: 'off' (disabled) or 'on' (enabled for all agents)
  const [bufferAccessMode, setBufferAccessModeState] = useState<'off' | 'on'>('off');
  const [showBufferDropdown, setShowBufferDropdown] = useState(false);
  const [showBufferWarning, setShowBufferWarning] = useState(false);
  const [pendingBufferMode, setPendingBufferMode] = useState<'on' | null>(null);

  // Load buffer access mode on mount
  useEffect(() => {
    window.electronAPI?.app?.getBufferAccessMode?.().then((mode: string) => {
      // Backwards compat: treat 'all' and 'leader_only' as 'on'
      if (mode === 'off') {
        setBufferAccessModeState('off');
      } else if (mode === 'on' || mode === 'all' || mode === 'leader_only') {
        setBufferAccessModeState('on');
      }
    }).catch(console.error);
  }, []);

  // Handler to change buffer access mode (shows warning for non-off modes)
  const handleBufferModeChange = (newMode: 'off' | 'on') => {
    setShowBufferDropdown(false);
    if (newMode === 'off') {
      // No warning needed for disabling
      window.electronAPI?.app?.setBufferAccessMode?.('off').then(() => {
        setBufferAccessModeState('off');
      }).catch(console.error);
    } else {
      // Show security warning before enabling
      setPendingBufferMode(newMode);
      setShowBufferWarning(true);
    }
  };

  // Confirm buffer mode change after user acknowledges warning
  const confirmBufferModeChange = () => {
    if (pendingBufferMode) {
      window.electronAPI?.app?.setBufferAccessMode?.(pendingBufferMode).then(() => {
        setBufferAccessModeState(pendingBufferMode);
        setPendingBufferMode(null);
        setShowBufferWarning(false);
      }).catch(console.error);
    }
  };

  // Cancel buffer mode change
  const cancelBufferModeChange = () => {
    setPendingBufferMode(null);
    setShowBufferWarning(false);
  };

  // Close buffer dropdown when clicking outside
  useEffect(() => {
    if (!showBufferDropdown) return;
    const handleClickOutside = () => setShowBufferDropdown(false);
    // Small delay to prevent immediate close on the same click that opened it
    const timer = setTimeout(() => {
      document.addEventListener('click', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('click', handleClickOutside);
    };
  }, [showBufferDropdown]);

  const [windowStates, setWindowStates] = useState<Record<string, {
    x: number; y: number; width: number; height: number; zIndex: number;
  }>>({});
  const [splitterSizes, setSplitterSizes] = useState<number[]>([]);  // Splitter mode panel sizes (percentages)
  const [activeAgentTerminalId, setActiveAgentTerminalId] = useState<string | null>(null);
  const [showSetupWizard, setShowSetupWizard] = useState(false); // Initialize false, sync with store below
  const [showWorkerWizard, setShowWorkerWizard] = useState(false);
  const [thinkerWizardTerminalId, setThinkerWizardTerminalId] = useState<string | null>(null);
  const [specialistWizardTerminalId, setSpecialistWizardTerminalId] = useState<string | null>(null);
  const [agentWizardTerminalId, setAgentWizardTerminalId] = useState<string | null>(null);
  const [restartConfirmTerminalId, setRestartConfirmTerminalId] = useState<string | null>(null);
  const [statusLineMode, setStatusLineMode] = useState<'full' | 'compact' | 'minimal'>('full');

  // Debug: Plan mode toggle sequence cycling
  const [pmDebugIndex, setPmDebugIndex] = useState(0);
  const PM_SEQUENCES = [
    { name: 'Shift+Tab', seq: '\x1b[Z' },
    { name: 'Alt+M', seq: '\x1bm' },
    { name: 'ESC', seq: '\x1b' },
    { name: 'Ctrl+Z', seq: '\x1a' },
    { name: 'ESC+Tab', seq: '\x1b\t' },
    { name: 'F1', seq: '\x1bOP' },
  ];

  // Initialize status line mode from file
  useEffect(() => {
    const loadMode = async () => {
      try {
        const content = await window.electronAPI?.fs?.readFile?.('.claude/statusline-mode');
        if (content) {
          const mode = content.trim().toLowerCase() as 'full' | 'compact' | 'minimal';
          if (['full', 'compact', 'minimal'].includes(mode)) {
            setStatusLineMode(mode);
          }
        }
      } catch {
        // File doesn't exist, use default
      }
    };
    loadMode();
  }, []);

  // Sync wizard state with agent config store (after persistence rehydrates)
  // Also check for stale agents from previous session and clear them
  useEffect(() => {
    if (!isSetupComplete && !showSetupWizard) {
      // Before showing wizard, check for and clear stale agents from previous session
      checkAndClearStaleAgents().then(({ hadStaleAgents, clearedCount }) => {
        if (hadStaleAgents) {
          toast.warning(
            `Previous session ended without cleanup. Cleared ${clearedCount} stale agent(s) from registry.`
          );
        }
      });
      setShowSetupWizard(true);
    }
  }, [isSetupComplete, showSetupWizard]);

  // Drag and drop state
  const [draggedId, setDraggedId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  // Window mode drop zone state
  const [activeDropZone, setActiveDropZone] = useState<'top' | 'bottom' | 'left' | 'right' | 'center' | null>(null);
  const [isDraggingWindow, setIsDraggingWindow] = useState(false);
  const [draggingWindowId, setDraggingWindowId] = useState<string | null>(null);
  const windowContainerRef = useRef<HTMLDivElement>(null);

  // Audio recording state
  const [recordingTerminalId, setRecordingTerminalId] = useState<string | null>(null);
  const [audioLevel, setAudioLevel] = useState<number>(0); // 0-1 normalized audio level
  const [showMicSettings, setShowMicSettings] = useState<{ x: number; y: number } | null>(null);
  // Leader monitor modal state
  const [showLeaderMonitor, setShowLeaderMonitor] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const silenceStartRef = useRef<number | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const isRecordingRef = useRef<boolean>(false); // Stable ref for monitorLevel closure

  // Terminal refs for copy/paste operations and buffer reading
  const termRefs = useRef<Map<string, TerminalRef>>(new Map());

  // Persistence state
  const isInitialLoadRef = useRef<boolean>(true);
  const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const [persistenceLoaded, setPersistenceLoaded] = useState(false);

  // Mic settings (configurable via right-click menu) - persisted via unified settings backend
  const [micSettings, setMicSettings] = useSettings<MicSettings>('audio.mic');

  // Destructure for use in callbacks (with defaults in case settings haven't loaded yet)
  const silenceThreshold = micSettings?.silenceThreshold ?? 0.12;
  const voiceThreshold = micSettings?.voiceThreshold ?? 0.25;
  const silenceTimeoutMs = micSettings?.silenceTimeoutMs ?? 1500;


  // M5: Agent store integration
  const { agents, agentStats, fetchAgents, killAgent, startPolling, stopPolling } = useAgentStore();
  
  // Real-time agent status updates
  const { agentStatuses, isConnected: wsConnected } = useAgentStatusUpdates();

  // Check if LM Studio agent slot is occupied - MUST be before any conditional returns
  const isAgentSlotOccupied = useMemo(() => {
    // Check if there's an active LM Studio agent in the registry (check capabilities only)
    const lmstudioAgent = agents.find(a =>
      a.capabilities?.includes('lmstudio') &&
      a.status !== 'dead'
    );
    return lmstudioAgent !== undefined || activeAgentTerminalId !== null;
  }, [agents, activeAgentTerminalId]);

  // Get the current active LM Studio agent (if any)
  const activeLMStudioAgent = useMemo(() => {
    return agents.find(a =>
      a.capabilities?.includes('lmstudio') &&
      a.status !== 'dead'
    );
  }, [agents]);

  // Load session history from PTY persistence
  useEffect(() => {
    const loadSessions = async () => {
      try {
        const result = await window.electronAPI?.pty?.getPersistedSessions?.();
        if (result?.sessions && Array.isArray(result.sessions)) {
          type SessionData = { id: string; lastActiveAt?: number; createdAt?: number };
          const sessionHistory: SessionHistory[] = (result.sessions as SessionData[]).map((s) => ({
            id: s.id,
            date: s.lastActiveAt ? new Date(s.lastActiveAt).toLocaleString() :
                  s.createdAt ? new Date(s.createdAt).toLocaleString() : 'Unknown',
            terminalCount: 1,  // Each session represents one terminal
          }));
          setSessions(sessionHistory);
        }
      } catch (error) {
        console.error('[TerminalGrid] Failed to load session history:', error);
      }
    };
    loadSessions();
  }, []);

  // Listen for terminal buffer read requests from main process (for k_term_read MCP action)
  useEffect(() => {
    const handleBufferRequest = (data: { termId: string; mode: string; options: unknown }) => {
      const { termId, mode, options } = data;

      // Find terminal by termId (either component ID or PTY ID)
      let matchedTermRef: TerminalRef | undefined;
      let foundTermId: string | undefined;

      // First try direct match on terminal component ID
      for (const term of terminals) {
        if (term.id === termId || term.ptyId === termId) {
          matchedTermRef = termRefs.current.get(term.id);
          foundTermId = term.id;
          break;
        }
      }

      if (!matchedTermRef) {
        window.electronAPI?.pty?.sendBufferResponse?.(termId, { error: 'Terminal not found' });
        return;
      }

      // Read buffer
      try {
        const bufferOptions = options as BufferReadOptions || {};
        const snapshot = matchedTermRef.readBuffer(mode as BufferReadMode, bufferOptions);

        if (!snapshot) {
          window.electronAPI?.pty?.sendBufferResponse?.(termId, { error: 'Terminal not initialized' });
          return;
        }

        window.electronAPI?.pty?.sendBufferResponse?.(termId, snapshot);
      } catch (err) {
        window.electronAPI?.pty?.sendBufferResponse?.(termId, {
          error: err instanceof Error ? err.message : 'Buffer read failed'
        });
      }
    };

    const cleanup = window.electronAPI?.pty?.onBufferRequest?.(handleBufferRequest);

    return () => {
      cleanup?.();
    };
  }, [terminals]);

  // Start polling when component mounts (only if setup complete AND persistence loaded)
  // Wait for persistence to ensure orphaned workers are removed before heartbeats start
  useEffect(() => {
    if (isSetupComplete && persistenceLoaded) {
      startPolling();
      // Start heartbeats only after terminal restoration is complete
      startAllHeartbeats();
    }
    return () => stopPolling();
  }, [isSetupComplete, persistenceLoaded, startPolling, stopPolling, startAllHeartbeats]);

  // Track if we've already processed the leader terminal this session
  // Prevents re-triggering when terminals state updates
  const leaderTerminalProcessedRef = useRef(false);

  // Reset processed flag when leaderAgent changes (new leader configured)
  useEffect(() => {
    leaderTerminalProcessedRef.current = false;
  }, [leaderAgent?.id]);

  // Initialize leader terminal when leaderAgent is available (even if setup not complete)
  // This allows injection testing without waiting for setup wizard
  // Workers are added via Worker Wizard when clicking +
  // IMPORTANT: Wait for persistence to load first to avoid race condition
  // FIX: Use Quizmaster pattern - create terminal with viewMode: 'terminal' for auto-spawn
  useEffect(() => {
    // Wait for persistence to finish loading first
    if (!persistenceLoaded) return;
    if (!leaderAgent) return;
    if (leaderTerminalProcessedRef.current) return; // Already processed this session

    const leaderTerminalId = `term-${leaderAgent.id}`;
    const existingLeaderTerminal = terminals.find(t => t.linkedAgentId === leaderAgent.id);

    if (existingLeaderTerminal) {
      // Only handle session restore case: viewMode === 'pending'
      // If viewMode is already 'terminal' (wizard or quizmaster created it), leave it alone
      // Terminal.tsx will handle PTY creation when it mounts
      if (existingLeaderTerminal.viewMode === 'pending') {
        console.log('[Leader] Session restore detected - updating terminal for auto-spawn');
        leaderTerminalProcessedRef.current = true; // Mark as processed

        // Kill old PTY if exists
        if (existingLeaderTerminal.ptyId) {
          window.electronAPI.pty.kill(existingLeaderTerminal.ptyId).catch(() => {});
        }

        setTerminals(prev =>
          prev.map(t => t.linkedAgentId === leaderAgent.id
            ? {
                ...t,
                ptyId: undefined,      // Clear so Terminal.tsx creates new PTY
                sessionId: undefined,  // Clear for fresh session
                viewMode: 'terminal' as const,  // Force terminal mode (not pending)
                claudeMode: leaderAgent.cliProvider === 'claude',
                agentConfig: leaderAgent,  // Attach config to prevent buildCliConfig race
              }
            : t
          )
        );
      } else {
        // Terminal already has viewMode: 'terminal' - wizard or other code created it
        // Don't interfere - Terminal.tsx will handle PTY creation
        leaderTerminalProcessedRef.current = true;
      }
    } else if (terminals.length === 0) {
      // No terminals at all - create fresh (first launch, like Quizmaster does)
      console.log('[Leader] Creating fresh leader terminal (Quizmaster pattern)');
      leaderTerminalProcessedRef.current = true; // Mark as processed

      const newTerminal: TerminalInstance = {
        id: leaderTerminalId,
        title: leaderAgent.name,
        linkedAgentId: leaderAgent.id,
        viewMode: 'terminal',
        claudeMode: leaderAgent.cliProvider === 'claude',
        agentConfig: leaderAgent,  // Attach config to prevent buildCliConfig race
        // NO ptyId - Terminal.tsx will create PTY and call handleTerminalReady
      };
      setTerminals([newTerminal]);
      setActiveId(leaderTerminalId);
    }
  }, [leaderAgent, terminals, persistenceLoaded]);

  // ============================================
  // PERSISTENCE: Load saved state on mount
  // ============================================
  useEffect(() => {
    // Wait for agent config to hydrate before loading persisted state
    // This prevents race condition where leaderAgent is null during restore
    if (!isHydrated) return;

    const loadPersistedState = async () => {
      try {
        const result = await window.electronAPI?.pty?.loadTerminalState?.();
        // IPC returns { terminals: [...] } - extract the array
        type PersistedTerminal = {
          id: string;
          title: string;
          ptyId?: string;
          sessionId?: string;
          claudeMode?: boolean;
          linkedAgentId?: string;
          roleOverride?: 'leader' | 'worker';
          viewMode?: 'terminal';
        };
        const rawState = result?.terminals || result;
        const savedState: PersistedTerminal[] | null = Array.isArray(rawState) ? rawState as PersistedTerminal[] : null;
        if (savedState && savedState.length > 0) {
          fileLogger.log('TerminalGrid', 'Recovering persisted terminals', { count: savedState.length });

          // Check which PTYs are still alive in the daemon
          let alivePtyIds = new Set<string>();
          try {
            const ptyList = await window.electronAPI?.pty?.list?.();
            if (ptyList && Array.isArray(ptyList)) {
              type PtyEntry = { id?: string; alive?: boolean };
              const typedList = ptyList as PtyEntry[];
              const aliveIds = typedList
                .filter((p) => p.alive)
                .map((p) => p.id)
                .filter((id): id is string => id !== undefined);
              alivePtyIds = new Set(aliveIds);
              fileLogger.log('TerminalGrid', 'Found alive PTYs in daemon', { count: alivePtyIds.size, ptyIds: Array.from(alivePtyIds) });
            }
          } catch (err) {
            fileLogger.warn('TerminalGrid', 'Failed to list daemon PTYs, assuming embedded mode', { error: err instanceof Error ? err.message : String(err) });
          }

          // Restore terminals - reconnect to alive PTYs or create new PTYs
          // IMPORTANT: Remap linkedAgentId to current agents (old IDs won't exist)
          // Filter out terminals whose PTY is dead (has ptyId but not alive in daemon)
          const validSavedState = savedState.filter(s =>
            !s.ptyId || alivePtyIds.has(s.ptyId)
          );
          const restoredTerminals: TerminalInstance[] = validSavedState.map((s, index) => {
            const ptyIsAlive = s.ptyId && alivePtyIds.has(s.ptyId);

            // Preserve saved linkedAgentId - agent configs are persisted separately
            // and may load async, so trust the saved ID rather than index-based remapping
            const remappedAgentId = s.linkedAgentId;

            if (s.linkedAgentId) {
              // Check if saved agent exists in current config (for logging only)
              const isLeader = leaderAgent?.id === s.linkedAgentId;
              const matchingWorker = workerAgents.find(w => w.id === s.linkedAgentId);

              if (isLeader || matchingWorker) {
                fileLogger.log('TerminalGrid', 'Restored terminal with existing agent', {
                  title: s.title,
                  linkedAgentId: s.linkedAgentId,
                  agentRole: isLeader ? 'leader' : 'worker'
                });
              } else {
                // Agent config not found yet - keep ID anyway (config may load later)
                fileLogger.log('TerminalGrid', 'Keeping saved agent ID (config may load later)', {
                  title: s.title,
                  linkedAgentId: s.linkedAgentId
                });
              }
            } else {
              // No linkedAgentId saved - this terminal will spawn as shell
              fileLogger.log('TerminalGrid', 'Terminal has no linked agent, will spawn shell', {
                title: s.title, index
              });
            }

            if (ptyIsAlive) {
              fileLogger.log('TerminalGrid', 'PTY alive, setting pending for user to start', { title: s.title, terminalId: s.id, ptyId: s.ptyId, sessionId: s.sessionId });
              return {
                id: s.id,
                title: s.title,
                ptyId: s.ptyId, // Keep alive ptyId
                sessionId: s.sessionId,
                claudeMode: s.claudeMode || false,
                linkedAgentId: remappedAgentId,
                roleOverride: s.roleOverride,
                viewMode: 'pending' as const, // Requires Start Terminal button to avoid race condition
                showCogSettings: false,
                agentConfig: s.agentConfig, // Restore agent config for Claude/Ralph mode
              };
            } else {
              fileLogger.log('TerminalGrid', 'PTY dead, setting pending for fresh start', { title: s.title, terminalId: s.id, oldPtyId: s.ptyId });
              return {
                id: s.id,
                title: s.title,
                ptyId: undefined, // Clear dead ptyId - Terminal will create new PTY
                sessionId: undefined,
                claudeMode: s.claudeMode || false,
                linkedAgentId: remappedAgentId,
                roleOverride: s.roleOverride,
                viewMode: 'pending' as const, // Requires Start Terminal button
                showCogSettings: false,
                agentConfig: s.agentConfig, // Restore agent config for Claude/Ralph mode
              };
            }
          });

          fileLogger.log('TerminalGrid', 'Setting terminals state with restored terminals', {
            count: restoredTerminals.length,
            terminals: restoredTerminals.map(t => ({ id: t.id, title: t.title, ptyId: t.ptyId, linkedAgentId: t.linkedAgentId }))
          });

          setTerminals(restoredTerminals);
          if (restoredTerminals.length > 0) {
            setActiveId(restoredTerminals[0].id);
          }

          // Sync agent config: remove workers whose terminals weren't restored
          const restoredAgentIds = new Set(restoredTerminals.map(t => t.linkedAgentId).filter(Boolean));
          const { workerAgents: currentWorkers, removeWorkerAgent } = useAgentConfigStore.getState();
          for (const worker of currentWorkers) {
            if (!restoredAgentIds.has(worker.id)) {
              fileLogger.log('TerminalGrid', 'Removing orphaned worker agent (terminal not restored)', {
                workerId: worker.id,
                workerName: worker.name
              });
              removeWorkerAgent(worker.id);
            }
          }

          fileLogger.log('TerminalGrid', 'setTerminals called, scheduling setPersistenceLoaded');

          // Mark persistence as loaded ONLY after we've set terminals
          // Use setTimeout(0) to ensure setState has flushed
          setTimeout(() => {
            setPersistenceLoaded(true);
            fileLogger.log('TerminalGrid', 'Persistence load complete', { restoredCount: restoredTerminals.length });
          }, 0);
        } else {
          // No saved state - allow leader init to run
          setPersistenceLoaded(true);
        }
      } catch (err) {
        fileLogger.log('TerminalGrid', 'Failed to load persisted state', { error: String(err) });
        setPersistenceLoaded(true);  // Allow leader init even on error
      } finally {
        // Mark initial load as complete after a short delay
        setTimeout(() => {
          isInitialLoadRef.current = false;
        }, 500);
      }
    };

    loadPersistedState();
  }, [isHydrated]); // Run after agent config is hydrated from file

  // ============================================
  // PERSISTENCE: Save state on terminal changes (debounced)
  // ============================================
  useEffect(() => {
    // Skip save until persistence has loaded (to avoid overwriting restored state)
    if (!persistenceLoaded) return;

    // Debounce saves to avoid excessive writes
    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      const terminalState = terminals.map(t => ({
        id: t.id,
        title: t.title,
        ptyId: t.ptyId,
        sessionId: t.sessionId,
        claudeMode: t.claudeMode,
        linkedAgentId: t.linkedAgentId,
        roleOverride: t.roleOverride,
        viewMode: t.viewMode,
        agentConfig: t.agentConfig,  // Persist agent config (for Ralph mode, etc.)
        createdAt: Date.now(),
        lastActiveAt: Date.now(),
      }));

      window.electronAPI?.pty?.saveTerminalState?.(terminalState);
    }, 100); // Reduced to 100ms - fast enough for app close, still prevents rapid writes

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [terminals, persistenceLoaded]);

  // Force save on window close (bypass debounce)
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (terminals.length > 0 && persistenceLoaded) {
        const terminalState = terminals.map(t => ({
          id: t.id,
          title: t.title,
          ptyId: t.ptyId,
          sessionId: t.sessionId,
          claudeMode: t.claudeMode,
          linkedAgentId: t.linkedAgentId,
          roleOverride: t.roleOverride,
          viewMode: t.viewMode,
          agentConfig: t.agentConfig,  // Persist agent config (for Ralph mode, etc.)
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
        }));
        window.electronAPI?.pty?.saveTerminalState?.(terminalState);
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [terminals, persistenceLoaded]);

  // Ref to access latest terminals without adding to effect dependencies
  const terminalsRef = useRef(terminals);
  const persistenceLoadedRef = useRef(persistenceLoaded);
  useEffect(() => {
    terminalsRef.current = terminals;
    persistenceLoadedRef.current = persistenceLoaded;
  }, [terminals, persistenceLoaded]);

  // IPC listener for flush-persistence command from main process (app quit)
  // FIX 3: Only register listener ONCE (empty deps) to prevent memory leak
  useEffect(() => {
    const handleFlushPersistence = () => {
      // Use refs to get latest values without being in dependency array
      const currentTerminals = terminalsRef.current;
      const isPersistenceLoaded = persistenceLoadedRef.current;

      if (currentTerminals.length > 0 && isPersistenceLoaded) {
        // Cancel any pending debounced save
        if (saveTimeoutRef.current) {
          clearTimeout(saveTimeoutRef.current);
        }

        const terminalState = currentTerminals.map(t => ({
          id: t.id,
          title: t.title,
          ptyId: t.ptyId,
          sessionId: t.sessionId,
          claudeMode: t.claudeMode,
          linkedAgentId: t.linkedAgentId,
          roleOverride: t.roleOverride,
          viewMode: t.viewMode,
          agentConfig: t.agentConfig,  // Persist agent config (for Ralph mode, etc.)
          createdAt: Date.now(),
          lastActiveAt: Date.now(),
        }));
        window.electronAPI?.pty?.saveTerminalState?.(terminalState);
      }
    };

    // Listen for flush command from main process - ONCE
    const cleanup = window.electronAPI?.pty?.onFlushPersistence?.(handleFlushPersistence);

    // Cleanup on unmount
    return () => { cleanup?.(); };
  }, []); // Empty deps - register only once

  // IPC listener for worktree open terminal request
  useEffect(() => {
    const cleanup = window.electronAPI?.worktree?.onOpenTerminalRequest?.(async (data: { path: string }) => {
      // Extract folder name for title
      const folderName = data.path.split(/[/\\]/).pop() || 'Worktree';

      // Create new terminal instance
      const newId = `term-wt-${Date.now()}`;
      const newTerminal: TerminalInstance = {
        id: newId,
        title: `WT: ${folderName}`,
        viewMode: 'terminal',
        claudeMode: false,
      };

      setTerminals(prev => [...prev, newTerminal]);
      setActiveId(newId);

      // Wait a bit for terminal to mount, then create PTY and cd to worktree
      setTimeout(async () => {
        try {
          const pty = await window.electronAPI.pty.create({
            cwd: data.path, // Start directly in worktree path
            cols: 120,
            rows: 30
          });

          // Update terminal with PTY
          setTerminals(prev =>
            prev.map(t => t.id === newId
              ? { ...t, ptyId: pty.id }
              : t
            )
          );
        } catch (error) {
          console.error('[TerminalGrid] Failed to create PTY for worktree:', error);
        }
      }, 100);
    });

    return () => { cleanup?.(); };
  }, []); // Empty deps - register only once

  // Get agent linked to a terminal (by matching config ID, role, or index)
  const getLinkedAgent = useCallback((term: TerminalInstance, index: number): Agent | undefined => {
    if (term.linkedAgentId) {
      // First try direct agent_id match (runtime agents)
      const directMatch = agents.find(a => a.agent_id === term.linkedAgentId);
      if (directMatch) return directMatch;

      // Check if linkedAgentId is a config ID (like "leader_claude-cli_...")
      // Match by role: if it starts with "leader_" find leader agent, otherwise find worker
      if (term.linkedAgentId.startsWith('leader_')) {
        return agents.find(a => a.role === 'leader');
      } else if (term.linkedAgentId.includes('worker_')) {
        // Find worker by index - workers are non-leader agents
        const workerAgentsList = agents.filter(a => a.role !== 'leader');
        // Extract worker index from id if possible, otherwise use terminal index
        const workerIndex = index > 0 ? index - 1 : 0;
        return workerAgentsList[workerIndex];
      }
    }
    // Auto-link by position: index 0 = leader, others = workers
    if (index === 0) {
      return agents.find(a => a.role === 'leader');
    } else {
      const workerAgentsList = agents.filter(a => a.role !== 'leader');
      return workerAgentsList[index - 1];
    }
  }, [agents]);

  // Get proper display name for terminal (Leader, Worker 1, Worker 2, etc.)
  const getTerminalDisplayName = useCallback((term: TerminalInstance, index: number, linkedAgent?: Agent): string => {
    if (linkedAgent) {
      if (linkedAgent.role === 'leader') {
        return 'Leader';
      }
      // For workers, calculate worker index (excluding leader at index 0)
      return `Worker ${index}`;
    }
    // Fallback to term.title for unlinked terminals
    return term.title;
  }, []);

  // Build CLI config from AgentConfig for PTY spawn
  // Returns { cmd, args, env } - env always includes agent identity even for shell
  const buildCliConfig = useCallback((terminalAgentId: string | undefined, terminal?: TerminalInstance): { cmd?: string; args?: string[]; env: Record<string, string> } | undefined => {
    if (!terminalAgentId) {
      return undefined;
    }

    // PRIORITY 1: Use agentConfig from terminal instance (avoids race condition)
    // PRIORITY 2: Fall back to store lookup
    let agentConfig = terminal?.agentConfig;

    if (!agentConfig) {
      // Find the AgentConfig (from agent-config-store, not agent-store)
      agentConfig = terminalAgentId === leaderAgent?.id
        ? leaderAgent
        : workerAgents.find(w => w.id === terminalAgentId);
    }

    // Build agent identity environment variables (always included)
    const agentEnv: Record<string, string> = {
      KURORYUU_AGENT_ID: terminalAgentId,
      KURORYUU_AGENT_NAME: agentConfig?.name || 'Unknown',
      KURORYUU_AGENT_ROLE: agentConfig?.role || 'worker',
    };

    // If no CLI provider or shell mode, return just the env (no cmd/args)
    if (!agentConfig?.cliProvider || agentConfig.cliProvider === 'shell') {
      return { env: agentEnv };
    }

    const cmd = agentConfig.cliPath || agentConfig.cliProvider;
    const args: string[] = [];

    if (agentConfig.cliProvider === 'claude') {
      // Thinker/Specialist: use their specific @ files, not the standard worker bootstrap
      if (agentConfig.thinkerBasePath || agentConfig.thinkerPersonaPath || agentConfig.specialistPromptPath) {
        // Thinker @ files
        if (agentConfig.thinkerBasePath) {
          args.push(`@${agentConfig.thinkerBasePath}`);
        }
        if (agentConfig.thinkerPersonaPath) {
          args.push(`@${agentConfig.thinkerPersonaPath}`);
        }
        // Specialist @ file
        if (agentConfig.specialistPromptPath) {
          args.push(`@${agentConfig.specialistPromptPath}`);
        }
      } else {
        // Standard worker/leader: use bootstrap file OR Ralph files
        const isLeader = agentConfig.role === 'leader';

        // Ralph mode: ONLY load Ralph files (skip KURORYUU_LEADER.md)
        if (isLeader && agentConfig.ralphMode) {
          args.push('@ai/prompts/ralph/ralph_prime.md');
          args.push('@ai/prompts/ralph/ralph_loop.md');
          args.push('@ai/prompts/ralph/ralph_intervention.md');
        } else {
          // Normal mode: use bootstrap file
          const bootstrapFile = isLeader ? 'KURORYUU_LEADER.md' : 'KURORYUU_WORKER.md';
          args.push(`@${bootstrapFile}`);
        }
      }

      // Add any additional @files from wizard
      if (agentConfig.atFiles?.length) {
        agentConfig.atFiles.forEach(f => args.push(f.startsWith('@') ? f : `@${f}`));
      }
    }

    // Kiro and kuroryuu have their own args but no system prompt support
    if (agentConfig.cliProvider === 'kuroryuu') {
      args.push('--role', 'worker');
    }

    return { cmd, args, env: agentEnv };
  }, [leaderAgent, workerAgents]);

  // Get terminal working directory based on worktree mode
  // Returns worktree path if configured, otherwise projectRoot
  const getTerminalCwd = useCallback((terminalAgentId: string | undefined): string => {
    if (!terminalAgentId) {
      return projectRoot;
    }

    // Find the AgentConfig
    const agentConfig = terminalAgentId === leaderAgent?.id
      ? leaderAgent
      : workerAgents.find(w => w.id === terminalAgentId);

    if (!agentConfig?.worktreeMode) {
      // No worktree mode = default to main project directory
      return projectRoot;
    }

    if (agentConfig.worktreeMode === 'shared' && agentConfig.worktreePath) {
      // Shared mode: use the configured worktree path
      return agentConfig.worktreePath;
    }

    // Per-worker mode: TODO - create worktree on demand
    // For now, fall back to projectRoot (worktree creation will be added later)
    if (agentConfig.worktreeMode === 'per-worker') {
      console.warn('[TerminalGrid] Per-worker worktree mode not yet implemented, using projectRoot');
      return projectRoot;
    }

    return projectRoot;
  }, [projectRoot, leaderAgent, workerAgents]);

  // Get status color
  const getStatusColor = useCallback((status: string) => {
    switch (status) {
      case 'idle': return 'text-green-400';
      case 'busy': return 'text-primary';
      case 'dead': return 'text-red-400';
      default: return 'text-muted-foreground';
    }
  }, []);

  // Get status icon
  const getStatusIcon = useCallback((status: string) => {
    switch (status) {
      case 'idle': return <Wifi className="w-3 h-3" />;
      case 'busy': return <Loader2 className="w-3 h-3 animate-spin" />;
      case 'dead': return <WifiOff className="w-3 h-3" />;
      default: return <Activity className="w-3 h-3" />;
    }
  }, []);

  // Open Worker Wizard to add a new terminal
  const addTerminal = useCallback(() => {
    if (terminals.length >= maxTerminals) return;
    setShowWorkerWizard(true);
  }, [terminals.length, maxTerminals]);

  // Handle Worker Wizard completion - create the terminal with worker config
  const handleWorkerWizardComplete = useCallback((workerConfig: AgentConfig) => {
    const newId = `term-${workerConfig.id}`;
    setTerminals(prev => [
      ...prev,
      {
        id: newId,
        title: workerConfig.name,
        linkedAgentId: workerConfig.id,
        viewMode: 'terminal',
        // Auto-enable Claude Mode for Claude CLI agents (unless explicitly disabled)
        claudeMode: workerConfig.cliProvider === 'claude' && workerConfig.claudeModeEnabled !== false,
        agentConfig: workerConfig,  // Attach config to prevent buildCliConfig race
      }
    ]);
    setActiveId(newId);
    setShowWorkerWizard(false);
  }, []);

  // Handle Thinker launch from unified wizard - creates new terminal and launches thinker
  // FIXED: Follow worker pattern - let Terminal.tsx create PTY to avoid race condition
  const handleThinkerFromWizard = useCallback((basePath: string, personaPath: string, personaName: string) => {
    // Create agent config for this thinker
    const thinkerId = `thinker_${personaName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    const thinkerConfig: AgentConfig = {
      id: thinkerId,
      name: `Thinker: ${personaName}`,
      role: 'worker',
      modelName: 'claude-code',
      backend: 'claude-cli',
      capabilities: ['thinker', 'debate', 'chat'],
      enabled: true,
      cliProvider: 'claude',           // buildCliConfig will use this
      thinkerBasePath: basePath,       // buildCliConfig will add @basePath
      thinkerPersonaPath: personaPath, // buildCliConfig will add @personaPath
      claudeModeEnabled: true,         // Enable Claude Mode for inbox polling
    };

    // Store config in agent-config-store (buildCliConfig looks up configs here)
    addWorkerAgent(thinkerConfig);

    // Create new terminal WITHOUT ptyId - let Terminal.tsx → usePtyProcess create the PTY
    // This avoids the race condition where PTY outputs data before listeners are attached
    const newTerminalId = `term-${thinkerId}`;
    setTerminals(prev => [
      ...prev,
      {
        id: newTerminalId,
        title: `Thinker: ${personaName}`,
        linkedAgentId: thinkerId,
        viewMode: 'terminal',
        claudeMode: true,
        agentConfig: thinkerConfig,  // Attach config to prevent buildCliConfig race
        // NO ptyId - Terminal.tsx will create PTY and call handleTerminalReady
      }
    ]);
    setActiveId(newTerminalId);
    setShowWorkerWizard(false);

    // Register thinker with gateway (startHeartbeat is called by addWorkerAgent if setup complete)
    // But since thinkers may be added before setup completes, explicitly start heartbeat
    startHeartbeat(thinkerId, thinkerConfig);
    console.log('[ThinkerFromWizard] Created terminal for thinker:', thinkerId);
  }, [addWorkerAgent, startHeartbeat]);

  // Handle Workflow Specialist launch from unified wizard - creates new terminal and launches specialist
  // FIXED: Follow worker pattern - let Terminal.tsx create PTY to avoid race condition
  const handleWorkflowSpecialistFromWizard = useCallback((promptPath: string, specialistName: string, profile: string) => {
    // Create agent config for this workflow specialist
    const specialistId = `workflow_${specialistName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    const specialistConfig: AgentConfig = {
      id: specialistId,
      name: `Workflow: ${specialistName}`,
      role: 'worker',
      modelName: 'claude-code',
      backend: 'claude-cli',
      capabilities: ['workflow_specialist', profile],
      enabled: true,
      cliProvider: 'claude',              // buildCliConfig will use this
      specialistPromptPath: promptPath,   // buildCliConfig will add @promptPath
      claudeModeEnabled: true,            // Enable Claude Mode for inbox polling
    };

    // Store config in agent-config-store (buildCliConfig looks up configs here)
    addWorkerAgent(specialistConfig);

    // Create new terminal WITHOUT ptyId - let Terminal.tsx → usePtyProcess create the PTY
    const newTerminalId = `term-${specialistId}`;
    setTerminals(prev => [
      ...prev,
      {
        id: newTerminalId,
        title: `Workflow: ${specialistName}`,
        linkedAgentId: specialistId,
        viewMode: 'terminal',
        claudeMode: true,
        agentConfig: specialistConfig,  // Attach config to prevent buildCliConfig race
        // NO ptyId - Terminal.tsx will create PTY and call handleTerminalReady
      }
    ]);
    setActiveId(newTerminalId);
    setShowWorkerWizard(false);

    // Register with gateway
    startHeartbeat(specialistId, specialistConfig);
    console.log('[WorkflowFromWizard] Created terminal for workflow specialist:', specialistId);
  }, [addWorkerAgent, startHeartbeat]);

  // Handle Thinker Wizard launch - launch thinker into existing terminal
  // FIXED: Follow worker pattern - let Terminal.tsx create PTY to avoid race condition
  const handleThinkerLaunch = useCallback(async (basePath: string, personaPath: string, personaName: string) => {
    const terminalId = thinkerWizardTerminalId;
    if (!terminalId) return;

    const term = terminals.find(t => t.id === terminalId);
    if (!term) return;

    // Create agent config for this thinker
    const thinkerId = `thinker_${personaName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    const thinkerConfig: AgentConfig = {
      id: thinkerId,
      name: `Thinker: ${personaName}`,
      role: 'worker',
      modelName: 'claude-code',
      backend: 'claude-cli',
      capabilities: ['thinker', 'debate', 'chat'],
      enabled: true,
      cliProvider: 'claude',           // buildCliConfig will use this
      thinkerBasePath: basePath,       // buildCliConfig will add @basePath
      thinkerPersonaPath: personaPath, // buildCliConfig will add @personaPath
      claudeModeEnabled: true,         // Enable Claude Mode for inbox polling
    };

    // Kill existing PTY if present (we're replacing it)
    if (term.ptyId) {
      await window.electronAPI.pty.kill(term.ptyId);
    }

    // Store config in agent-config-store
    addWorkerAgent(thinkerConfig);

    // Update terminal: clear ptyId so Terminal.tsx will create new PTY
    // This avoids race condition where PTY outputs before listeners attach
    setTerminals(prev =>
      prev.map(t => t.id === terminalId
        ? {
            ...t,
            ptyId: undefined,      // Clear so Terminal.tsx creates new PTY
            sessionId: undefined,  // Clear so new session is created
            title: `Thinker: ${personaName}`,
            claudeMode: true,
            viewMode: 'terminal' as const,
            linkedAgentId: thinkerId,
            agentConfig: thinkerConfig,  // Attach config to prevent buildCliConfig race
          }
        : t
      )
    );

    // Register with gateway
    startHeartbeat(thinkerId, thinkerConfig);
    console.log('[ThinkerLaunch] Created config for thinker:', thinkerId);

    setThinkerWizardTerminalId(null);
  }, [thinkerWizardTerminalId, terminals, addWorkerAgent, startHeartbeat]);

  // Handle Specialist Wizard launch - launch specialist into existing terminal
  // FIXED: Follow worker pattern - let Terminal.tsx create PTY to avoid race condition
  const handleSpecialistLaunch = useCallback(async (promptPath: string, specialistName: string, profile: string) => {
    const terminalId = specialistWizardTerminalId;
    if (!terminalId) return;

    const term = terminals.find(t => t.id === terminalId);
    if (!term) return;

    // Create agent config for this specialist
    const specialistId = `specialist_${specialistName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    const specialistConfig: AgentConfig = {
      id: specialistId,
      name: `Specialist: ${specialistName}`,
      role: 'worker',
      modelName: 'claude-code',
      backend: 'claude-cli',
      capabilities: ['specialist', profile],
      enabled: true,
      cliProvider: 'claude',              // buildCliConfig will use this
      specialistPromptPath: promptPath,   // buildCliConfig will add @promptPath
      claudeModeEnabled: true,            // Enable Claude Mode for inbox polling
    };

    // Kill existing PTY if present (we're replacing it)
    if (term.ptyId) {
      await window.electronAPI.pty.kill(term.ptyId);
    }

    // Store config in agent-config-store
    addWorkerAgent(specialistConfig);

    // Update terminal: clear ptyId so Terminal.tsx will create new PTY
    setTerminals(prev =>
      prev.map(t => t.id === terminalId
        ? {
            ...t,
            ptyId: undefined,
            sessionId: undefined,
            title: `Specialist: ${specialistName}`,
            claudeMode: true,
            linkedAgentId: specialistId,
            agentConfig: specialistConfig,  // Attach config to prevent buildCliConfig race
          }
        : t
      )
    );

    // Register with gateway
    startHeartbeat(specialistId, specialistConfig);
    console.log('[SpecialistLaunch] Created config for specialist:', specialistId);

    setSpecialistWizardTerminalId(null);
  }, [specialistWizardTerminalId, terminals, addWorkerAgent, startHeartbeat]);

  // Handle Workflow Specialist Wizard launch - launch workflow specialist into existing terminal
  // FIXED: Follow worker pattern - let Terminal.tsx create PTY to avoid race condition
  const handleWorkflowSpecialistLaunch = useCallback(async (promptPath: string, specialistName: string, profile: string) => {
    const terminalId = agentWizardTerminalId;
    if (!terminalId) return;

    const term = terminals.find(t => t.id === terminalId);
    if (!term) return;

    // Create agent config for this workflow specialist
    const specialistId = `workflow_${specialistName.toLowerCase().replace(/\s+/g, '_')}_${Date.now()}`;
    const specialistConfig: AgentConfig = {
      id: specialistId,
      name: `Workflow: ${specialistName}`,
      role: 'worker',
      modelName: 'claude-code',
      backend: 'claude-cli',
      capabilities: ['workflow_specialist', profile],
      enabled: true,
      cliProvider: 'claude',              // buildCliConfig will use this
      specialistPromptPath: promptPath,   // buildCliConfig will add @promptPath
      claudeModeEnabled: true,            // Enable Claude Mode for inbox polling
    };

    // Kill existing PTY if present (we're replacing it)
    if (term.ptyId) {
      await window.electronAPI.pty.kill(term.ptyId);
    }

    // Store config in agent-config-store
    addWorkerAgent(specialistConfig);

    // Update terminal: clear ptyId so Terminal.tsx will create new PTY
    setTerminals(prev =>
      prev.map(t => t.id === terminalId
        ? {
            ...t,
            ptyId: undefined,
            sessionId: undefined,
            title: `Workflow: ${specialistName}`,
            claudeMode: true,
            linkedAgentId: specialistId,
            agentConfig: specialistConfig,  // Attach config to prevent buildCliConfig race
          }
        : t
      )
    );

    // Register with gateway
    startHeartbeat(specialistId, specialistConfig);
    console.log('[WorkflowSpecialistLaunch] Created config for workflow specialist:', specialistId);

    setAgentWizardTerminalId(null);
  }, [agentWizardTerminalId, terminals, addWorkerAgent, startHeartbeat]);

  // Handle Quizmaster launch - direct launch without wizard
  // FIXED: Follow worker pattern - let Terminal.tsx create PTY to avoid race condition
  const handleQuizmasterLaunch = useCallback(async () => {
    const quizmasterId = `quizmaster_${Date.now()}`;

    try {
      // Get quizmaster prompt path
      const result = await window.electronAPI.quizmaster.getPromptPath();
      if (!result.ok || !result.promptPath) {
        toast.error('Failed to get quizmaster prompt path');
        return;
      }

      // Create agent config with prompt path
      const quizmasterConfig: AgentConfig = {
        id: quizmasterId,
        name: 'Quizmaster Planning',
        role: 'worker',
        modelName: 'claude-opus-4',
        backend: 'claude-cli',
        capabilities: ['quizmaster', 'planning', 'requirements'],
        enabled: true,
        cliProvider: 'claude',                  // buildCliConfig will use this
        specialistPromptPath: result.promptPath, // buildCliConfig will add @promptPath
        claudeModeEnabled: true,                // Enable Claude Mode for inbox polling
      };

      // Store config in agent-config-store
      addWorkerAgent(quizmasterConfig);

      // Create terminal WITHOUT ptyId - let Terminal.tsx create the PTY
      const newTerminal: TerminalInstance = {
        id: `quizmaster_terminal_${Date.now()}`,
        title: 'Quizmaster Planning',
        linkedAgentId: quizmasterId,
        claudeMode: true,
        viewMode: 'terminal',
        agentConfig: quizmasterConfig,  // Attach config to prevent buildCliConfig race
        // NO ptyId - Terminal.tsx will create PTY and call handleTerminalReady
      };

      setTerminals(prev => [...prev, newTerminal]);

      // Register with gateway
      startHeartbeat(quizmasterId, quizmasterConfig);
      console.log('[Quizmaster] Created terminal for quizmaster:', quizmasterId);
      toast.success('Quizmaster planning session started');
    } catch (err) {
      console.error('[Quizmaster] Failed to launch:', err);
      toast.error('Failed to launch quizmaster');
    }
  }, [addWorkerAgent, startHeartbeat]);

  // Ralph Launch - EXACT same pattern as Quizmaster
  // This is the "instant spawn" route that works perfectly
  const handleRalphLaunch = useCallback(async () => {
    const ralphId = `ralph_leader_${Date.now()}`;

    try {
      // Create leader config with Ralph mode enabled
      // Mirrors Quizmaster pattern exactly
      const ralphConfig: AgentConfig = {
        id: ralphId,
        name: 'Ralph Leader',
        role: 'leader',                         // Leader, not worker
        modelName: 'claude-opus-4',
        backend: 'claude-cli',
        capabilities: ['orchestration', 'chat', 'code', 'terminal', 'ralph'],
        enabled: true,
        cliProvider: 'claude',                  // buildCliConfig will use this
        ralphMode: true,                        // buildCliConfig will add Ralph @files
        claudeModeEnabled: true,                // Enable Claude Mode for inbox polling
      };

      // Store config in agent-config-store (as leader)
      setLeaderAgent(ralphConfig);

      // Kill any existing leader terminal PTYs
      const existingLeader = terminals.find(t => t.linkedAgentId && workerAgents.every(w => w.id !== t.linkedAgentId) && t.linkedAgentId !== ralphId);
      if (existingLeader?.ptyId) {
        await window.electronAPI.pty.kill(existingLeader.ptyId).catch(() => {});
      }

      // Create terminal WITHOUT ptyId - let Terminal.tsx create the PTY
      // This is the EXACT Quizmaster pattern that works perfectly
      const newTerminal: TerminalInstance = {
        id: `ralph_terminal_${Date.now()}`,
        title: 'Ralph Leader',
        linkedAgentId: ralphId,
        claudeMode: true,
        viewMode: 'terminal',
        agentConfig: ralphConfig,  // Attach config to prevent buildCliConfig race
        // NO ptyId - Terminal.tsx will create PTY and call handleTerminalReady
      };

      // Replace all terminals with just Ralph (leader gets clean slate)
      setTerminals([newTerminal]);
      setActiveId(newTerminal.id);

      // Register with gateway
      startHeartbeat(ralphId, ralphConfig);
      console.log('[Ralph] Created terminal for Ralph leader:', ralphId);
      toast.success('Ralph leader session started');
    } catch (err) {
      console.error('[Ralph] Failed to launch:', err);
      toast.error('Failed to launch Ralph');
    }
  }, [setLeaderAgent, terminals, workerAgents, startHeartbeat]);

  // Handle leader terminal creation from wizard (Quizmaster pattern for Ralph)
  // This creates the terminal DIRECTLY with viewMode: 'terminal', skipping the
  // reactive useEffect that would restore with viewMode: 'pending'
  const handleCreateLeaderTerminalFromWizard = useCallback((config: AgentConfig) => {
    console.log('[LeaderWizard] Creating leader terminal directly (Quizmaster pattern)');
    console.log('[LeaderWizard] Config:', config.id, config.ralphMode ? '(Ralph mode)' : '');

    // Kill any existing leader terminal PTYs
    const existingLeader = terminals.find(t =>
      t.linkedAgentId === config.id ||
      (t.linkedAgentId && workerAgents.every(w => w.id !== t.linkedAgentId))
    );
    if (existingLeader?.ptyId) {
      window.electronAPI.pty.kill(existingLeader.ptyId).catch(() => {});
    }

    // Create terminal WITHOUT ptyId - let Terminal.tsx create the PTY
    // This is the EXACT Quizmaster pattern that works perfectly
    // Store agentConfig directly to avoid race condition with store lookup
    const newTerminal: TerminalInstance = {
      id: `term-${config.id}`,
      title: config.name,
      linkedAgentId: config.id,
      claudeMode: config.cliProvider === 'claude',
      viewMode: 'terminal',
      agentConfig: config,  // Store config directly - buildCliConfig will use this first
      // NO ptyId - Terminal.tsx will create PTY and call handleTerminalReady
    };

    // Replace all terminals with the new leader terminal (clean slate)
    setTerminals([newTerminal]);
    setActiveId(newTerminal.id);

    // Register with gateway
    startHeartbeat(config.id, config);

    const modeLabel = config.ralphMode ? 'Ralph leader' : 'Leader';
    console.log(`[LeaderWizard] Created terminal for ${modeLabel}:`, config.id);
    toast.success(`${modeLabel} session started`);
  }, [terminals, workerAgents, startHeartbeat]);

  const removeTerminal = useCallback((id: string) => {
    // Kill PTY first before removing terminal
    const term = terminals.find(t => t.id === id);
    if (term?.ptyId) {
      window.electronAPI.pty.kill(term.ptyId);
    }

    // Deregister agent from gateway
    if (term?.linkedAgentId) {
      deregisterAgent(term.linkedAgentId);

      // If it's a worker (not leader), also remove from agent config
      // This prevents the worker from respawning on app restart
      if (term.linkedAgentId !== leaderAgent?.id) {
        removeWorkerAgent(term.linkedAgentId);
      }
    }

    // Remove sub-agent config for this terminal
    useSubAgentConfigStore.getState().removeConfig(id);

    // Immediately remove from persistence (bypasses debounce)
    window.electronAPI?.pty?.removeSession?.(id);

    setTerminals(prev => {
      const filtered = prev.filter(t => t.id !== id);
      // If removing active terminal, switch to first available
      if (activeId === id && filtered.length > 0) {
        setActiveId(filtered[0].id);
      }
      return filtered;
    });
  }, [terminals, activeId, leaderAgent, removeWorkerAgent]);

  // Force restart a worker terminal - kills PTY and spawns fresh instance
  const restartTerminal = useCallback((id: string) => {
    const term = terminals.find(t => t.id === id);
    if (!term) return;

    // Kill existing PTY
    if (term.ptyId) {
      window.electronAPI.pty.kill(term.ptyId);
    }

    // Clear ptyId AND increment restartCount to force Terminal remount
    // The key includes restartCount, so incrementing it forces fresh usePtyProcess refs
    setTerminals(prev =>
      prev.map(t => t.id === id
        ? {
            ...t,
            ptyId: undefined,
            sessionId: undefined,
            viewMode: 'terminal' as const,
            restartCount: (t.restartCount || 0) + 1,
          }
        : t
      )
    );

  }, [terminals]);

  // Restart agent with full gateway deregistration and respawn
  const restartAgent = useCallback(async (id: string) => {
    const term = terminals.find(t => t.id === id);
    if (!term) {
      toast.error('Terminal not found');
      return;
    }

    const agentId = term.linkedAgentId;
    if (!agentId) {
      toast.error('No agent linked to this terminal');
      return;
    }

    try {
      // 1. Deregister from gateway
      const success = await deregisterAgent(agentId);
      if (!success) {
        toast.warning('Agent may not have been registered, continuing restart...');
      }

      // 2. Kill existing PTY
      if (term.ptyId) {
        await window.electronAPI.pty.kill(term.ptyId);
      }

      // 3. Clear ptyId AND increment restartCount to force Terminal remount
      setTerminals(prev =>
        prev.map(t => t.id === id
          ? {
              ...t,
              ptyId: undefined,
              sessionId: undefined,
              viewMode: 'terminal' as const,
              restartCount: (t.restartCount || 0) + 1,
            }
          : t
        )
      );

      // 4. Re-register agent with gateway
      const agentConfig = workerAgents.find(w => w.id === agentId) || (leaderAgent?.id === agentId ? leaderAgent : null);
      if (agentConfig) {
        startHeartbeat(agentId, agentConfig);
      }

      toast.success(`Agent restarted successfully`);
    } catch (error) {
      console.error('[TerminalGrid] Failed to restart agent:', error);
      toast.error(`Failed to restart agent: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }

    // Close confirmation dialog
    setRestartConfirmTerminalId(null);
  }, [terminals, workerAgents, leaderAgent, startHeartbeat]);

  // Start terminal from pending state - direct transition to terminal view
  const startTerminal = useCallback((id: string) => {
    const term = terminals.find(t => t.id === id);
    fileLogger.log('TerminalGrid', 'Starting terminal', { id, oldPtyId: term?.ptyId });

    // Kill old PTY if exists
    if (term?.ptyId) {
      window.electronAPI.pty.kill(term.ptyId).catch(() => {});
    }

    // DIRECT transition: pending → terminal (no intermediate chat state!)
    // Clear ptyId so Terminal component creates fresh PTY via usePtyProcess
    setTerminals(prev =>
      prev.map(t => t.id === id ? {
        ...t,
        ptyId: undefined,
        sessionId: undefined,
        viewMode: 'terminal' as const
      } : t)
    );
  }, [terminals]);

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, id: string) => {
    setDraggedId(id);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, id: string) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    if (draggedId && id !== draggedId) {
      setDragOverId(id);
    }
  }, [draggedId]);

  const handleDragLeave = useCallback(() => {
    setDragOverId(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggedId || draggedId === targetId) {
      setDraggedId(null);
      setDragOverId(null);
      return;
    }

    setTerminals(prev => {
      const newTerminals = [...prev];
      const draggedIndex = newTerminals.findIndex(t => t.id === draggedId);
      const targetIndex = newTerminals.findIndex(t => t.id === targetId);

      if (draggedIndex !== -1 && targetIndex !== -1) {
        const [dragged] = newTerminals.splice(draggedIndex, 1);
        newTerminals.splice(targetIndex, 0, dragged);
      }

      return newTerminals;
    });

    setDraggedId(null);
    setDragOverId(null);
  }, [draggedId]);

  const handleDragEnd = useCallback(() => {
    setDraggedId(null);
    setDragOverId(null);
  }, []);

  const toggleClaudeMode = useCallback((id: string) => {
    setTerminals(prev =>
      prev.map(t => {
        if (t.id === id) {
          const newMode = !t.claudeMode;
          // Write/delete Claude Mode flag file via IPC (if PTY session exists)
          if (t.sessionId) {
            window.electronAPI?.pty.setClaudeMode(t.sessionId, newMode);
          }
          return { ...t, claudeMode: newMode };
        }
        return t;
      })
    );
  }, []);

  // Toggle COG settings panel for a terminal
  const toggleCogSettings = useCallback((id: string) => {
    setTerminals(prev =>
      prev.map(t => t.id === id
        ? { ...t, showCogSettings: !t.showCogSettings }
        : { ...t, showCogSettings: false } // Close others
      )
    );
  }, []);

  // Insert transcript into terminal input (T074) - must be before stopRecording
  const insertTranscriptIntoTerminal = useCallback((terminalId: string, transcript: string) => {
    const term = terminals.find(t => t.id === terminalId);
    if (!term) {
      console.error('[VoiceInput] Terminal not found:', terminalId);
      return;
    }

    if (!term.ptyId) {
      console.error('[VoiceInput] PTY not initialized for terminal:', terminalId);
      return;
    }

    try {
      // Write transcript to PTY
      window.electronAPI.pty.write(term.ptyId, transcript);
    } catch (error) {
      console.error('[VoiceInput] Failed to insert transcript:', error);
    }
  }, [terminals]);

  // Stop audio monitoring and cleanup resources
  const stopAudioMonitoring = useCallback(() => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }
    analyserRef.current = null;
    silenceStartRef.current = null;
    setAudioLevel(0);
  }, []);

  // Stop recording and process audio
  const stopRecording = useCallback(async (terminalId: string) => {
    // Mark recording as stopped (for monitorLevel closure)
    isRecordingRef.current = false;

    // Stop audio monitoring first
    stopAudioMonitoring();

    // Stop media stream tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }

    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
      mediaRecorderRef.current.stop();
      mediaRecorderRef.current.addEventListener('stop', async () => {
        try {
          // Create audio blob (webm format from MediaRecorder)
          const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });

          // Skip if no audio data
          if (audioBlob.size < 1000) {
            audioChunksRef.current = [];
            mediaRecorderRef.current = null;
            setRecordingTerminalId(null);
            return;
          }

          // Convert blob to ArrayBuffer for IPC transfer
          const arrayBuffer = await audioBlob.arrayBuffer();

          // Direct dictation: Whisper -> terminal (no LMStudio)
          const result = await window.electronAPI?.audio?.transcribe(
            Array.from(new Uint8Array(arrayBuffer)),
            'audio/webm',
            'whisper'       // Use local Whisper (offline)
          );

          if (result?.success && result.transcription) {
            // Insert transcription directly into terminal
            insertTranscriptIntoTerminal(terminalId, result.transcription);
          }

          // Reset recording state
          audioChunksRef.current = [];
          mediaRecorderRef.current = null;
          setRecordingTerminalId(null);
        } catch (error) {
          console.error('[VoiceInput] Error stopping recording:', error);
          setRecordingTerminalId(null);
        }
      }, { once: true });
    } else {
      setRecordingTerminalId(null);
    }
  }, [stopAudioMonitoring, insertTranscriptIntoTerminal]);

  // Cleanup audio recording resources on unmount
  useEffect(() => {
    return () => {
      // Stop animation frame
      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
      }
      // Close audio context
      if (audioContextRef.current) {
        audioContextRef.current.close().catch(() => {});
        audioContextRef.current = null;
      }
      // Stop media stream tracks
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
        streamRef.current = null;
      }
      // Stop media recorder
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        try {
          mediaRecorderRef.current.stop();
        } catch {
          // Ignore errors during cleanup
        }
        mediaRecorderRef.current = null;
      }
      // Clear refs
      analyserRef.current = null;
      audioChunksRef.current = [];
    };
  }, []);

  // Handle microphone button click for audio recording (Whisper dictation with auto-stop)
  const handleMicClick = useCallback(async (terminalId: string) => {
    if (recordingTerminalId === terminalId) {
      // Manual stop
      await stopRecording(terminalId);
    } else {
      // Start recording
      try {
        // Request microphone access
        const stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true
          }
        });

        streamRef.current = stream;

        // Set up Web Audio API for level monitoring
        const audioContext = new AudioContext();
        const analyser = audioContext.createAnalyser();
        const source = audioContext.createMediaStreamSource(stream);

        analyser.fftSize = 256;
        analyser.smoothingTimeConstant = 0.3;
        source.connect(analyser);

        audioContextRef.current = audioContext;
        analyserRef.current = analyser;

        // Create media recorder
        const recorder = new MediaRecorder(stream, {
          mimeType: 'audio/webm'
        });

        // Collect audio chunks
        audioChunksRef.current = [];
        recorder.ondataavailable = (event) => {
          if (event.data.size > 0) {
            audioChunksRef.current.push(event.data);
          }
        };

        // Start recording with timeslice for continuous data
        recorder.start(100); // Get data every 100ms
        mediaRecorderRef.current = recorder;
        setRecordingTerminalId(terminalId);
        silenceStartRef.current = null;
        isRecordingRef.current = true; // Mark recording as active

        // Audio level monitoring loop
        const dataArray = new Uint8Array(analyser.frequencyBinCount);
        let hasSpokenOnce = false; // Track if user has spoken

        const monitorLevel = () => {
          // Use ref instead of state for stable closure
          if (!analyserRef.current || !isRecordingRef.current) {
            return;
          }

          analyserRef.current.getByteFrequencyData(dataArray);

          // Calculate RMS level
          let sum = 0;
          for (let i = 0; i < dataArray.length; i++) {
            const value = dataArray[i] / 255;
            sum += value * value;
          }
          const rms = Math.sqrt(sum / dataArray.length);
          setAudioLevel(rms);

          // Check for silence (only after user has spoken at least once)
          if (rms < silenceThreshold) {
            if (hasSpokenOnce) {
              if (!silenceStartRef.current) {
                silenceStartRef.current = Date.now();
              } else {
                const elapsed = Date.now() - silenceStartRef.current;
                if (elapsed > silenceTimeoutMs) {
                  stopRecording(terminalId);
                  return;
                }
              }
            }
          } else {
            // Voice detected - reset silence timer
            silenceStartRef.current = null;

            // Mark as spoken if level is high enough
            if (rms > voiceThreshold) {
              hasSpokenOnce = true;
            }
          }

          animationFrameRef.current = requestAnimationFrame(monitorLevel);
        };

        // Start monitoring after a brief delay to let audio context initialize
        setTimeout(() => {
          animationFrameRef.current = requestAnimationFrame(monitorLevel);
        }, 100);

      } catch (error) {
        console.error('[VoiceInput] Microphone access error:', error);
        if (error instanceof DOMException && error.name === 'NotAllowedError') {
          console.error('[VoiceInput] Microphone permission denied by user');
        } else if (error instanceof DOMException && error.name === 'NotFoundError') {
          console.error('[VoiceInput] No microphone device found');
        }
      }
    }
  }, [recordingTerminalId, stopRecording, silenceThreshold, voiceThreshold, silenceTimeoutMs]);

  // Cycle status line display mode (full -> compact -> minimal -> full)
  const cycleStatusLineMode = useCallback(async () => {
    const modes: ('full' | 'compact' | 'minimal')[] = ['full', 'compact', 'minimal'];
    const modeFile = '.claude/statusline-mode';

    // Cycle to next mode based on current state
    const idx = modes.indexOf(statusLineMode);
    const next = modes[(idx + 1) % modes.length];

    // Update state and write to file
    setStatusLineMode(next);
    try {
      await window.electronAPI?.fs?.writeFile?.(modeFile, next);
      console.log(`[StatusLine] Mode changed: ${statusLineMode} → ${next}`);
    } catch (err) {
      console.error('[StatusLine] Failed to write mode file:', err);
    }
  }, [statusLineMode]);

  // Initialize sub-agent config when terminal is created
  const { initializeConfig } = useSubAgentConfigStore();

  // Utility: Get the correct line ending for terminal command execution
  // PowerShell/CMD require \r\n (CRLF) to execute commands
  // Unix shells (bash/zsh) accept \n (line feed)
  const getTerminalLineEnding = (): string => {
    // Check if we're in browser environment
    if (typeof window !== 'undefined' && window.navigator) {
      const platform = window.navigator.platform.toLowerCase();
      if (platform.includes('win')) {
        return '\r\n'; // Windows (PowerShell, CMD): CRLF required for execution
      }
    }

    // Check Node.js process (if available in renderer via contextBridge)
    if (typeof process !== 'undefined' && process.platform === 'win32') {
      return '\r\n'; // Windows: CRLF required for execution
    }

    // Default to Unix line ending
    return '\n'; // Unix (bash, zsh): line feed
  };

  // M5: Handle leader messages - write to terminal PTY
  const handleLeaderMessage = useCallback(async (msg: LeaderMessage) => {
    // Find any terminal with a PTY
    const termWithPty = terminals.find(t => t.ptyId);

    if (termWithPty?.ptyId) {
      // Get platform-appropriate line ending
      const lineEnding = getTerminalLineEnding();

      // Ensure command ends with the correct line ending for execution
      let command = msg.content;
      if (!command.endsWith(lineEnding)) {
        command = command + lineEnding;
      }

      try {
        // Write command to PTY
        const writeResult = await window.electronAPI?.pty?.write?.(termWithPty.ptyId, command);

        // Verify the command was written
        if (writeResult === false || writeResult === undefined) {
          throw new Error('PTY write returned false or undefined');
        }
      } catch (error) {
        console.error('[LeaderMessage] PTY write error:', error);
      }
    } else {
      console.warn('[LeaderMessage] No terminal with PTY available, message not delivered:', msg.content);
    }
  }, [terminals]);

  // Auto-initialize leader for injection testing
  // Initialize even if setup wizard hasn't run yet, so leader messages can be injected
  useEffect(() => {
    if (!leaderAgent) {
      const defaultLeaderConfig: AgentConfig = {
        id: `leader_lmstudio_${Date.now()}`,
        name: 'Leader',
        role: 'leader',
        modelName: 'devstral-small',
        backend: 'lmstudio',
        capabilities: ['orchestration', 'chat', 'code', 'terminal'],
        enabled: true,
        endpoint: 'http://169.254.83.107:1234',
        bootstrapPath: `${projectRoot}\\KURORYUU_LEADER.md`,
      };
      setLeaderAgent(defaultLeaderConfig);
    }
  }, [leaderAgent, setLeaderAgent, projectRoot]);

  // Get worker ID for polling - the gateway worker ID this app should receive messages for
  // This desktop app polls for leader messages at: /v1/leader/messages/{worker_id}
  // The worker_id should match the agent_id registered with the gateway
  const leaderWorkerId = useMemo(() => {
    // Check if we have a stored worker ID in localStorage (set by previous session)
    const storedWorkerId = localStorage.getItem('gateway_worker_id');
    if (storedWorkerId) {
      return storedWorkerId;
    }

    // Fallback: Use the standard registered worker ID
    // This matches the agent_id that the worker process registers with the gateway
    return 'worker_custom_1767991969081';
  }, []);

  // Poll for leader messages
  useLeaderMessages(leaderWorkerId, handleLeaderMessage);


  const handleTerminalReady = useCallback((terminalId: string, ptyId: string, sessionId?: string) => {
    setTerminals(prev =>
      prev.map(t => {
        if (t.id === terminalId) {
          // NOTE: Ralph prompts are now loaded via buildCliConfig() @files at spawn time
          // No need to manually send 'claude' or '/k-ralph' commands here
          // buildCliConfig() adds: @KURORYUU_LEADER.md @ralph_prime.md @ralph_loop.md @ralph_intervention.md

          // If Claude Mode was pre-set (from wizard) and we now have sessionId, write flag file
          if (t.claudeMode && sessionId) {
            window.electronAPI?.pty.setClaudeMode(sessionId, true);
          }
          return { ...t, ptyId, sessionId };
        }
        return t;
      })
    );
  }, []);

  // Determine grid layout based on terminal count (size-aware grouping)
  const getGridClass = () => {
    if (gridLayout === '2x2') return 'grid-cols-2 grid-rows-2';
    if (gridLayout === '3x3') return 'grid-cols-3 grid-rows-3';

    // Auto layout based on count
    const count = terminals.length;
    if (count === 1) return 'grid-cols-1 grid-rows-1';
    if (count === 2) return 'grid-cols-2 grid-rows-1';
    if (count <= 4) return 'grid-cols-2 grid-rows-2';
    if (count <= 6) return 'grid-cols-3 grid-rows-2';
    if (count <= 9) return 'grid-cols-3 grid-rows-3';
    return 'grid-cols-4 grid-rows-3'; // up to 12
  };

  // Window mode helpers
  const getDefaultWindowState = (termId: string, index: number) => {
    const offset = index * 40;
    return {
      x: 20 + offset,
      y: 20 + offset,
      width: 550,
      height: 380,
      zIndex: index + 1,
    };
  };

  const updateWindowState = useCallback((termId: string, updates: Partial<typeof windowStates[string]>) => {
    setWindowStates(prev => ({
      ...prev,
      [termId]: { ...(prev[termId] || getDefaultWindowState(termId, 0)), ...updates }
    }));
  }, []);

  const bringToFront = useCallback((termId: string) => {
    const maxZ = Math.max(...Object.values(windowStates).map(s => s?.zIndex || 0), 0);
    updateWindowState(termId, { zIndex: maxZ + 1 });
  }, [windowStates, updateWindowState]);

  // Window mode drop zone detection
  const detectDropZone = useCallback((clientX: number, clientY: number): typeof activeDropZone => {
    const container = windowContainerRef.current;
    if (!container) return null;

    const rect = container.getBoundingClientRect();
    const relX = (clientX - rect.left) / rect.width;  // 0-1
    const relY = (clientY - rect.top) / rect.height;  // 0-1

    const edgeThreshold = 0.12; // 12% from edge triggers zone

    if (relY < edgeThreshold) return 'top';
    if (relY > 1 - edgeThreshold) return 'bottom';
    if (relX < edgeThreshold) return 'left';
    if (relX > 1 - edgeThreshold) return 'right';
    if (relX > 0.35 && relX < 0.65 && relY > 0.35 && relY < 0.65) return 'center';
    return null;
  }, []);

  // Apply drop zone positioning to window
  const applyDropZone = useCallback((termId: string, zone: typeof activeDropZone) => {
    const container = windowContainerRef.current;
    if (!container || !zone) return;

    const rect = container.getBoundingClientRect();
    const { width, height } = rect;

    const zonePositions: Record<string, { x: number; y: number; width: number; height: number }> = {
      top:    { x: 0, y: 0, width, height: height / 2 },
      bottom: { x: 0, y: height / 2, width, height: height / 2 },
      left:   { x: 0, y: 0, width: width / 2, height },
      right:  { x: width / 2, y: 0, width: width / 2, height },
      center: { x: 0, y: 0, width, height },
    };

    const pos = zonePositions[zone];
    const maxZ = Math.max(...Object.values(windowStates).map(s => s?.zIndex || 0), 0);
    setWindowStates(prev => ({
      ...prev,
      [termId]: { ...prev[termId], ...pos, zIndex: maxZ + 1 }
    }));
  }, [windowStates]);

  // Window mode drag handler - CSS-based with drop zone detection
  const handleWindowDrag = useCallback((e: React.MouseEvent, termId: string) => {
    const target = e.target as HTMLElement;
    if (!target.closest('.window-drag-handle')) return;

    e.preventDefault();
    bringToFront(termId);
    setIsDraggingWindow(true);
    setDraggingWindowId(termId);
    const startX = e.clientX;
    const startY = e.clientY;
    const state = windowStates[termId] || getDefaultWindowState(termId, 0);

    const onMove = (moveE: MouseEvent) => {
      // Update window position
      updateWindowState(termId, {
        x: Math.max(0, state.x + moveE.clientX - startX),
        y: Math.max(0, state.y + moveE.clientY - startY),
      });
      // Detect drop zone hover
      const zone = detectDropZone(moveE.clientX, moveE.clientY);
      setActiveDropZone(zone);
    };
    const onUp = (upE: MouseEvent) => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);

      // Apply drop zone if active
      const finalZone = detectDropZone(upE.clientX, upE.clientY);
      if (finalZone) {
        applyDropZone(termId, finalZone);
      }

      // Reset drag state
      setIsDraggingWindow(false);
      setDraggingWindowId(null);
      setActiveDropZone(null);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [windowStates, updateWindowState, bringToFront, detectDropZone, applyDropZone]);

  // Window mode resize handler
  const handleWindowResize = useCallback((e: React.MouseEvent, termId: string, direction: string) => {
    e.preventDefault();
    e.stopPropagation();
    bringToFront(termId);
    const startX = e.clientX;
    const startY = e.clientY;
    const state = windowStates[termId] || getDefaultWindowState(termId, 0);

    const onMove = (moveE: MouseEvent) => {
      const dx = moveE.clientX - startX;
      const dy = moveE.clientY - startY;
      const updates: Partial<typeof state> = {};

      if (direction.includes('e')) updates.width = Math.max(350, state.width + dx);
      if (direction.includes('s')) updates.height = Math.max(200, state.height + dy);
      if (direction.includes('w')) { updates.x = state.x + dx; updates.width = Math.max(350, state.width - dx); }
      if (direction.includes('n')) { updates.y = state.y + dy; updates.height = Math.max(200, state.height - dy); }

      updateWindowState(termId, updates);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [windowStates, updateWindowState, bringToFront]);

  // Splitter mode resize handler (horizontal - drag to adjust widths)
  const handleSplitterResize = useCallback((e: React.MouseEvent, splitIndex: number) => {
    e.preventDefault();
    const container = e.currentTarget.parentElement;
    if (!container) return;

    const startX = e.clientX;
    const totalWidth = container.clientWidth;
    const initialSizes = splitterSizes.length === terminals.length
      ? [...splitterSizes]
      : terminals.map(() => 100 / terminals.length);

    const onMove = (moveE: MouseEvent) => {
      const dx = moveE.clientX - startX;
      const deltaPercent = (dx / totalWidth) * 100;

      const newSizes = [...initialSizes];
      newSizes[splitIndex] = Math.max(10, initialSizes[splitIndex] + deltaPercent);
      newSizes[splitIndex + 1] = Math.max(10, initialSizes[splitIndex + 1] - deltaPercent);

      setSplitterSizes(newSizes);
    };
    const onUp = () => {
      document.removeEventListener('mousemove', onMove);
      document.removeEventListener('mouseup', onUp);
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
  }, [splitterSizes, terminals.length]);

  // NOTE: We render ALL terminals always to preserve xterm instances.
  // Non-expanded terminals are hidden with CSS (display:none) not filtered out.
  // This prevents xterm destruction/recreation when toggling fullscreen.

  // Helper to render terminal card header content (shared across all layout modes)
  const renderTerminalHeader = (term: TerminalInstance, index: number, linkedAgent: Agent | undefined) => (
    <>
      <div className="flex items-center gap-2">
        {/* Agent status indicator */}
        {linkedAgent ? (
          <>
            <span className={`${getStatusColor(linkedAgent.status)}`}>
              {getStatusIcon(linkedAgent.status)}
            </span>
            <span className="text-xs font-medium text-muted-foreground">
              {getTerminalDisplayName(term, index, linkedAgent)}
            </span>
            {linkedAgent.role === 'leader' && (
              <span title="Leader"><Crown className="w-3 h-3 text-primary" /></span>
            )}
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
              linkedAgent.status === 'idle' ? 'bg-green-500/20 text-green-400' :
              linkedAgent.status === 'busy' ? 'bg-primary/20 text-primary' :
              'bg-red-500/20 text-red-400'
            }`}>
              {linkedAgent.status}
            </span>
            <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
              linkedAgent.role === 'leader'
                ? 'bg-primary/30 text-primary border border-primary/50'
                : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
            }`}>
              {linkedAgent.role === 'leader' ? 'L' : `W${index}`}
            </span>
          </>
        ) : (
          <>
            <Activity className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground">{term.title}</span>
            <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium">
              unregistered
            </span>
            <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-secondary/50 text-muted-foreground border border-border">
              #{index}
            </span>
          </>
        )}
        {term.claudeMode && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-medium">
            Claude
          </span>
        )}
      </div>
      <div className="flex items-center gap-1">
        {/* Mic, Copy, Paste, Settings buttons */}
        <button
          tabIndex={-1}
          onClick={() => handleMicClick(term.id)}
          onContextMenu={(e) => { e.preventDefault(); setShowMicSettings({ x: e.clientX, y: e.clientY }); }}
          className={`p-1.5 rounded-full transition-all flex items-center justify-center relative ${
            recordingTerminalId === term.id
              ? 'text-white bg-red-500 hover:bg-red-600'
              : 'text-muted-foreground hover:text-blue-400 hover:bg-secondary'
          }`}
          title={recordingTerminalId === term.id ? 'Recording...' : 'Voice input'}
        >
          {recordingTerminalId === term.id ? <Square className="w-3 h-3 fill-white" /> : <Mic className="w-3 h-3" />}
        </button>
        <button
          tabIndex={-1}
          onClick={() => {
            const termRef = termRefs.current.get(term.id);
            if (termRef && termRef.getSelection()) {
              navigator.clipboard.writeText(termRef.getSelection());
            }
          }}
          className="p-1 rounded transition-colors text-muted-foreground hover:text-blue-400 hover:bg-secondary"
          title="Copy"
        >
          <Copy className="w-3 h-3" />
        </button>
        <button
          tabIndex={-1}
          onClick={async () => {
            try {
              const text = await navigator.clipboard.readText();
              if (text && term.ptyId) window.electronAPI.pty.write(term.ptyId, text);
            } catch {}
          }}
          className="p-1 rounded transition-colors text-muted-foreground hover:text-green-400 hover:bg-secondary"
          title="Paste"
        >
          <Clipboard className="w-3 h-3" />
        </button>
        {term.claudeMode && (
          <button
            tabIndex={-1}
            onClick={() => cycleStatusLineMode()}
            className="p-1 rounded transition-colors text-muted-foreground hover:text-orange-400 hover:bg-secondary"
            title={`Status line: ${statusLineMode.toUpperCase()} (click to cycle)`}
          >
            <Layers className="w-3 h-3" />
          </button>
        )}
        {/* NOTE: PM button hidden for public release - /plan command still works manually
        {term.claudeMode && (
          <button
            tabIndex={-1}
            onClick={() => {
              if (term.ptyId) {
                console.log('[PM] Entering plan mode');
                window.electronAPI.pty.write(term.ptyId, '/plan');
                setTimeout(() => {
                  window.electronAPI.pty.write(term.ptyId!, '\r');
                }, 100);
              } else {
                console.warn('[PM] No ptyId for terminal:', term.id);
              }
            }}
            className="px-1.5 py-0.5 rounded transition-colors bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 text-[10px] font-bold"
            title="Enter Plan Mode (/plan)"
          >
            PM
          </button>
        )}
        */}
        {linkedAgent?.role === 'leader' && (
          <button
            tabIndex={-1}
            onClick={() => setShowLeaderMonitor(true)}
            className="p-1 rounded transition-colors text-muted-foreground hover:text-primary hover:bg-primary/10"
            title="Leader Monitor"
          >
            <Eye className="w-3 h-3" />
          </button>
        )}
        {linkedAgent && <AgentCogButton onClick={() => toggleCogSettings(term.id)} isActive={term.showCogSettings || false} />}
        {linkedAgent && linkedAgent.status !== 'dead' && linkedAgent.role !== 'leader' && (
          <button tabIndex={-1} onClick={async () => {
            // Kill PTY first, then deregister agent
            if (term.ptyId) await window.electronAPI.pty.kill(term.ptyId);
            killAgent(linkedAgent.agent_id);
          }} className="p-1 text-muted-foreground hover:text-red-400 rounded hover:bg-red-500/10" title="Kill Agent">
            <Skull className="w-3 h-3" />
          </button>
        )}
        {term.claudeMode && (
          <button tabIndex={-1} onClick={() => setAgentWizardTerminalId(term.id)} className="p-1 rounded text-muted-foreground hover:text-primary hover:bg-primary/10" title="Agent Launcher">
            <Brain className="w-3 h-3" />
          </button>
        )}
        <button
          tabIndex={-1}
          onClick={() => toggleClaudeMode(term.id)}
          className={`p-1 rounded ${term.claudeMode ? 'text-purple-400 bg-purple-500/20' : 'text-muted-foreground hover:text-foreground hover:bg-secondary'}`}
          title={term.claudeMode ? 'Disable Claude' : 'Enable Claude'}
        >
          <Sparkles className="w-3 h-3" />
        </button>
        {terminals.length > 1 && linkedAgent?.role !== 'leader' && (
          <button tabIndex={-1} onClick={() => removeTerminal(term.id)} className="p-1 text-muted-foreground hover:text-red-400 rounded hover:bg-secondary" title="Close">
            <X className="w-3 h-3" />
          </button>
        )}
      </div>
    </>
  );

  // Helper to render terminal content (shared across all layout modes)
  const renderTerminalContent = (term: TerminalInstance, index: number, linkedAgent: Agent | undefined) => (
    <>
      {term.viewMode === 'pending' ? (
        <div className="absolute inset-0 flex items-center justify-center bg-card">
          <button onClick={() => startTerminal(term.id)} className="px-6 py-3 bg-primary hover:bg-primary/90 rounded-lg flex items-center gap-2 text-primary-foreground font-medium">
            <Play className="w-5 h-5" />
            Start Terminal
          </button>
        </div>
      ) : (
        <Terminal
          key={`terminal-${term.id}-${term.linkedAgentId || 'shell'}-${term.restartCount || 0}`}
          terminalId={term.id}
          id={term.ptyId}
          onReady={(ptyId, sessionId) => handleTerminalReady(term.id, ptyId, sessionId)}
          onTermRef={(ref) => {
            if (ref) termRefs.current.set(term.id, ref);
            else termRefs.current.delete(term.id);
          }}
          cwd={getTerminalCwd(term.linkedAgentId)}
          cliConfig={buildCliConfig(term.linkedAgentId, term)}
        />
      )}
    </>
  );

  const handleFileSelect = (_path: string) => {
    // Could insert path into active terminal
  };

  const restoreSession = async (session: SessionHistory) => {
    setShowSessionHistory(false);
    try {
      // Load terminal state for this session
      const savedState = await window.electronAPI?.pty?.loadTerminalState?.();
      if (savedState && Array.isArray(savedState) && savedState.length > 0) {
        const restoredTerminals: TerminalInstance[] = savedState.map((s: {
          id: string;
          title: string;
          ptyId?: string;
          sessionId?: string;
          claudeMode?: boolean;
          linkedAgentId?: string;
          roleOverride?: 'leader' | 'worker';
          viewMode?: 'terminal';
          agentConfig?: AgentConfig;
        }) => ({
          id: s.id,
          title: s.title,
          ptyId: undefined, // Don't keep old ptyId - will be recreated on start
          sessionId: s.sessionId,
          claudeMode: s.claudeMode,
          linkedAgentId: s.linkedAgentId,
          roleOverride: s.roleOverride,
          viewMode: 'terminal' as const,
          agentConfig: s.agentConfig,  // Restore agent config (for Ralph mode, etc.)
        }));
        setTerminals(restoredTerminals);
        if (restoredTerminals.length > 0) {
          setActiveId(restoredTerminals[0].id);
        }
      }
    } catch (error) {
      console.error('[TerminalGrid] Failed to restore session:', error);
    }
  };

  // ============================================
  // EARLY RETURN - Must be AFTER all hooks above
  // ============================================
  if (showSetupWizard || !isSetupComplete) {
    return (
      <AgentSetupWizard
        key={`wizard-${resetCounter}`}  // Force remount on reset for fresh state
        onComplete={() => setShowSetupWizard(false)}
        projectRoot={projectRoot}
        onCreateLeaderTerminal={handleCreateLeaderTerminalFromWizard}
      />
    );
  }

  return (
    <div className="flex h-full">
      {/* Worker Setup Wizard Modal (Unified with Thinker) */}
      <WorkerSetupWizard
        open={showWorkerWizard}
        onComplete={handleWorkerWizardComplete}
        onCancel={() => setShowWorkerWizard(false)}
        workerCount={workerAgents.length}
        projectRoot={projectRoot}
        onLaunchThinker={handleThinkerFromWizard}
        onLaunchWorkflowSpecialist={handleWorkflowSpecialistFromWizard}
        onLaunchQuizmaster={handleQuizmasterLaunch}
      />
      {/* Thinker Wizard Modal */}
      <ThinkerWizard
        isOpen={thinkerWizardTerminalId !== null}
        onClose={() => setThinkerWizardTerminalId(null)}
        onLaunch={handleThinkerLaunch}
      />

      {/* Specialist Wizard Modal */}
      <SpecialistWizard
        isOpen={specialistWizardTerminalId !== null}
        onClose={() => setSpecialistWizardTerminalId(null)}
        onLaunch={handleSpecialistLaunch}
      />

      {/* Agent Wizard Modal (Unified launcher with tabs) */}
      <AgentWizard
        isOpen={agentWizardTerminalId !== null}
        onClose={() => setAgentWizardTerminalId(null)}
        onLaunchThinker={(basePath, personaPath, personaName) => {
          // Close AgentWizard and create new terminal directly
          // NOTE: Changed from handleThinkerLaunch (existing terminal) to handleThinkerFromWizard (new terminal)
          // This removes the redundant "Activate Thinker" modal
          setAgentWizardTerminalId(null);
          handleThinkerFromWizard(basePath, personaPath, personaName);
        }}
        onLaunchSpecialist={(promptPath, specialistName, profile) => {
          // Use the same terminal that triggered the wizard
          setSpecialistWizardTerminalId(agentWizardTerminalId);
          setAgentWizardTerminalId(null);
          // Delay to allow state update, then trigger specialist launch
          setTimeout(() => {
            handleSpecialistLaunch(promptPath, specialistName, profile);
          }, 100);
        }}
        onLaunchWorkflowSpecialist={handleWorkflowSpecialistLaunch}
      />

      {/* Leader Monitor Modal */}
      <LeaderMonitorModal
        isOpen={showLeaderMonitor}
        onClose={() => setShowLeaderMonitor(false)}
      />

      {/* Buffer Access Security Warning Dialog */}
      {showBufferWarning && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl p-6 max-w-lg w-full mx-4">
            {/* Header */}
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-red-500/20">
                <AlertTriangle className="w-6 h-6 text-red-500" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Security Warning: Terminal Buffer Access</h3>
            </div>

            {/* Description */}
            <p className="text-sm text-muted-foreground mb-4">
              Enabling buffer access allows agents to read raw terminal text directly, bypassing vision-based monitoring.
            </p>

            {/* Security Risks Box */}
            <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                <span className="text-sm font-medium text-red-500">SECURITY RISKS</span>
              </div>
              <ul className="text-xs text-red-400 space-y-1 ml-6 list-disc">
                <li>Secrets, API keys, and credentials visible in terminal output may be exposed to agents</li>
                <li>Any agent with access can read full terminal history (not just visible viewport)</li>
                <li>Raw buffer content includes command history</li>
              </ul>
            </div>

            {/* Mitigations Box */}
            <div className="bg-green-500/10 border border-green-500/30 rounded-lg p-4 mb-4">
              <div className="flex items-center gap-2 mb-2">
                <Shield className="w-4 h-4 text-green-500" />
                <span className="text-sm font-medium text-green-500">MITIGATIONS</span>
              </div>
              <ul className="text-xs text-green-400 space-y-1 ml-6 list-disc">
                <li>Common secret patterns are auto-redacted when read via MCP tool</li>
                <li>Access is logged and tracked per agent</li>
                <li>Setting resets when app restarts (session-only)</li>
              </ul>
            </div>

            {/* Mode Display */}
            <div className="flex items-center gap-2 mb-6 text-sm">
              <span className="text-muted-foreground">Enabling mode:</span>
              <span className="font-medium text-amber-500">
                All Agents
              </span>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 justify-end">
              <button
                onClick={cancelBufferModeChange}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={confirmBufferModeChange}
                className="px-4 py-2 text-sm font-medium text-white rounded-lg transition-colors flex items-center gap-2 bg-amber-600 hover:bg-amber-700"
              >
                <ShieldAlert className="w-4 h-4" />
                Enable Anyway
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Restart Agent Confirmation Dialog */}
      {restartConfirmTerminalId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-card border border-border rounded-lg shadow-xl p-6 max-w-md w-full mx-4">
            <div className="flex items-center gap-3 mb-4">
              <div className="p-2 rounded-full bg-blue-500/20">
                <RefreshCw className="w-5 h-5 text-blue-400" />
              </div>
              <h3 className="text-lg font-semibold text-foreground">Restart Agent</h3>
            </div>
            <p className="text-sm text-muted-foreground mb-6">
              This will deregister the agent from the gateway and spawn a fresh terminal instance.
              The agent will need to re-register after restart.
            </p>
            <div className="flex gap-3 justify-end">
              <button
                onClick={() => setRestartConfirmTerminalId(null)}
                className="px-4 py-2 text-sm font-medium text-muted-foreground hover:text-foreground bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={() => restartAgent(restartConfirmTerminalId)}
                className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors flex items-center gap-2"
              >
                <RefreshCw className="w-4 h-4" />
                Restart Agent
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Mic Settings Context Menu */}
      {showMicSettings && (
        <div
          className="fixed z-50 bg-card border border-border rounded-lg shadow-xl p-3 min-w-[280px]"
          style={{ left: showMicSettings.x, top: showMicSettings.y }}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-3">
            <span className="text-sm font-medium text-foreground">Mic Settings</span>
            <button
              onClick={() => setShowMicSettings(null)}
              className="text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {/* Silence Threshold */}
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Silence Threshold</span>
              <span className="text-foreground">{Math.round(silenceThreshold * 100)}%</span>
            </div>
            <input
              type="range"
              min="5"
              max="30"
              value={silenceThreshold * 100}
              onChange={(e) => setMicSettings(s => ({ ...s, silenceThreshold: Number(e.target.value) / 100 }))}
              className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-[10px] text-muted-foreground mt-0.5">Higher = less background noise pickup</div>
          </div>

          {/* Voice Threshold */}
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Voice Threshold</span>
              <span className="text-foreground">{Math.round(voiceThreshold * 100)}%</span>
            </div>
            <input
              type="range"
              min="10"
              max="50"
              value={voiceThreshold * 100}
              onChange={(e) => setMicSettings(s => ({ ...s, voiceThreshold: Number(e.target.value) / 100 }))}
              className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-[10px] text-muted-foreground mt-0.5">Higher = needs louder voice to trigger</div>
          </div>

          {/* Silence Timeout */}
          <div className="mb-3">
            <div className="flex justify-between text-xs mb-1">
              <span className="text-muted-foreground">Silence Timeout</span>
              <span className="text-foreground">{(silenceTimeoutMs / 1000).toFixed(1)}s</span>
            </div>
            <input
              type="range"
              min="500"
              max="3000"
              step="100"
              value={silenceTimeoutMs}
              onChange={(e) => setMicSettings(s => ({ ...s, silenceTimeoutMs: Number(e.target.value) }))}
              className="w-full h-1.5 bg-secondary rounded-lg appearance-none cursor-pointer"
            />
            <div className="text-[10px] text-muted-foreground mt-0.5">Wait time before auto-stop</div>
          </div>

          {/* Current Level Display */}
          {recordingTerminalId && (
            <div className="pt-2 border-t border-border">
              <div className="flex justify-between text-xs mb-1">
                <span className="text-muted-foreground">Current Level</span>
                <span className={audioLevel > voiceThreshold ? 'text-green-400' : audioLevel > silenceThreshold ? 'text-yellow-400' : 'text-red-400'}>
                  {Math.round(audioLevel * 100)}%
                </span>
              </div>
              <div className="h-2 bg-secondary rounded overflow-hidden">
                <div
                  className={`h-full transition-all ${audioLevel > voiceThreshold ? 'bg-green-500' : audioLevel > silenceThreshold ? 'bg-yellow-500' : 'bg-red-500'}`}
                  style={{ width: `${Math.min(audioLevel * 200, 100)}%` }}
                />
              </div>
            </div>
          )}

          {/* Presets */}
          <div className="flex gap-2 mt-3 pt-2 border-t border-border">
            <button
              onClick={() => setMicSettings(s => ({ ...s, silenceThreshold: 0.08, voiceThreshold: 0.15, silenceTimeoutMs: 1000 }))}
              className="flex-1 px-2 py-1 text-xs bg-secondary hover:bg-secondary/80 rounded"
            >
              Sensitive
            </button>
            <button
              onClick={() => setMicSettings(s => ({ ...s, silenceThreshold: 0.15, voiceThreshold: 0.30, silenceTimeoutMs: 1500 }))}
              className="flex-1 px-2 py-1 text-xs bg-secondary hover:bg-secondary/80 rounded"
            >
              Normal
            </button>
            <button
              onClick={() => setMicSettings(s => ({ ...s, silenceThreshold: 0.25, voiceThreshold: 0.45, silenceTimeoutMs: 2000 }))}
              className="flex-1 px-2 py-1 text-xs bg-secondary hover:bg-secondary/80 rounded"
            >
              Noisy
            </button>
          </div>
        </div>
      )}

      {/* Click outside to close mic settings */}
      {showMicSettings && (
        <div
          className="fixed inset-0 z-40"
          onClick={() => setShowMicSettings(null)}
        />
      )}

      {/* File Explorer Panel (Collapsible) */}
      {showFileExplorer && (
        <div className="w-64 flex-shrink-0">
          <FileExplorerPanel 
            projectRoot={projectRoot} 
            onFileSelect={handleFileSelect}
          />
        </div>
      )}

      {/* Main Terminal Area */}
      <div className="flex-1 flex flex-col h-full min-w-0">
        {/* Header */}
        <div className={`flex items-center justify-between px-4 py-3 border-b ${
          isKuroryuu
            ? 'border-primary/60 border-b-2 bg-gradient-to-r from-primary/20 via-background to-primary/20 shadow-[0_4px_20px_rgba(201,162,39,0.25)]'
            : 'bg-card/50 border-border'
        }`}>
          <div className="flex items-center gap-3">
            {/* File Explorer Toggle */}
            <button
              onClick={() => setShowFileExplorer(!showFileExplorer)}
              className={`p-1.5 rounded transition-colors ${
                showFileExplorer 
                  ? 'bg-primary/20 text-primary' 
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title="Toggle File Explorer"
            >
              <FolderTree className="w-4 h-4" />
            </button>
            
            <div className={`w-px h-5 ${isKuroryuu ? 'bg-primary/30' : 'bg-secondary'}`} />

            <div className="flex items-center gap-2">
              <Grid2X2 className={`w-4 h-4 ${isKuroryuu ? 'text-primary/70' : 'text-muted-foreground'}`} />
              <span className="text-sm font-medium text-foreground">
                Terminals ({terminals.length}/{maxTerminals})
              </span>
            </div>

            {/* M5: Agent Stats */}
            {agentStats && (
              <>
                <div className={`w-px h-5 ${isKuroryuu ? 'bg-primary/30' : 'bg-secondary'}`} />
                <div className="flex items-center gap-3 text-xs">
                  <span className={isKuroryuu ? 'text-primary/70' : 'text-muted-foreground'}>Agents:</span>
                  <span className="flex items-center gap-1">
                    <Wifi className="w-3 h-3 text-green-400" />
                    <span className="text-green-400">{agentStats.alive}</span>
                  </span>
                  <span className="flex items-center gap-1">
                    <Crown className="w-3 h-3 text-primary" />
                    <span className="text-primary">{agentStats.leaders}</span>
                  </span>
                </div>
              </>
            )}

            {/* Gateway + MCP Status */}
            <div className={`w-px h-5 ${isKuroryuu ? 'bg-primary/30' : 'bg-secondary'}`} />
            <GatewayMcpStatus showLabel={true} />

            {/* Recording indicator - shows only when active */}
            {isRecording && (
              <>
                <div className={`w-px h-5 ${isKuroryuu ? 'bg-primary/30' : 'bg-secondary'}`} />
                <div
                  className="flex items-center gap-1 px-1.5 py-0.5 bg-red-500/15 rounded-full border border-red-500/30"
                  title="Recording in progress"
                >
                  <span className="relative flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                  </span>
                  <span className="text-red-400 text-[9px] font-bold tracking-wider">REC</span>
                </div>
              </>
            )}
          </div>
          
          <div className="flex items-center gap-1">
            {/* Terminal tabs */}
            <div className="flex items-center gap-1 mr-2 max-w-md overflow-x-auto">
              {terminals.map((term, index) => {
                const tabLinkedAgent = getLinkedAgent(term, index);
                return (
                <button
                  key={term.id}
                  onClick={() => {
                    setActiveId(term.id);
                  }}
                  className={`px-2 py-1 text-xs rounded transition-colors whitespace-nowrap flex items-center gap-1.5 ${
                    activeId === term.id
                      ? isKuroryuu
                        ? 'bg-primary/25 text-primary border border-primary/50 shadow-[0_0_8px_rgba(201,162,39,0.3)]'
                        : 'bg-primary/20 text-primary'
                      : isKuroryuu
                        ? 'text-muted-foreground hover:text-primary hover:bg-primary/10 border border-transparent hover:border-primary/30'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }`}
                >
                  {term.claudeMode && <Sparkles className="w-3 h-3 text-purple-400" />}
                  {getTerminalDisplayName(term, index, tabLinkedAgent)}
                </button>
              );})}
            </div>
            
            <div className={`w-px h-5 mx-1 ${isKuroryuu ? 'bg-primary/30' : 'bg-secondary'}`} />

            {/* Layout Mode Toggle */}
            <div className="relative group">
              <button
                onClick={() => {
                  const modes: ('grid' | 'splitter' | 'window')[] = ['grid', 'splitter', 'window'];
                  const idx = modes.indexOf(layoutMode);
                  setLayoutMode(modes[(idx + 1) % modes.length]);
                }}
                className={`p-1.5 rounded transition-all duration-200 ${
                  isKuroryuu
                    ? 'text-primary/70 hover:text-primary hover:bg-primary/15 hover:shadow-[0_0_8px_rgba(168,85,247,0.3)]'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
                title={`Layout: ${layoutMode.charAt(0).toUpperCase() + layoutMode.slice(1)}`}
              >
                {layoutMode === 'grid' && <LayoutGrid className="w-4 h-4" />}
                {layoutMode === 'splitter' && <GripVertical className="w-4 h-4" />}
                {layoutMode === 'window' && <Layers className="w-4 h-4" />}
              </button>
              {/* Mode indicator tooltip */}
              <div className="absolute -bottom-6 left-1/2 -translate-x-1/2 px-1.5 py-0.5 text-[10px] font-medium
                bg-card border border-border rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                {layoutMode}
              </div>
            </div>

            {/* Buffer Access Mode Dropdown */}
            <div className="relative">
              <button
                onClick={() => setShowBufferDropdown(!showBufferDropdown)}
                className={`p-1.5 rounded transition-colors flex items-center gap-1 ${
                  showBufferDropdown
                    ? isKuroryuu ? 'bg-primary/20 text-primary' : 'bg-muted text-foreground'
                    : bufferAccessMode === 'off'
                      ? isKuroryuu
                        ? 'text-muted-foreground hover:text-primary hover:bg-primary/15'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                      : 'text-amber-500 hover:text-amber-400 hover:bg-amber-500/15'
                }`}
                title={`Buffer Access: ${bufferAccessMode === 'off' ? 'Off' : 'On (All Agents)'}`}
              >
                {bufferAccessMode === 'off' && <ShieldOff className="w-4 h-4" />}
                {bufferAccessMode === 'on' && <ShieldAlert className="w-4 h-4" />}
                <ChevronDown className="w-3 h-3" />
              </button>

              {showBufferDropdown && (
                <div className="absolute right-0 top-full mt-1 w-48 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <span className="text-xs font-medium text-muted-foreground uppercase">Buffer Access</span>
                  </div>
                  <div className="py-1">
                    <button
                      onClick={() => handleBufferModeChange('off')}
                      className={`w-full px-3 py-2 text-left hover:bg-secondary transition-colors flex items-center gap-2 ${
                        bufferAccessMode === 'off' ? 'bg-secondary/50' : ''
                      }`}
                    >
                      <ShieldOff className="w-4 h-4 text-muted-foreground" />
                      <div>
                        <div className="text-sm text-foreground">Off</div>
                        <div className="text-xs text-muted-foreground">Default, secure</div>
                      </div>
                    </button>
                    <button
                      onClick={() => handleBufferModeChange('on')}
                      className={`w-full px-3 py-2 text-left hover:bg-secondary transition-colors flex items-center gap-2 ${
                        bufferAccessMode === 'on' ? 'bg-amber-500/10' : ''
                      }`}
                    >
                      <ShieldAlert className="w-4 h-4 text-amber-500" />
                      <div>
                        <div className="text-sm text-foreground">On</div>
                        <div className="text-xs text-amber-500/70">All agents can read buffer</div>
                      </div>
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Session History */}
            <div className="relative">
              <button
                onClick={() => setShowSessionHistory(!showSessionHistory)}
                className={`p-1.5 rounded transition-colors ${
                  showSessionHistory
                    ? isKuroryuu ? 'bg-primary/20 text-primary' : 'bg-muted text-foreground'
                    : isKuroryuu
                      ? 'text-primary/70 hover:text-primary hover:bg-primary/15'
                      : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
                title="Session History"
              >
                <History className="w-4 h-4" />
              </button>
              
              {showSessionHistory && (
                <div className="absolute right-0 top-full mt-1 w-56 bg-card border border-border rounded-lg shadow-xl z-50 overflow-hidden">
                  <div className="px-3 py-2 border-b border-border">
                    <span className="text-xs font-medium text-muted-foreground uppercase">Recent Sessions</span>
                  </div>
                  <div className="max-h-48 overflow-y-auto">
                    {sessions.length === 0 ? (
                      <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                        No saved sessions
                      </div>
                    ) : sessions.map(session => (
                      <button
                        key={session.id}
                        onClick={() => restoreSession(session)}
                        className="w-full px-3 py-2 text-left hover:bg-secondary transition-colors"
                      >
                        <div className="text-sm text-foreground">{session.date}</div>
                        <div className="text-xs text-muted-foreground">{session.terminalCount} terminal</div>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
            
            {/* Add terminal button */}
            <button
              onClick={addTerminal}
              disabled={terminals.length >= maxTerminals}
              className={`p-1.5 rounded transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${
                isKuroryuu
                  ? 'text-primary/70 hover:text-primary hover:bg-primary/15'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title="Add Terminal"
            >
              <Plus className="w-4 h-4" />
            </button>

            {/* NOTE: Quizmaster Planning Session button hidden for now
            <button
              onClick={handleQuizmasterLaunch}
              className={`p-1.5 rounded transition-colors ${
                isKuroryuu
                  ? 'text-orange-400 hover:text-orange-300 hover:bg-orange-500/15'
                  : 'text-orange-500 hover:text-orange-400 hover:bg-orange-500/10'
              }`}
              title="Start Planning Session (Quizmaster)"
            >
              <MessageCircleQuestion className="w-4 h-4" />
            </button>
            */}

            {/* NOTE: Ralph Leader button hidden for public release
            <button
              onClick={handleRalphLaunch}
              className={`p-1.5 rounded transition-colors ${
                isKuroryuu
                  ? 'text-yellow-400 hover:text-yellow-300 hover:bg-yellow-500/15'
                  : 'text-yellow-500 hover:text-yellow-400 hover:bg-yellow-500/10'
              }`}
              title="Start Ralph Leader (Autonomous Orchestration)"
            >
              <Crown className="w-4 h-4" />
            </button>
            */}

            {/* Reset All Agents */}
            <button
              onClick={async () => {
                const yes = await confirmDestructive({
                  title: 'Reset Agents',
                  message: 'Reset agent configuration? This will stop all agents and clear all terminals.',
                  confirmLabel: 'Reset',
                  cancelLabel: 'Cancel',
                });
                if (yes) {
                  try {
                    // 1. Clear terminals state FIRST (triggers save of empty array)
                    setTerminals([]);

                    // 2. Force immediate save of empty state
                    await window.electronAPI?.pty?.saveTerminalState?.([]);

                    // 3. Kill all daemon PTYs and clear persistence via main process
                    await window.electronAPI?.pty?.resetAll?.();

                    // 4. Clear sub-agent configs
                    useSubAgentConfigStore.getState().clearAll();

                    // 5. Reset agent config (stops heartbeats, clears gateway)
                    resetSetup();

                    // 6. Show setup wizard
                    setShowSetupWizard(true);
                  } catch (error) {
                    console.error('[Reset] Failed to fully reset:', error);
                    // Still try to reset
                    resetSetup();
                    setTerminals([]);
                    setShowSetupWizard(true);
                  }
                }
              }}
              className={`p-1.5 rounded transition-colors ${
                isKuroryuu
                  ? 'text-primary/70 hover:text-primary hover:bg-primary/15'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
              }`}
              title="Reset All Agents"
            >
              <Skull className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* UNIFIED TERMINAL CONTAINER - CSS-only layout changes to prevent Terminal unmounting */}
        <div
          ref={windowContainerRef}
          className={`flex-1 p-1 overflow-hidden ${
          layoutMode === 'grid' ? `grid gap-1 ${getGridClass()}` :
          layoutMode === 'splitter' ? 'flex flex-row gap-1' :
          'relative'  /* window mode - absolute positioning */
        }`}>
          {/* Drop zone overlay for window mode */}
          {layoutMode === 'window' && isDraggingWindow && (
            <div className="absolute inset-0 pointer-events-none z-[100]">
              {/* Top zone */}
              <div className={`absolute top-0 left-0 right-0 h-[12%] border-2 border-dashed transition-all duration-150 flex items-center justify-center ${
                activeDropZone === 'top' ? 'border-primary bg-primary/20' : 'border-transparent'
              }`}>
                {activeDropZone === 'top' && <span className="text-primary text-sm font-medium">Top Half</span>}
              </div>
              {/* Bottom zone */}
              <div className={`absolute bottom-0 left-0 right-0 h-[12%] border-2 border-dashed transition-all duration-150 flex items-center justify-center ${
                activeDropZone === 'bottom' ? 'border-primary bg-primary/20' : 'border-transparent'
              }`}>
                {activeDropZone === 'bottom' && <span className="text-primary text-sm font-medium">Bottom Half</span>}
              </div>
              {/* Left zone */}
              <div className={`absolute top-[12%] left-0 bottom-[12%] w-[12%] border-2 border-dashed transition-all duration-150 flex items-center justify-center ${
                activeDropZone === 'left' ? 'border-primary bg-primary/20' : 'border-transparent'
              }`}>
                {activeDropZone === 'left' && <span className="text-primary text-xs font-medium [writing-mode:vertical-lr] rotate-180">Left Half</span>}
              </div>
              {/* Right zone */}
              <div className={`absolute top-[12%] right-0 bottom-[12%] w-[12%] border-2 border-dashed transition-all duration-150 flex items-center justify-center ${
                activeDropZone === 'right' ? 'border-primary bg-primary/20' : 'border-transparent'
              }`}>
                {activeDropZone === 'right' && <span className="text-primary text-xs font-medium [writing-mode:vertical-lr]">Right Half</span>}
              </div>
              {/* Center zone */}
              <div className={`absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[30%] h-[30%] border-2 border-dashed rounded-lg transition-all duration-150 flex items-center justify-center ${
                activeDropZone === 'center' ? 'border-primary bg-primary/20' : 'border-transparent'
              }`}>
                {activeDropZone === 'center' && <span className="text-primary text-sm font-medium">Maximize</span>}
              </div>
            </div>
          )}
          {terminals.map((term, index) => {
            const linkedAgent = getLinkedAgent(term, index);
            const isDragging = draggedId === term.id;
            const isDragOver = dragOverId === term.id;

            // Window mode absolute positioning
            const windowStyle: React.CSSProperties | undefined = layoutMode === 'window' ? {
              position: 'absolute',
              left: windowStates[term.id]?.x ?? (20 + index * 30),
              top: windowStates[term.id]?.y ?? (20 + index * 30),
              width: windowStates[term.id]?.width ?? 500,
              height: windowStates[term.id]?.height ?? 350,
              zIndex: windowStates[term.id]?.zIndex ?? (index + 1),
            } : undefined;

            // Splitter mode flex sizing (horizontal layout - side by side)
            const splitterStyle: React.CSSProperties | undefined = layoutMode === 'splitter' ? {
              flex: splitterSizes[index] ? `0 0 ${splitterSizes[index]}%` : `1 1 ${100 / terminals.length}%`,
              minWidth: 200,
              height: '100%',
            } : undefined;

            return (
            <Fragment key={term.id}>
            <div
              draggable={layoutMode === 'grid'}
              onDragStart={(e) => layoutMode === 'grid' && handleDragStart(e, term.id)}
              onDragOver={(e) => layoutMode === 'grid' && handleDragOver(e, term.id)}
              onDragLeave={layoutMode === 'grid' ? handleDragLeave : undefined}
              onDrop={(e) => layoutMode === 'grid' && handleDrop(e, term.id)}
              onDragEnd={layoutMode === 'grid' ? handleDragEnd : undefined}
              onMouseDown={(e) => layoutMode === 'window' && handleWindowDrag(e, term.id)}
              style={windowStyle || splitterStyle}
              className={`relative rounded-lg border overflow-hidden flex flex-col transition-all duration-200 ${
                isDragging
                  ? 'opacity-50 scale-95 border-primary border-dashed'
                  : isDragOver
                    ? 'border-primary border-2 scale-[1.02] shadow-lg shadow-primary/20'
                    : activeId === term.id
                      ? 'border-primary/50'
                      : linkedAgent?.status === 'dead'
                        ? 'border-red-500/30'
                        : isKuroryuu
                          ? 'border-primary/60 border-2'
                          : 'border-border'
              } ${term.claudeMode ? 'ring-1 ring-purple-500/30' : ''} ${layoutMode === 'grid' ? 'cursor-grab active:cursor-grabbing' : ''} ${
                isKuroryuu ? 'shadow-[0_0_30px_rgba(201,162,39,0.3)] ring-1 ring-primary/20' : ''
              }`}
            >
              {/* Terminal header - flex-shrink-0 to maintain height */}
              <div className={`flex-shrink-0 z-10 flex items-center justify-between
                              px-3 py-2 bg-card/90 border-b ${
                                isKuroryuu
                                  ? 'border-primary/60 bg-gradient-to-r from-primary/10 via-card to-primary/10 shadow-[0_2px_12px_rgba(201,162,39,0.25)]'
                                  : 'border-border'
                              }`}>
                <div className="flex items-center gap-2">
                  {/* Agent status indicator */}
                  {linkedAgent ? (
                    <>
                      <span className={`${getStatusColor(linkedAgent.status)}`}>
                        {getStatusIcon(linkedAgent.status)}
                      </span>
                      <span className="text-xs font-medium text-muted-foreground">
                        {getTerminalDisplayName(term, index, linkedAgent)}
                      </span>
                      {linkedAgent.role === 'leader' && (
                        <span title="Leader"><Crown className="w-3 h-3 text-primary" /></span>
                      )}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                        linkedAgent.status === 'idle' ? 'bg-green-500/20 text-green-400' :
                        linkedAgent.status === 'busy' ? 'bg-primary/20 text-primary' :
                        'bg-red-500/20 text-red-400'
                      }`}>
                        {linkedAgent.status}
                      </span>
                      {/* Agent slot badge - shows position in grid */}
                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-mono font-bold ${
                        linkedAgent.role === 'leader'
                          ? 'bg-primary/30 text-primary border border-primary/50'
                          : 'bg-blue-500/20 text-blue-400 border border-blue-500/30'
                      }`}>
                        {linkedAgent.role === 'leader' ? 'L' : `W${index}`}
                      </span>
                    </>
                  ) : (
                    <>
                      <Activity className="w-3 h-3 text-muted-foreground" />
                      <span className="text-xs font-medium text-muted-foreground">{term.title}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-secondary text-muted-foreground font-medium">
                        unregistered
                      </span>
                      {/* Slot badge for unregistered */}
                      <span className="text-[10px] px-1.5 py-0.5 rounded font-mono bg-secondary/50 text-muted-foreground border border-border">
                        #{index}
                      </span>
                    </>
                  )}
                  {term.claudeMode && (
                    <span className="text-[10px] px-1.5 py-0.5 rounded bg-purple-500/20 text-purple-400 font-medium">
                      Claude
                    </span>
                  )}
                  {/* PTY Session Info Button */}
                  <button
                    className="p-0.5 rounded text-muted-foreground/50 hover:text-muted-foreground hover:bg-secondary/50 transition-colors group relative"
                    title={`PTY: ${term.ptyId?.slice(0, 8) || 'none'} | Agent: ${linkedAgent?.agent_id?.slice(0, 8) || term.linkedAgentId?.slice(0, 12) || 'none'} | Mode: ${term.viewMode}`}
                  >
                    <Info className="w-3 h-3" />
                    {/* Hover popup with full details */}
                    <div className="absolute left-0 top-full mt-1 hidden group-hover:block z-50 p-2 bg-popover border border-border rounded-md shadow-lg text-[10px] whitespace-nowrap">
                      <div className="space-y-1">
                        <div><span className="text-muted-foreground">PTY ID:</span> <span className="text-foreground font-mono">{term.ptyId || 'not created'}</span></div>
                        <div><span className="text-muted-foreground">Session:</span> <span className="text-foreground font-mono">{term.sessionId || 'none'}</span></div>
                        <div><span className="text-muted-foreground">Terminal:</span> <span className="text-foreground font-mono">{term.id}</span></div>
                        <div><span className="text-muted-foreground">Agent ID:</span> <span className="text-foreground font-mono">{linkedAgent?.agent_id || term.linkedAgentId || 'unlinked'}</span></div>
                        <div><span className="text-muted-foreground">Agent Role:</span> <span className="text-foreground">{
                          // Effective role: roleOverride > agent ID pattern > gateway role
                          term.roleOverride ||
                          ((linkedAgent?.agent_id || term.linkedAgentId || '').startsWith('leader_') ? 'leader' :
                           (linkedAgent?.agent_id || term.linkedAgentId || '').startsWith('worker_') ? 'worker' :
                           linkedAgent?.role || 'unknown')
                        }{term.roleOverride ? ' (override)' : ''}</span></div>
                        <div><span className="text-muted-foreground">View Mode:</span> <span className="text-foreground">{term.viewMode}</span></div>
                      </div>
                    </div>
                  </button>
                </div>
                <div className="flex items-center gap-1">
                  {/* Microphone Button for Voice Input with Audio Level Feedback */}
                  <button
                    onClick={() => handleMicClick(term.id)}
                    onContextMenu={(e) => {
                      e.preventDefault();
                      setShowMicSettings({ x: e.clientX, y: e.clientY });
                    }}
                    className={`p-1.5 rounded-full transition-all flex items-center justify-center relative ${
                      recordingTerminalId === term.id
                        ? 'text-white bg-red-500 hover:bg-red-600'
                        : 'text-muted-foreground hover:text-blue-400 hover:bg-secondary'
                    }`}
                    style={recordingTerminalId === term.id ? {
                      // Scale button based on audio level for visual feedback (amplified)
                      transform: `scale(${1 + Math.min(audioLevel * 2, 0.5)})`,
                      boxShadow: `0 0 ${4 + audioLevel * 30}px rgba(239, 68, 68, ${0.5 + audioLevel})`
                    } : undefined}
                    title={recordingTerminalId === term.id
                      ? `Recording... (${Math.round(audioLevel * 100)}%) - Click to STOP or wait for silence`
                      : 'Click to start voice input (right-click for settings)'}
                  >
                    {recordingTerminalId === term.id ? (
                      <>
                        {/* Outer ring that pulses with audio */}
                        <span
                          className="absolute inset-[-4px] rounded-full border-2 border-red-400"
                          style={{
                            transform: `scale(${1 + audioLevel * 1.5})`,
                            opacity: 0.3 + audioLevel * 0.7,
                            transition: 'transform 0.1s, opacity 0.1s'
                          }}
                        />
                        {/* Audio level indicator bar below button */}
                        <span
                          className="absolute -bottom-1 left-0 h-0.5 bg-green-400 rounded"
                          style={{
                            width: `${Math.min(audioLevel * 400, 100)}%`,
                            transition: 'width 0.05s'
                          }}
                        />
                        <Square className="w-3 h-3 fill-white relative z-10" />
                      </>
                    ) : (
                      <Mic className="w-3 h-3" />
                    )}
                  </button>

                  {/* Copy Button */}
                  <button
                    onClick={() => {
                      const termRef = termRefs.current.get(term.id);
                      if (termRef && termRef.getSelection()) {
                        navigator.clipboard.writeText(termRef.getSelection());
                      }
                    }}
                    className="p-1 rounded transition-colors text-muted-foreground hover:text-blue-400 hover:bg-secondary"
                    title="Copy selected text"
                  >
                    <Copy className="w-3 h-3" />
                  </button>

                  {/* Paste Button */}
                  <button
                    onClick={async () => {
                      try {
                        const text = await navigator.clipboard.readText();
                        if (text && term.ptyId) {
                          window.electronAPI.pty.write(term.ptyId, text);
                        }
                      } catch (err) {
                        console.error('[TerminalGrid] Paste failed:', err);
                      }
                    }}
                    className="p-1 rounded transition-colors text-muted-foreground hover:text-green-400 hover:bg-secondary"
                    title="Paste from clipboard"
                  >
                    <Clipboard className="w-3 h-3" />
                  </button>

                  {/* Status Line Mode Toggle - only in Claude mode */}
                  {term.claudeMode && (
                    <button
                      tabIndex={-1}
                      onClick={() => cycleStatusLineMode()}
                      className="p-1 rounded transition-colors text-muted-foreground hover:text-orange-400 hover:bg-secondary"
                      title={`Status line: ${statusLineMode.toUpperCase()} (click to cycle)`}
                    >
                      <Layers className="w-3 h-3" />
                    </button>
                  )}

                  {/* NOTE: PM button hidden for public release - /plan command still works manually
                  {term.claudeMode && (
                    <button
                      tabIndex={-1}
                      onClick={() => {
                        if (term.ptyId) {
                          console.log('[PM] Entering plan mode');
                          window.electronAPI.pty.write(term.ptyId, '/plan');
                          setTimeout(() => {
                            window.electronAPI.pty.write(term.ptyId!, '\r');
                          }, 100);
                        } else {
                          console.warn('[PM] No ptyId for terminal:', term.id);
                        }
                      }}
                      className="px-1.5 py-0.5 rounded transition-colors bg-yellow-500/20 text-yellow-400 hover:bg-yellow-500/30 text-[10px] font-bold"
                      title="Enter Plan Mode (/plan)"
                    >
                      PM
                    </button>
                  )}
                  */}

                  {/* Leader Monitor button - only for leader terminals */}
                  {linkedAgent?.role === 'leader' && (
                    <button
                      tabIndex={-1}
                      onClick={() => setShowLeaderMonitor(true)}
                      className="p-1 rounded transition-colors text-muted-foreground hover:text-primary hover:bg-primary/10"
                      title="Leader Monitor"
                    >
                      <Eye className="w-3 h-3" />
                    </button>
                  )}

                  {/* Sub-agent Settings COG */}
                  {linkedAgent && (
                    <AgentCogButton
                      onClick={() => toggleCogSettings(term.id)}
                      isActive={term.showCogSettings || false}
                    />
                  )}
                  {/* Kill Agent Button (only for workers, never for leader - fail-closed security) */}
                  {linkedAgent && linkedAgent.status !== 'dead' && linkedAgent.role !== 'leader' && (
                    <button
                      onClick={async () => {
                        // Kill PTY first, then deregister agent
                        if (term.ptyId) await window.electronAPI.pty.kill(term.ptyId);
                        killAgent(linkedAgent.agent_id);
                      }}
                      className="p-1 text-muted-foreground hover:text-red-400 rounded hover:bg-red-500/10 transition-colors"
                      title="Kill Agent"
                    >
                      <Skull className="w-3 h-3" />
                    </button>
                  )}
                  {/* Agent Launcher Button - only in Claude mode */}
                  {term.claudeMode && (
                    <button
                      onClick={() => setAgentWizardTerminalId(term.id)}
                      className="p-1 rounded transition-colors text-muted-foreground hover:text-primary hover:bg-primary/10"
                      title="Agent Launcher (Thinkers, Specialists, Workflow)"
                    >
                      <Brain className="w-3 h-3" />
                    </button>
                  )}
                  {/* Claude Mode Toggle */}
                  <button
                    onClick={() => toggleClaudeMode(term.id)}
                    className={`p-1 rounded transition-colors ${
                      term.claudeMode
                        ? 'text-purple-400 bg-purple-500/20'
                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                    }`}
                    title={term.claudeMode ? 'Disable Claude Mode' : 'Enable Claude Mode'}
                  >
                    <Sparkles className="w-3 h-3" />
                  </button>
                  {/* Restart Terminal (workers only) */}
                  {term.id !== 'leader' && (
                    <button
                      onClick={() => restartTerminal(term.id)}
                      className="p-1 text-muted-foreground hover:text-blue-400 rounded hover:bg-secondary"
                      title="Restart Terminal (fresh PowerShell)"
                    >
                      <RefreshCw className="w-3 h-3" />
                    </button>
                  )}
                  {/* Close button - NEVER show for leader terminals (fail-closed security) */}
                  {terminals.length > 1 && linkedAgent?.role !== 'leader' && (
                    <button
                      onClick={() => removeTerminal(term.id)}
                      className="p-1 text-muted-foreground hover:text-red-400 rounded hover:bg-secondary"
                      title="Close Terminal"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>
              </div>
              
              {/* Sub-agent Settings Panel (COG) */}
              {linkedAgent && term.showCogSettings && (
                <AgentTerminalCog
                  agentId={linkedAgent.agent_id}
                  agentName={getTerminalDisplayName(term, index, linkedAgent)}
                  agentRole={linkedAgent.role === 'leader' ? 'leader' : 'worker'}
                  roleOverride={term.roleOverride}
                  isOpen={term.showCogSettings}
                  onClose={() => toggleCogSettings(term.id)}
                  terminalId={term.id}
                  terminalTitle={term.title}
                  onTitleChange={(newTitle) => {
                    setTerminals(prev =>
                      prev.map(t => t.id === term.id ? { ...t, title: newTitle } : t)
                    );
                  }}
                  onKillAgent={() => {
                    // Kill PTY
                    if (term.ptyId) {
                      window.electronAPI.pty.kill(term.ptyId);
                    }
                    // Deregister agent from gateway
                    if (term.linkedAgentId) {
                      deregisterAgent(term.linkedAgentId);
                      // If worker, also remove from config to prevent respawn on restart
                      if (term.linkedAgentId !== leaderAgent?.id) {
                        removeWorkerAgent(term.linkedAgentId);
                      }
                    }
                    // Remove sub-agent config
                    useSubAgentConfigStore.getState().removeConfig(term.id);
                    // Immediately remove from persistence (bypasses debounce)
                    window.electronAPI?.pty?.removeSession?.(term.id);
                    // Remove terminal
                    setTerminals(prev => {
                      const filtered = prev.filter(t => t.id !== term.id);
                      if (activeId === term.id && filtered.length > 0) {
                        setActiveId(filtered[0].id);
                      }
                      return filtered;
                    });
                  }}
                />
              )}
              
              {/* Terminal/Chat content - flex-1 min-h-0 to fill remaining space */}
              <div className="flex-1 min-h-0 overflow-hidden relative">
                {term.viewMode === 'pending' ? (
                  <div className="absolute inset-0 flex items-center justify-center bg-card">
                    <button
                      onClick={() => startTerminal(term.id)}
                      className="px-6 py-3 bg-primary hover:bg-primary/90 rounded-lg flex items-center gap-2 text-primary-foreground font-medium transition-colors"
                    >
                      <Play className="w-5 h-5" />
                      Start Terminal
                    </button>
                  </div>
                ) : (
                  <Terminal
                    key={`terminal-${term.id}-${term.linkedAgentId || 'shell'}-${term.restartCount || 0}`}
                    terminalId={term.id}
                    id={term.ptyId}
                    onReady={(ptyId, sessionId) => handleTerminalReady(term.id, ptyId, sessionId)}
                    onTermRef={(ref) => {
                      if (ref) {
                        termRefs.current.set(term.id, ref);
                      } else {
                        termRefs.current.delete(term.id);
                      }
                    }}
                    cwd={getTerminalCwd(term.linkedAgentId)}
                    cliConfig={buildCliConfig(term.linkedAgentId, term)}
                  />
                )}
              </div>

              {/* Window mode: drag handle at top */}
              {layoutMode === 'window' && (
                <div className="window-drag-handle absolute top-0 left-0 right-0 h-3 cursor-move bg-transparent hover:bg-primary/20 z-20" />
              )}

              {/* Window mode: resize handles */}
              {layoutMode === 'window' && (
                <>
                  <div className="absolute right-0 top-0 bottom-0 w-1 cursor-ew-resize hover:bg-primary/30 z-20"
                       onMouseDown={(e) => handleWindowResize(e, term.id, 'e')} />
                  <div className="absolute left-0 right-0 bottom-0 h-1 cursor-ns-resize hover:bg-primary/30 z-20"
                       onMouseDown={(e) => handleWindowResize(e, term.id, 's')} />
                  <div className="absolute right-0 bottom-0 w-3 h-3 cursor-nwse-resize hover:bg-primary/30 z-20"
                       onMouseDown={(e) => handleWindowResize(e, term.id, 'se')} />
                </>
              )}
            </div>

            {/* Splitter mode: vertical resize handle between terminals */}
            {layoutMode === 'splitter' && index < terminals.length - 1 && (
              <div
                className={`w-2 cursor-col-resize flex-shrink-0 flex items-center justify-center transition-colors ${
                  isKuroryuu ? 'bg-primary/10 hover:bg-primary/30' : 'bg-border hover:bg-muted-foreground/30'
                }`}
                onMouseDown={(e) => handleSplitterResize(e, index)}
              >
                <div className="flex flex-col gap-0.5">
                  {[0,1,2].map(i => (
                    <div key={i} className={`w-1 h-1 rounded-full ${isKuroryuu ? 'bg-primary' : 'bg-muted-foreground'}`} />
                  ))}
                </div>
              </div>
            )}
            </Fragment>
          )})}
        </div>
      </div>
    </div>
  );
}
