/**
 * Claude Teams Store - Zustand state management for Claude Code Agent Teams
 *
 * Data source: IPC events from file watcher in main process (NOT Gateway polling).
 * The main process watches ~/.claude/teams/ and ~/.claude/tasks/ and pushes
 * state changes via IPC events.
 */
import { create } from 'zustand';
import type {
  TeamSnapshot,
  TeamConfig,
  TeamTask,
  InboxMessage,
  CreateTeamParams,
  MessageTeammateParams,
  ShutdownTeammateParams,
  CleanupTeamParams,
  ClaudeTeamsState,
  ClaudeTeamsIpcEvent,
  TeamHistoryEntry,
  TeamTemplate,
  TeammateHealthInfo,
  TeamAnalytics,
} from '../types/claude-teams';

/**
 * Derive selected team data from the teams array and selectedTeamId.
 */
function deriveSelectedTeam(teams: TeamSnapshot[], selectedTeamId: string | null) {
  const selectedTeam = selectedTeamId
    ? teams.find((t) => t.config.name === selectedTeamId) ?? null
    : null;

  return {
    selectedTeam,
    selectedTeamTasks: selectedTeam?.tasks ?? [],
    selectedTeamMessages: selectedTeam
      ? Object.values(selectedTeam.inboxes).flat()
      : [],
  };
}

/**
 * Watcher snapshot format (flat arrays from main process).
 */
interface WatcherSnapshot {
  teams: { teamName: string; config: TeamConfig }[];
  tasks: { teamName: string; tasks: TeamTask[] }[];
  messages: { teamName: string; agentName: string; messages: InboxMessage[] }[];
}

/**
 * Type guard to check if an object is a valid WatcherSnapshot.
 */
function isWatcherSnapshot(obj: unknown): obj is WatcherSnapshot {
  return (
    typeof obj === 'object' &&
    obj !== null &&
    'teams' in obj &&
    'tasks' in obj &&
    'messages' in obj &&
    Array.isArray((obj as WatcherSnapshot).teams) &&
    Array.isArray((obj as WatcherSnapshot).tasks) &&
    Array.isArray((obj as WatcherSnapshot).messages)
  );
}

/**
 * Transform watcher snapshot format (flat arrays) to store format (TeamSnapshot[]).
 * Watcher returns: { teams: { teamName, config }[], tasks: { teamName, tasks }[], messages: { teamName, agentName, messages }[] }
 * Store expects: TeamSnapshot[] = { config, tasks, inboxes: Record<string, InboxMessage[]>, teammates, lastUpdated }[]
 */
function hydrateFromSnapshot(snapshot: WatcherSnapshot): TeamSnapshot[] {
  const teamMap = new Map<string, TeamSnapshot>();

  // First pass: create TeamSnapshot entries from teams array
  for (const { teamName, config } of snapshot.teams) {
    teamMap.set(teamName, {
      config,
      tasks: [],
      inboxes: {},
      teammates: [],
      lastUpdated: Date.now(),
    });
  }

  // Second pass: add tasks to matching teams
  for (const { teamName, tasks } of snapshot.tasks) {
    const team = teamMap.get(teamName);
    if (team) {
      team.tasks = tasks;
    }
  }

  // Third pass: group messages by agentName into inboxes Record
  for (const { teamName, agentName, messages } of snapshot.messages) {
    const team = teamMap.get(teamName);
    if (team) {
      team.inboxes[agentName] = messages;
    }
  }

  return Array.from(teamMap.values());
}

/**
 * Sync TTS hooks between local and global settings based on team activity.
 * When teams are active: install global TTS hooks, disable local TTS hooks.
 * When no teams: remove global TTS hooks, re-enable local TTS hooks.
 */
