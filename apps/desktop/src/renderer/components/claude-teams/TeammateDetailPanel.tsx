/**
 * TeammateDetailPanel - Side panel that slides in when a teammate node is selected.
 * Shows teammate info, current task, inbox messages, and action buttons.
 */
import { useMemo } from 'react';
import {
  User,
  Crown,
  X,
  CheckCircle,
  Clock,
  XCircle,
  MessageSquare,
} from 'lucide-react';
import { useClaudeTeamsStore } from '../../stores/claude-teams-store';
import { useTeamFlowStore } from '../../stores/team-flow-store';
import type { TeamMember, TeamTask, InboxMessage, TeammateStatus } from '../../types/claude-teams';
import { TeammateOutputViewer } from './TeammateOutputViewer';
import { TeammateActions } from './TeammateActions';

function getStatusConfig(status: TeammateStatus): { label: string; color: string; bg: string; Icon: typeof CheckCircle } {
  switch (status) {
    case 'active':
      return { label: 'Active', color: 'text-green-400', bg: 'bg-green-900/30 border-green-700/50', Icon: CheckCircle };
    case 'idle':
      return { label: 'Idle', color: 'text-yellow-400', bg: 'bg-yellow-900/30 border-yellow-700/50', Icon: Clock };
    case 'stopped':
      return { label: 'Stopped', color: 'text-red-400', bg: 'bg-red-900/30 border-red-700/50', Icon: XCircle };
  }
}

function getModelBadge(model: string): string {
  if (model.includes('opus')) return 'OPUS';
  if (model.includes('sonnet')) return 'SONNET';
  if (model.includes('haiku')) return 'HAIKU';
  return model.split('-').pop()?.toUpperCase() ?? 'MODEL';
}

function formatTime(epoch: number): string {
  try {
    return new Date(epoch).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  } catch {
    return 'Unknown';
  }
}

function deriveStatus(
  memberName: string,
  isLead: boolean,
  inboxes: Record<string, InboxMessage[]>,
  tasks: TeamTask[]
): TeammateStatus {
  if (isLead) return 'active';
  const hasActiveTask = tasks.some((t) => t.owner === memberName && t.status === 'in_progress');
  if (hasActiveTask) return 'active';
  const inbox = inboxes[memberName] ?? [];
  if (inbox.length > 0) {
    const latest = inbox[inbox.length - 1];
    try {
      const parsed = JSON.parse(latest.text);
      if (parsed?.type === 'idle_notification') return 'idle';
      if (parsed?.type === 'shutdown_approved') return 'stopped';
    } catch {
      return 'active';
    }
  }
  return 'idle';
}

