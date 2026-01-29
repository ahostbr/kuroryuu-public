/**
 * Agents Tab
 *
 * Real-time agent dashboard - synced with Terminals header data.
 * Uses useAgentStore (HTTP polling) for reliable data.
 */
import React, { useState, useEffect, useMemo } from 'react';
import { Users, Crown, HardHat, Circle, Activity, RefreshCw } from 'lucide-react';
import { useAgentStore } from '../../../stores/agent-store';
import { AgentCard } from '../agents/AgentCard';
import { AgentDetailPanel } from '../agents/AgentDetailPanel';
import type { LiveAgent, AgentFilter } from '../../../types/command-center';

const FILTER_OPTIONS: { value: AgentFilter; label: string; icon?: React.ReactNode }[] = [
  { value: 'all', label: 'All' },
  { value: 'leader', label: 'Leaders', icon: <Crown className="w-3 h-3" /> },
  { value: 'worker', label: 'Workers', icon: <HardHat className="w-3 h-3" /> },
  { value: 'idle', label: 'Idle', icon: <Circle className="w-3 h-3 text-success" /> },
  { value: 'busy', label: 'Busy', icon: <Activity className="w-3 h-3 text-warning" /> },
];

export function AgentsTab() {
  // Use agent-store (same source as Terminals header)
  const { agents: rawAgents, fetchAgents, startPolling, stopPolling } = useAgentStore();
  const [selectedAgentId, setSelectedAgentId] = useState<string | null>(null);
  const [agentFilter, setAgentFilter] = useState<AgentFilter>('all');

  // Start polling on mount, cleanup on unmount
  useEffect(() => {
    fetchAgents();
    startPolling();
    return () => stopPolling();
  }, [fetchAgents, startPolling, stopPolling]);

  // Map Agent -> LiveAgent for AgentCard compatibility
  const agents: LiveAgent[] = useMemo(() => {
    return rawAgents.map((agent) => ({
      id: agent.agent_id,
      role: agent.role,
      status: agent.status,
      lastHeartbeat: agent.last_heartbeat,
      registeredAt: agent.registered_at,
      model: agent.model_name,
      capabilities: agent.capabilities,
      currentTaskId: agent.current_task_id || undefined,
    }));
  }, [rawAgents]);

  // Filter agents based on selected filter
  const filteredAgents = useMemo(() => {
    return agents.filter((a) => {
      if (agentFilter === 'all') return true;
      if (agentFilter === 'leader') return a.role === 'leader';
      if (agentFilter === 'worker') return a.role === 'worker';
      if (agentFilter === 'idle') return a.status === 'idle';
      if (agentFilter === 'busy') return a.status === 'busy';
      return true;
    });
  }, [agents, agentFilter]);

  const selectedAgent = filteredAgents.find((a) => a.id === selectedAgentId);

  return (
    <div className="flex h-full">
      {/* Agent List */}
      <div className="flex-1 flex flex-col p-6 overflow-hidden">
        {/* Filters */}
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            {FILTER_OPTIONS.map((option) => (
              <button
                key={option.value}
                onClick={() => setAgentFilter(option.value)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm font-medium transition-colors ${
                  agentFilter === option.value
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                {option.icon}
                {option.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">
              {filteredAgents.length} agent{filteredAgents.length !== 1 ? 's' : ''}
              {agentFilter !== 'all' && ` (${agents.length} total)`}
            </span>
            <button
              onClick={() => fetchAgents()}
              className="p-2 rounded-lg hover:bg-secondary transition-colors"
              title="Refresh agents"
            >
              <RefreshCw className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        </div>

        {/* Agent Grid */}
        <div className="flex-1 overflow-auto">
          {filteredAgents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-center">
              <Users className="w-16 h-16 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No Agents Active</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {agents.length > 0
                  ? `No agents match the "${agentFilter}" filter. Try selecting "All".`
                  : 'No agents are currently registered. Start a Claude CLI session to see agents appear here.'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
              {filteredAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isSelected={agent.id === selectedAgentId}
                  onClick={() => setSelectedAgentId(agent.id === selectedAgentId ? null : agent.id)}
                />
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Detail Panel */}
      {selectedAgent && (
        <div className="w-80 border-l border-border bg-card">
          <AgentDetailPanel agent={selectedAgent} onClose={() => setSelectedAgentId(null)} />
        </div>
      )}
    </div>
  );
}

export default AgentsTab;