async function syncTtsHooks(teams: TeamSnapshot[]): Promise<void> {
  const hasActiveTeams = teams.length > 0;

  try {
    if (hasActiveTeams) {
      // Load config to get TTS settings for global hooks
      const configResult = await window.electronAPI?.kuroConfig?.load?.();
      if (!configResult?.ok || !configResult.config) return;
      const config = configResult.config;

      // Install global TTS hooks with current TTS settings
      const tts = config.tts as Record<string, unknown> | undefined;
      await window.electronAPI?.globalHooks?.installTts?.({
        voice: (tts?.voice as string) || 'en-GB-SoniaNeural',
        smartSummaries: (tts?.smartSummaries as boolean) || false,
        messages: (tts?.messages as { stop: string; subagentStop: string; notification: string }) || {
          stop: 'Work complete',
          subagentStop: 'Task finished',
          notification: 'Your attention is needed',
        },
        summaryProvider: tts?.summaryProvider as string | undefined,
        summaryModel: tts?.summaryModel as string | undefined,
        userName: tts?.userName as string | undefined,
      });

      // Remove TTS from project hooks (targeted — does NOT touch user preference flags)
      await window.electronAPI?.kuroConfig?.setTeamTtsOverride?.(true);
      console.log('[ClaudeTeamsStore] Teams active - global TTS enabled, project TTS disabled');
    } else {
      // Remove global hooks
      await window.electronAPI?.globalHooks?.removeTts?.();

      // Restore TTS to project hooks (targeted — reads user preference flags to rebuild)
      await window.electronAPI?.kuroConfig?.setTeamTtsOverride?.(false);
      console.log('[ClaudeTeamsStore] No teams - global TTS removed, project TTS restored');
    }
  } catch (err) {
    console.error('[ClaudeTeamsStore] syncTtsHooks error:', err);
  }
}