export function TeammateDetailPanel() {
  const selectedTeam = useClaudeTeamsStore((s) => s.selectedTeam);
  const selectedTeamTasks = useClaudeTeamsStore((s) => s.selectedTeamTasks);
  const selectedTeammateId = useTeamFlowStore((s) => s.selectedTeammateId);
  const selectTeammate = useTeamFlowStore((s) => s.selectTeammate);

  // Find the member and derived data
  const member: TeamMember | undefined = useMemo(() => {
    if (!selectedTeam || !selectedTeammateId) return undefined;
    return selectedTeam.config.members.find((m) => m.name === selectedTeammateId);
  }, [selectedTeam, selectedTeammateId]);

  const isLead = useMemo(() => {
    if (!selectedTeam || !member) return false;
    return member.agentId === selectedTeam.config.leadAgentId;
  }, [selectedTeam, member]);

  const memberTasks = useMemo(() => {
    if (!selectedTeammateId) return [];
    return selectedTeamTasks.filter((t) => t.owner === selectedTeammateId);
  }, [selectedTeamTasks, selectedTeammateId]);

  const activeTask = useMemo(() => {
    return memberTasks.find((t) => t.status === 'in_progress') ?? null;
  }, [memberTasks]);

  const memberMessages = useMemo((): InboxMessage[] => {
    if (!selectedTeam || !selectedTeammateId) return [];
    const inbox = selectedTeam.inboxes[selectedTeammateId] ?? [];
    return inbox.slice(-10);
  }, [selectedTeam, selectedTeammateId]);

  const status = useMemo((): TeammateStatus => {
    if (!selectedTeam || !selectedTeammateId) return 'idle';
    return deriveStatus(
      selectedTeammateId,
      isLead,
      selectedTeam.inboxes,
      selectedTeamTasks
    );
  }, [selectedTeam, selectedTeammateId, isLead, selectedTeamTasks]);

  const statusConfig = getStatusConfig(status);
  const isOpen = selectedTeammateId !== null && member !== undefined;

  return (
    <div
      className={`absolute top-0 right-0 h-full w-80 z-20
        bg-gray-950 border-l border-gray-800
        flex flex-col
        transition-transform duration-300 ease-in-out
        ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}
    >
      {member && selectedTeam && (
        <>
          {/* Header */}
          <div className="flex items-center justify-between px-3 py-3 border-b border-gray-800">
            <div className="flex items-center gap-2 min-w-0">
              {isLead ? (
                <Crown className="w-4 h-4 text-purple-400 flex-shrink-0" />
              ) : (
                <User className="w-4 h-4 text-cyan-400 flex-shrink-0" />
              )}
              <span className="text-sm font-bold text-gray-100 truncate">{member.name}</span>
              {member.color && (
                <span
                  className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                  style={{ backgroundColor: member.color }}
                />
              )}
            </div>
            <div className="flex items-center gap-2 flex-shrink-0">
              {/* Status badge */}
              <span className={`flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium border ${statusConfig.bg} ${statusConfig.color}`}>
                <statusConfig.Icon className="w-3 h-3" />
                {statusConfig.label}
              </span>
              {/* Model badge */}
              <span className="px-1.5 py-0.5 rounded text-[9px] font-bold bg-gray-800 text-gray-400 border border-gray-700">
                {getModelBadge(member.model)}
              </span>
              {/* Close */}
              <button
                onClick={() => selectTeammate(null)}
                className="p-1 rounded text-gray-500 hover:text-gray-200 hover:bg-gray-800 transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Scrollable content */}
          <div className="flex-1 overflow-y-auto">
            {/* Info Card */}
            <div className="px-3 py-2.5 border-b border-gray-800/50">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Info</div>
              <div className="grid grid-cols-2 gap-y-1.5 gap-x-3 text-xs">
                <div>
                  <span className="text-gray-500">Type</span>
                  <p className="text-gray-300">{member.agentType}</p>
                </div>
                <div>
                  <span className="text-gray-500">Joined</span>
                  <p className="text-gray-300">{formatTime(member.joinedAt)}</p>
                </div>
                <div className="col-span-2">
                  <span className="text-gray-500">Working Dir</span>
                  <p className="text-gray-300 truncate text-[11px] font-mono" title={member.cwd}>
                    {member.cwd}
                  </p>
                </div>
                {member.planModeRequired && (
                  <div className="col-span-2">
                    <span className="inline-flex items-center gap-1 text-[10px] px-1.5 py-0.5 rounded bg-purple-900/30 text-purple-400 border border-purple-700/40">
                      Plan mode required
                    </span>
                  </div>
                )}
              </div>
            </div>

            {/* Current Task */}
            <div className="px-3 py-2.5 border-b border-gray-800/50">
              <div className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">Current Task</div>
              {activeTask ? (
                <div className="rounded border border-gray-800 bg-gray-900/50 p-2">
                  <div className="flex items-center gap-1.5 mb-1">
                    <CheckCircle className="w-3 h-3 text-green-400" />
                    <span className="text-xs font-medium text-gray-200">{activeTask.subject}</span>
                  </div>
                  {activeTask.activeForm && (
                    <div className="flex items-center gap-1.5 mb-1">
                      <span className="text-[10px] text-cyan-400 animate-pulse">{activeTask.activeForm}</span>
                    </div>
                  )}
                  {activeTask.description && (
                    <p className="text-[11px] text-gray-400 line-clamp-3">{activeTask.description}</p>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1.5 text-xs text-gray-600">
                  <Clock className="w-3 h-3" />
                  <span>No active task</span>
                </div>
              )}

              {/* Task summary */}
              {memberTasks.length > 0 && (
                <div className="mt-1.5 flex items-center gap-2 text-[10px] text-gray-500">
                  <span>{memberTasks.filter((t) => t.status === 'completed').length} completed</span>
                  <span className="text-gray-700">|</span>
                  <span>{memberTasks.filter((t) => t.status === 'pending').length} pending</span>
                  <span className="text-gray-700">|</span>
                  <span>{memberTasks.length} total</span>
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="px-3 py-2.5 border-b border-gray-800/50">
              <div className="flex items-center gap-1.5 mb-1.5">
                <div className="text-[10px] uppercase tracking-wider text-gray-500">Messages</div>
                <MessageSquare className="w-3 h-3 text-gray-600" />
                {memberMessages.length > 0 && (
                  <span className="text-[10px] text-gray-600">({memberMessages.length})</span>
                )}
              </div>
              <div className="rounded border border-gray-800 bg-gray-900/30 overflow-hidden">
                <TeammateOutputViewer messages={memberMessages} agentName={member.name} />
              </div>
            </div>

            {/* Actions */}
            <div className="px-3 py-2.5">
              <TeammateActions
                teamName={selectedTeam.config.name}
                memberName={member.name}
                isLead={isLead}
                planModeRequired={member.planModeRequired}
              />
            </div>
          </div>
        </>
      )}
    </div>
  );
}
