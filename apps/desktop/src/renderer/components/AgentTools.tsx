import React, { useState, useEffect, useCallback } from 'react';
import {
  Server, Wrench, Brain, Code, Search, FileCheck,
  Lightbulb, Monitor, Globe, AlertTriangle, CheckCircle2,
  XCircle, ChevronDown, ChevronRight, Plus, Settings, RefreshCw, Crown, HardHat
} from 'lucide-react';
import { useCommandCenterStore } from '../stores/command-center-store';

type AgentPhase = 'leader' | 'worker' | 'spec' | 'planning' | 'coding' | 'qa' | 'insights' | 'ideation' | 'roadmap' | 'utility';

interface McpServer {
  id: string;
  name: string;
  url: string;
  status: 'connected' | 'error' | 'connecting';
  enabled: boolean;
  toolCount?: number;
}

const PhaseIcon = ({ phase }: { phase: AgentPhase }) => {
  switch (phase) {
    case 'leader': return <Crown className="w-4 h-4 text-yellow-400" />;
    case 'worker': return <HardHat className="w-4 h-4 text-blue-400" />;
    case 'spec': return <Brain className="w-4 h-4 text-purple-400" />;
    case 'planning': return <Wrench className="w-4 h-4 text-orange-400" />;
    case 'coding': return <Code className="w-4 h-4 text-blue-400" />;
    case 'qa': return <FileCheck className="w-4 h-4 text-green-400" />;
    case 'insights': return <Search className="w-4 h-4 text-pink-400" />;
    case 'ideation': return <Lightbulb className="w-4 h-4 text-primary" />;
    case 'roadmap': return <Monitor className="w-4 h-4 text-cyan-400" />;
    case 'utility': return <Globe className="w-4 h-4 text-muted-foreground" />;
    default: return <Server className="w-4 h-4" />;
  }
};

const StatusBadge = ({ status }: { status: McpServer['status'] }) => {
  switch (status) {
    case 'connected': return <div className="flex items-center gap-1 text-[10px] text-green-400 bg-green-400/10 px-1.5 py-0.5 rounded"><CheckCircle2 className="w-3 h-3" /> Connected</div>;
    case 'error': return <div className="flex items-center gap-1 text-[10px] text-red-400 bg-red-400/10 px-1.5 py-0.5 rounded"><XCircle className="w-3 h-3" /> Error</div>;
    case 'connecting': return <div className="flex items-center gap-1 text-[10px] text-primary bg-primary/10 px-1.5 py-0.5 rounded"><AlertTriangle className="w-3 h-3" /> Connecting...</div>;
  }
};