export const useClaudeTeamsStore = create<ClaudeTeamsState>((set, get) => ({
  // Data
  teams: [],
  selectedTeamId: null,
  isWatching: false,
  isLoading: false,
  error: null,

  // Derived
  selectedTeam: null,
  selectedTeamTasks: [],
  selectedTeamMessages: [],

  // History
  history: [],
  isLoadingHistory: false,

  // Templates
  templates: [],
  isLoadingTemplates: false,

  // Health
  teammateHealth: {},

  // Analytics
  teamAnalytics: null,
  taskFirstSeen: {},

  // -- Data Actions --

  setTeams: (teams) => {
    const { selectedTeamId } = get();
    set({
      teams,
      ...deriveSelectedTeam(teams, selectedTeamId),
    });
  },

  selectTeam: (teamName) => {
    const { teams } = get();
    set({
      selectedTeamId: teamName,
      ...deriveSelectedTeam(teams, teamName),
    });
  },

  updateTeamConfig: (teamName, config) => {
    const { teams, selectedTeamId, teammateHealth } = get();
    const exists = teams.some((t) => t.config.name === teamName);
    if (!exists) {
      // New team detected via config change event
      get().addTeam({
        config,
        tasks: [],
        inboxes: {},
        teammates: [],
        lastUpdated: Date.now(),
      });
      return;
    }
    // Detect member removal (definitive exit signal — Claude Code removes members on shutdown)
    const oldTeam = teams.find((t) => t.config.name === teamName);
    if (oldTeam) {
      const oldNames = new Set(oldTeam.config.members.map((m) => m.name));
      const newNames = new Set(config.members.map((m) => m.name));
      const removedMembers = [...oldNames].filter((n) => !newNames.has(n));
      if (removedMembers.length > 0) {
        const updatedHealth = { ...teammateHealth };
        for (const name of removedMembers) {
          const oldMember = oldTeam.config.members.find((m) => m.name === name);
          updatedHealth[name] = {
            lastActivity: updatedHealth[name]?.lastActivity ?? Date.now(),
            isUnresponsive: false,
            exitedAt: Date.now(),
            uptime: oldMember ? (Date.now() - oldMember.joinedAt) : 0,
            messageCount: updatedHealth[name]?.messageCount ?? 0,
            avgResponseTime: updatedHealth[name]?.avgResponseTime,
          };
        }
        set({ teammateHealth: updatedHealth });
        console.log('[ClaudeTeamsStore] Members removed from config (exited):', removedMembers);
      }
    }
    const updated = teams.map((t) =>
      t.config.name === teamName
        ? { ...t, config, lastUpdated: Date.now() }
        : t
    );
    set({
      teams: updated,
      ...deriveSelectedTeam(updated, selectedTeamId),
    });
  },

  updateTeamTasks: (teamName, tasks) => {
    const { teams, selectedTeamId, taskFirstSeen } = get();
    const updated = teams.map((t) =>
      t.config.name === teamName
        ? { ...t, tasks, lastUpdated: Date.now() }
        : t
    );
    // Track first-seen timestamps for task duration display
    const now = Date.now();
    const updatedFirstSeen = { ...taskFirstSeen };
    let changed = false;
    for (const task of tasks) {
      if (!updatedFirstSeen[task.id]) {
        updatedFirstSeen[task.id] = now;
        changed = true;
      }
    }
    set({
      teams: updated,
      ...deriveSelectedTeam(updated, selectedTeamId),
      ...(changed ? { taskFirstSeen: updatedFirstSeen } : {}),
    });
  },

  updateTeamInbox: (teamName, agentName, messages) => {
    const { teams, selectedTeamId } = get();
    const updated = teams.map((t) => {
      if (t.config.name !== teamName) return t;
      return {
        ...t,
        inboxes: { ...t.inboxes, [agentName]: messages },
        lastUpdated: Date.now(),
      };
    });
    set({
      teams: updated,
      ...deriveSelectedTeam(updated, selectedTeamId),
    });
  },

  addTeam: (snapshot) => {
    const { teams, selectedTeamId } = get();
    const exists = teams.some((t) => t.config.name === snapshot.config.name);
    const updated = exists
      ? teams.map((t) =>
          t.config.name === snapshot.config.name ? snapshot : t
        )
      : [...teams, snapshot];
    set({
      teams: updated,
      ...deriveSelectedTeam(updated, selectedTeamId),
    });
    // Sync TTS: new team added, may need to install global hooks
    if (!exists) syncTtsHooks(updated);
  },

  removeTeam: (teamName) => {
    const { teams, selectedTeamId } = get();
    const updated = teams.filter((t) => t.config.name !== teamName);
    const newSelectedId = selectedTeamId === teamName ? null : selectedTeamId;
    set({
      teams: updated,
      selectedTeamId: newSelectedId,
      ...deriveSelectedTeam(updated, newSelectedId),
    });
    // Sync TTS: team removed, may need to restore local hooks
    syncTtsHooks(updated);
  },

  setError: (error) => set({ error }),

  // -- Lifecycle Actions --

  startWatching: async () => {
    try {
      set({ isLoading: true, error: null });
      const result = await window.electronAPI?.claudeTeams?.startWatching?.();
      if (result?.ok && result.snapshot && isWatcherSnapshot(result.snapshot)) {
        const teams = hydrateFromSnapshot(result.snapshot);
        set({ isWatching: true, isLoading: false });
        get().setTeams(teams);
        // Sync TTS hooks based on whether teams exist
        syncTtsHooks(teams);
      } else {
        set({ isWatching: true, isLoading: false });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to start watching';
      set({ error: msg, isLoading: false });
      console.error('[ClaudeTeamsStore] startWatching error:', err);
    }
  },

  stopWatching: () => {
    window.electronAPI?.claudeTeams?.stopWatching?.();
    set({ isWatching: false });
  },

  createTeam: async (params) => {
    try {
      set({ isLoading: true, error: null });
      const result = await window.electronAPI?.claudeTeams?.createTeam?.(params);
      set({ isLoading: false });
      if (result && !result.ok) {
        console.error('[ClaudeTeamsStore] createTeam failed:', result.error);
      }
      return result?.ok ?? false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create team';
      set({ error: msg, isLoading: false });
      console.error('[ClaudeTeamsStore] createTeam error:', err);
      return false;
    }
  },

  messageTeammate: async (params) => {
    try {
      const result = await window.electronAPI?.claudeTeams?.messageTeammate?.(params);
      if (result && !result.ok) {
        console.error('[ClaudeTeamsStore] messageTeammate failed:', result.error || 'unknown error (no active team?)');
      }
      return result?.ok ?? false;
    } catch (err) {
      console.error('[ClaudeTeamsStore] messageTeammate error:', err);
      return false;
    }
  },

  shutdownTeammate: async (params) => {
    try {
      const result = await window.electronAPI?.claudeTeams?.shutdownTeammate?.(params);
      if (result && !result.ok) {
        console.error('[ClaudeTeamsStore] shutdownTeammate failed:', result.error || 'unknown error (no active team?)');
      }
      return result?.ok ?? false;
    } catch (err) {
      console.error('[ClaudeTeamsStore] shutdownTeammate error:', err);
      return false;
    }
  },

  cleanupTeam: async (params) => {
    try {
      set({ isLoading: true });

      // Auto-archive team state before cleanup (data is still in memory)
      const { teams } = get();
      const teamSnapshot = teams.find((t) => t.config.name === params.teamName);
      if (teamSnapshot) {
        try {
          await window.electronAPI?.teamHistory?.archiveSession?.({
            teamName: params.teamName,
            config: teamSnapshot.config,
            tasks: teamSnapshot.tasks,
            inboxes: teamSnapshot.inboxes,
          });
          recentlyArchivedTeams.add(params.teamName);
          console.log('[ClaudeTeamsStore] Archived team before cleanup:', params.teamName);
        } catch (archiveErr) {
          console.error('[ClaudeTeamsStore] Archive failed (proceeding with cleanup):', archiveErr);
        }
      }

      const result = await window.electronAPI?.claudeTeams?.cleanupTeam?.(params);
      set({ isLoading: false });

      if (result && !result.ok) {
        console.error('[ClaudeTeamsStore] Cleanup failed:', result.error);
      }

      // Refresh history list after archival
      get().loadHistory();

      return result?.ok ?? false;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to cleanup team';
      set({ error: msg, isLoading: false });
      console.error('[ClaudeTeamsStore] cleanupTeam error:', err);
      return false;
    }
  },

  refreshTeam: async (teamName) => {
    try {
      await window.electronAPI?.claudeTeams?.refreshTeam?.(teamName);
    } catch (err) {
      console.error('[ClaudeTeamsStore] refreshTeam error:', err);
    }
  },

  // -- History Actions --

  loadHistory: async () => {
    try {
      set({ isLoadingHistory: true });
      const result = await window.electronAPI?.teamHistory?.listArchives?.();
      if (result?.ok) {
        set({ history: result.entries ?? [], isLoadingHistory: false });
      } else {
        set({ isLoadingHistory: false });
      }
    } catch (err) {
      console.error('[ClaudeTeamsStore] loadHistory error:', err);
      set({ isLoadingHistory: false });
    }
  },

  deleteArchive: async (archiveId) => {
    try {
      const result = await window.electronAPI?.teamHistory?.deleteArchive?.(archiveId);
      if (result?.ok) {
        // Remove from local state
        const { history } = get();
        set({ history: history.filter((h) => h.id !== archiveId) });
        return true;
      }
      return false;
    } catch (err) {
      console.error('[ClaudeTeamsStore] deleteArchive error:', err);
      return false;
    }
  },

  // -- Template Actions --

  loadTemplates: async () => {
    try {
      set({ isLoadingTemplates: true });
      const result = await window.electronAPI?.teamTemplates?.list?.();
      if (result?.ok) {
        set({ templates: (result.templates ?? []) as TeamTemplate[], isLoadingTemplates: false });
      } else {
        set({ isLoadingTemplates: false });
      }
    } catch (err) {
      console.error('[ClaudeTeamsStore] loadTemplates error:', err);
      set({ isLoadingTemplates: false });
    }
  },

  saveTemplate: async (template) => {
    try {
      const result = await window.electronAPI?.teamTemplates?.save?.(template);
      if (result?.ok) {
        // Refresh templates list
        get().loadTemplates();
        return true;
      }
      return false;
    } catch (err) {
      console.error('[ClaudeTeamsStore] saveTemplate error:', err);
      return false;
    }
  },

  deleteTemplate: async (templateId) => {
    try {
      const result = await window.electronAPI?.teamTemplates?.delete?.(templateId);
      if (result?.ok) {
        const { templates } = get();
        set({ templates: templates.filter((t) => t.id !== templateId) });
        return true;
      }
      return false;
    } catch (err) {
      console.error('[ClaudeTeamsStore] deleteTemplate error:', err);
      return false;
    }
  },

  toggleTemplateFavorite: async (templateId) => {
    try {
      const result = await window.electronAPI?.teamTemplates?.toggleFavorite?.(templateId);
      if (result?.ok) {
        const { templates } = get();
        set({
          templates: templates.map((t) =>
            t.id === templateId ? { ...t, isFavorite: result.isFavorite ?? !t.isFavorite } : t
          ),
        });
        return true;
      }
      return false;
    } catch (err) {
      console.error('[ClaudeTeamsStore] toggleTemplateFavorite error:', err);
      return false;
    }
  },

  // -- Health Actions --

  checkTeammateHealth: () => {
    const { selectedTeam, teammateHealth: existingHealth } = get();
    if (!selectedTeam) {
      set({ teammateHealth: {} });
      return;
    }

    const now = Date.now();
    const UNRESPONSIVE_THRESHOLD = 5 * 60 * 1000; // 5 minutes (with active task)
    const DEAD_THRESHOLD = 10 * 60 * 1000; // 10 minutes (any agent, no task required)
    const health: Record<string, TeammateHealthInfo> = {};

    for (const member of selectedTeam.config.members) {
      // Skip lead
      if (member.agentId === selectedTeam.config.leadAgentId) continue;

      // Preserve exitedAt from previous health state
      const previousHealth = existingHealth[member.name];

      // Find latest activity from inbox messages
      const inbox = selectedTeam.inboxes[member.name] ?? [];
      let lastActivity = member.joinedAt;
      for (const msg of inbox) {
        const msgTime = new Date(msg.timestamp).getTime();
        if (msgTime > lastActivity) lastActivity = msgTime;
      }

      // Check if teammate has an active task
      const hasActiveTask = selectedTeam.tasks.some(
        (t) => t.owner === member.name && t.status === 'in_progress'
      );

      const timeSinceActivity = now - lastActivity;
      // Unresponsive: active task + >5min, OR any agent with no activity >10min
      const isUnresponsive = (hasActiveTask && timeSinceActivity > UNRESPONSIVE_THRESHOLD)
        || timeSinceActivity > DEAD_THRESHOLD;

      // Compute uptime
      const uptime = (previousHealth?.exitedAt ?? now) - member.joinedAt;

      // Count messages from this agent (in lead's inbox)
      const leadMember = selectedTeam.config.members.find(
        (m) => m.agentId === selectedTeam.config.leadAgentId
      );
      const leadInbox = leadMember ? (selectedTeam.inboxes[leadMember.name] ?? []) : [];
      const agentMessages = leadInbox.filter((msg) => msg.from === member.name);
      const messageCount = agentMessages.length;

      // Compute avg response time: human msg in agent inbox → next agent msg in lead inbox
      let avgResponseTime: number | undefined;
      const agentInbox = selectedTeam.inboxes[member.name] ?? [];
      const humanMsgs = agentInbox.filter((m) => m.from === 'human' || m.from === leadMember?.name);
      if (humanMsgs.length > 0 && agentMessages.length > 0) {
        const deltas: number[] = [];
        for (const hm of humanMsgs) {
          const hmTime = new Date(hm.timestamp).getTime();
          const nextResponse = agentMessages.find(
            (am) => new Date(am.timestamp).getTime() > hmTime
          );
          if (nextResponse) {
            deltas.push(new Date(nextResponse.timestamp).getTime() - hmTime);
          }
        }
        if (deltas.length > 0) {
          avgResponseTime = deltas.reduce((a, b) => a + b, 0) / deltas.length;
        }
      }

      health[member.name] = {
        lastActivity,
        isUnresponsive,
        exitedAt: previousHealth?.exitedAt,
        uptime,
        messageCount,
        avgResponseTime,
      };
    }

    // Preserve health entries for members no longer in config (exited)
    for (const [name, info] of Object.entries(existingHealth)) {
      if (info.exitedAt && !health[name]) {
        health[name] = info;
      }
    }

    set({ teammateHealth: health });
  },

  // -- Analytics --

  computeAnalytics: () => {
    const { selectedTeam, teammateHealth, taskFirstSeen } = get();
    if (!selectedTeam) {
      set({ teamAnalytics: null });
      return;
    }

    const now = Date.now();
    const teamUptime = now - selectedTeam.config.createdAt;
    const uptimeMinutes = teamUptime / 60000;
    const tasks = selectedTeam.tasks.filter((t) => t.status !== 'deleted' && t.metadata?._internal !== true);
    const completedTasks = tasks.filter((t) => t.status === 'completed');

    const velocity = uptimeMinutes > 0 ? completedTasks.length / uptimeMinutes : 0;
    const completionPct = tasks.length > 0 ? (completedTasks.length / tasks.length) * 100 : 0;

    // Total messages across all inboxes
    const totalMessages = Object.values(selectedTeam.inboxes)
      .reduce((sum, msgs) => sum + msgs.length, 0);
    const messageRate = uptimeMinutes > 0 ? totalMessages / uptimeMinutes : 0;

    // Avg response latency from per-agent health
    const responseTimes = Object.values(teammateHealth)
      .map((h) => h.avgResponseTime)
      .filter((t): t is number => t !== undefined);
    const avgResponseLatency = responseTimes.length > 0
      ? responseTimes.reduce((a, b) => a + b, 0) / responseTimes.length
      : 0;

    // Bottleneck detection: tasks with most blockedBy OR longest in_progress
    const scoredTasks = tasks
      .filter((t) => t.status !== 'completed')
      .map((t) => {
        const blockedByScore = t.blockedBy.length * 3;
        const durationScore = t.status === 'in_progress' && taskFirstSeen[t.id]
          ? (now - taskFirstSeen[t.id]) / 60000 // minutes running
          : 0;
        return { id: t.id, score: blockedByScore + durationScore };
      })
      .sort((a, b) => b.score - a.score);
    const bottleneckTaskIds = scoredTasks.slice(0, 3).filter((t) => t.score > 0).map((t) => t.id);

    const analytics: TeamAnalytics = {
      velocity,
      completionPct,
      totalMessages,
      avgResponseLatency,
      messageRate,
      bottleneckTaskIds,
      teamUptime,
    };

    set({ teamAnalytics: analytics });
  },

  markInboxRead: async (teamName, agentName) => {
    await window.electronAPI?.claudeTeams?.markInboxRead?.({ teamName, agentName });
  },

  // -- Bulk Operations --

  shutdownAllTeammates: async (teamName) => {
    const { selectedTeam, shutdownTeammate } = get();
    if (!selectedTeam || selectedTeam.config.name !== teamName) return false;

    const nonLeadMembers = selectedTeam.config.members.filter(
      (m) => m.agentId !== selectedTeam.config.leadAgentId
    );

    let allOk = true;
    for (const member of nonLeadMembers) {
      const ok = await shutdownTeammate({
        teamName,
        recipient: member.name,
        content: 'Shutdown requested via bulk operation',
      });
      if (!ok) allOk = false;
    }
    return allOk;
  },

  broadcastToTeammates: async (teamName, content) => {
    const { selectedTeam, messageTeammate } = get();
    if (!selectedTeam || selectedTeam.config.name !== teamName) return false;

    const nonLeadMembers = selectedTeam.config.members.filter(
      (m) => m.agentId !== selectedTeam.config.leadAgentId
    );

    let allOk = true;
    for (const member of nonLeadMembers) {
      const ok = await messageTeammate({
        teamName,
        recipient: member.name,
        content,
        summary: content.slice(0, 50),
      });
      if (!ok) allOk = false;
    }
    return allOk;
  },
}));

/**
 * Track teams that were already archived via UI cleanup to prevent
 * double-archiving when the watcher fires team-deleted.
 */
const recentlyArchivedTeams = new Set<string>();

/**
 * Set up IPC event listeners for file watcher updates from main process.
 * Call this once on mount (e.g., in ClaudeTeams component useEffect).
 */
export function setupClaudeTeamsIpcListeners(): () => void {
  const store = useClaudeTeamsStore.getState();
  const cleanups: (() => void)[] = [];

  // Automatic 30-second health + analytics polling
  const healthPollInterval = setInterval(() => {
    const s = useClaudeTeamsStore.getState();
    s.checkTeammateHealth();
    s.computeAnalytics();
  }, 30_000);
  cleanups.push(() => clearInterval(healthPollInterval));

  // Listen for state update events from the main process file watcher
  const cleanup = window.electronAPI?.claudeTeams?.onStateUpdate?.((raw: unknown) => {
    const event = raw as ClaudeTeamsIpcEvent;
    const s = useClaudeTeamsStore.getState();

    switch (event.type) {
      case 'team-config-changed':
        s.updateTeamConfig(event.teamName, event.config);
        break;

      case 'tasks-changed':
        s.updateTeamTasks(event.teamName, event.tasks);
        break;

      case 'inbox-changed':
        s.updateTeamInbox(event.teamName, event.agentName, event.messages);
        break;

      case 'team-created':
        s.addTeam({
          config: event.config,
          tasks: [],
          inboxes: {},
          teammates: [],
          lastUpdated: Date.now(),
        });
        break;

      case 'team-deleted': {
        // Auto-archive team data before removing from state
        // (skip if already archived via UI cleanupTeam flow)
        if (!recentlyArchivedTeams.has(event.teamName)) {
          const teamSnapshot = useClaudeTeamsStore
            .getState()
            .teams.find((t) => t.config.name === event.teamName);
          if (teamSnapshot) {
            window.electronAPI?.teamHistory
              ?.archiveSession?.({
                teamName: event.teamName,
                config: teamSnapshot.config,
                tasks: teamSnapshot.tasks,
                inboxes: teamSnapshot.inboxes,
              })
              .then(() => {
                console.log(
                  '[ClaudeTeamsStore] Auto-archived team on external deletion:',
                  event.teamName,
                );
                useClaudeTeamsStore.getState().loadHistory();
              })
              .catch((err: unknown) => {
                console.error(
                  '[ClaudeTeamsStore] Auto-archive on deletion failed:',
                  err,
                );
              });
          }
        }
        recentlyArchivedTeams.delete(event.teamName);
        s.removeTeam(event.teamName);
        break;
      }

      case 'team-stale': {
        const staleTeam = useClaudeTeamsStore
          .getState()
          .teams.find((t) => t.config.name === event.teamName);
        if (staleTeam) {
          console.log('[ClaudeTeamsStore] Stale team detected, auto-cleaning:', event.teamName);
          recentlyArchivedTeams.add(event.teamName);
          window.electronAPI?.teamHistory
            ?.archiveSession?.({
              teamName: event.teamName,
              config: staleTeam.config,
              tasks: staleTeam.tasks,
              inboxes: staleTeam.inboxes,
            })
            .then(() => window.electronAPI?.claudeTeams?.cleanupTeam?.({ teamName: event.teamName }))
            .then(() => useClaudeTeamsStore.getState().loadHistory())
            .catch((err: unknown) => {
              console.error('[ClaudeTeamsStore] Stale team cleanup failed:', err);
              recentlyArchivedTeams.delete(event.teamName);
            });
        }
        break;
      }

      case 'watcher-error':
        s.setError(event.error);
        break;
    }
  });

  if (cleanup) cleanups.push(cleanup);

  return () => {
    cleanups.forEach((fn) => fn());
  };
}