export function AgentTools() {
  const { agents: agentsMap, wsConnected, refreshAgents } = useCommandCenterStore();
  const [servers, setServers] = useState<McpServer[]>([]);
  const [expandedPhases, setExpandedPhases] = useState<Record<string, boolean>>({ 'leader': true, 'worker': true });
  const [isLoadingServers, setIsLoadingServers] = useState(true);

  // Convert agents Map to array and map to our AgentConfig format
  const agents = Array.from(agentsMap.values()).map(agent => ({
    id: agent.id,
    label: agent.label || agent.id,
    description: agent.currentTask || 'No active task',
    phase: (agent.role === 'leader' ? 'leader' : 'worker') as AgentPhase,
    model: agent.model || 'unknown',
    status: agent.status,
    lastHeartbeat: agent.lastHeartbeat,
    tools: [] as string[],
    mcpServers: [] as string[],
  }));

  // Load MCP server status
  const loadMcpServers = useCallback(async () => {
    setIsLoadingServers(true);
    try {
      // Check MCP_CORE health
      const mcpHealth = await window.electronAPI.mcp.health();

      // Check Gateway health
      const gatewayHealth = await window.electronAPI.gateway.health();

      // Get tool count from MCP
      let toolCount = 0;
      try {
        const toolsResult = await window.electronAPI.mcp.tools();
        if (toolsResult.tools) {
          toolCount = toolsResult.tools.length;
        }
      } catch {
        // Tools unavailable
      }

      const newServers: McpServer[] = [
        {
          id: 'mcp-core',
          name: 'MCP Core',
          url: 'http://127.0.0.1:8100',
          status: mcpHealth.ok ? 'connected' : 'error',
          enabled: true,
          toolCount,
        },
        {
          id: 'gateway',
          name: 'Gateway',
          url: 'http://127.0.0.1:8200',
          status: gatewayHealth.ok ? 'connected' : 'error',
          enabled: true,
        },
      ];

      // Check Graphiti if configured
      try {
        const graphitiStatus = await window.electronAPI.graphiti.status();
        if (graphitiStatus.enabled) {
          const graphitiHealth = await window.electronAPI.graphiti.health();
          newServers.push({
            id: 'graphiti',
            name: 'Graphiti Memory',
            url: graphitiStatus.url,
            status: graphitiHealth.ok ? 'connected' : 'error',
            enabled: graphitiStatus.enabled,
          });
        }
      } catch {
        // Graphiti not configured
      }

      setServers(newServers);
    } catch (error) {
      console.error('Failed to load MCP servers:', error);
      setServers([
        { id: 'mcp-core', name: 'MCP Core', url: 'http://127.0.0.1:8100', status: 'error', enabled: false },
        { id: 'gateway', name: 'Gateway', url: 'http://127.0.0.1:8200', status: 'error', enabled: false },
      ]);
    } finally {
      setIsLoadingServers(false);
    }
  }, []);

  useEffect(() => {
    loadMcpServers();
  }, [loadMcpServers]);

  const togglePhase = (phase: string) => {
    setExpandedPhases(prev => ({ ...prev, [phase]: !prev[phase] }));
  };

  // Group agents by phase (role)
  const agentsByPhase = agents.reduce((acc, agent) => {
    if (!acc[agent.phase]) acc[agent.phase] = [];
    acc[agent.phase].push(agent);
    return acc;
  }, {} as Record<AgentPhase, typeof agents>);

  const phases: AgentPhase[] = ['leader', 'worker'];

  return (
    <div className="h-full flex flex-col bg-background p-6 overflow-hidden">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-2xl font-bold text-foreground flex items-center gap-3">
            <Server className="w-6 h-6 text-primary" />
            Agent Tools & MCP
          </h2>
          <p className="text-muted-foreground mt-1">
            {wsConnected ? (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse" />
                Live agent monitoring via WebSocket
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-red-500" />
                WebSocket disconnected
              </span>
            )}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { refreshAgents(); loadMcpServers(); }}
            className="flex items-center gap-2 px-3 py-2 bg-card border border-border hover:bg-secondary rounded-lg text-sm transition-colors text-foreground"
          >
            <RefreshCw className="w-4 h-4" />
            Refresh
          </button>
          <button className="flex items-center gap-2 px-3 py-2 bg-card border border-border hover:bg-secondary rounded-lg text-sm transition-colors text-foreground hover:text-white">
            <Plus className="w-4 h-4" />
            Add Custom MCP
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-full overflow-hidden">

        {/* Left Column: Live Agents */}
        <div className="lg:col-span-2 flex flex-col gap-4 overflow-y-auto pr-2 pb-10">
          {agents.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-64 text-center border border-dashed border-border rounded-xl bg-card/30">
              <Server className="w-12 h-12 text-muted-foreground/30 mb-4" />
              <h3 className="text-lg font-medium text-foreground mb-2">No Agents Active</h3>
              <p className="text-sm text-muted-foreground max-w-md">
                {wsConnected
                  ? 'No agents are currently registered. Start a Claude CLI session to see agents appear here.'
                  : 'Connect to the Gateway WebSocket to see live agent updates.'}
              </p>
            </div>
          ) : (
            phases.map(phase => {
              const phaseAgents = agentsByPhase[phase] || [];
              if (phaseAgents.length === 0) return null;

              const isExpanded = expandedPhases[phase];

              return (
                <div key={phase} className="border border-border rounded-xl bg-card/30 overflow-hidden">
                  <button
                    onClick={() => togglePhase(phase)}
                    className="w-full flex items-center justify-between p-4 hover:bg-secondary/50 transition-colors"
                  >
                    <div className="flex items-center gap-3">
                      {isExpanded ? <ChevronDown className="w-4 h-4 text-muted-foreground" /> : <ChevronRight className="w-4 h-4 text-muted-foreground" />}
                      <div className="p-2 bg-card rounded-lg border border-border">
                        <PhaseIcon phase={phase} />
                      </div>
                      <span className="text-sm font-medium uppercase tracking-wider text-foreground">{phase}s</span>
                      <span className="text-xs text-muted-foreground bg-card px-2 py-0.5 rounded-full">{phaseAgents.length} Agent{phaseAgents.length !== 1 ? 's' : ''}</span>
                    </div>
                  </button>

                  {isExpanded && (
                    <div className="p-4 pt-0 grid gap-4">
                      {phaseAgents.map(agent => (
                        <div key={agent.id} className="bg-background border border-border rounded-lg p-4">
                          <div className="flex items-start justify-between mb-2">
                            <div>
                              <h4 className="text-sm font-bold text-foreground flex items-center gap-2">
                                {agent.label}
                                <span className={`w-2 h-2 rounded-full ${
                                  agent.status === 'idle' ? 'bg-green-500' :
                                  agent.status === 'busy' ? 'bg-yellow-500 animate-pulse' :
                                  agent.status === 'error' ? 'bg-red-500' : 'bg-muted'
                                }`} />
                              </h4>
                              <p className="text-xs text-muted-foreground mt-1">{agent.description}</p>
                            </div>
                            <div className="flex items-center gap-2">
                              <div className="text-[10px] text-muted-foreground bg-card px-2 py-1 rounded border border-border">
                                {agent.model}
                              </div>
                              <div className={`text-[10px] px-2 py-1 rounded border ${
                                agent.status === 'idle' ? 'text-green-400 bg-green-400/10 border-green-400/20' :
                                agent.status === 'busy' ? 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20' :
                                'text-red-400 bg-red-400/10 border-red-400/20'
                              }`}>
                                {agent.status}
                              </div>
                            </div>
                          </div>

                          {agent.lastHeartbeat && (
                            <div className="mt-2 text-[10px] text-muted-foreground">
                              Last heartbeat: {new Date(agent.lastHeartbeat).toLocaleTimeString()}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>

        {/* Right Column: MCP Servers */}
        <div className="bg-card/50 border border-border rounded-xl overflow-hidden flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between bg-card">
            <h3 className="font-medium text-foreground">MCP Servers</h3>
            <span className="text-xs text-muted-foreground">
              {isLoadingServers ? 'Loading...' : `${servers.filter(s => s.status === 'connected').length}/${servers.length} Connected`}
            </span>
          </div>

          <div className="p-4 flex-1 overflow-y-auto">
            <div className="flex flex-col gap-3">
              {servers.map(server => (
                <div key={server.id} className="bg-background border border-border rounded-lg p-3">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                       {/* Connection Status Dot */}
                       <div className={`w-2 h-2 rounded-full ${
                          server.status === 'connected' ? 'bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]' :
                          server.status === 'error' ? 'bg-red-500' : 'bg-primary animate-pulse'
                       }`} />

                       <div>
                         <div className="text-sm font-medium text-foreground">{server.name}</div>
                         <div className="text-xs text-muted-foreground font-mono truncate max-w-[150px]">{server.url}</div>
                       </div>
                    </div>

                    {server.toolCount !== undefined && (
                      <div className="text-[10px] text-muted-foreground bg-card px-2 py-1 rounded border border-border">
                        {server.toolCount} tools
                      </div>
                    )}
                  </div>

                  <div className="mt-2 flex items-center justify-between">
                     <StatusBadge status={server.status} />
                     <button className="p-1 hover:bg-secondary rounded text-muted-foreground hover:text-foreground">
                        <Settings className="w-3 h-3" />
                     </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-6 p-4 border border-dashed border-border rounded-lg bg-card/30 flex flex-col items-center justify-center text-center">
               <div className="w-10 h-10 rounded-full bg-secondary flex items-center justify-center mb-2">
                 <Server className="w-5 h-5 text-muted-foreground" />
               </div>
               <p className="text-sm text-muted-foreground font-medium">Auto-Discovery Enabled</p>
               <p className="text-xs text-muted-foreground mt-1 max-w-[200px]">
                 Kuroryuu automatically detects local MCP servers and gateway health
               </p>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
