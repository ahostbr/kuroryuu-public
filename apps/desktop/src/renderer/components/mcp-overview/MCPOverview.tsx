/**
 * MCPOverview - View showing agents, MCP servers, and available tools
 * Based on Kuroryuu's MCP Overview design
 */
import React, { useEffect, useState } from 'react';
import {
  Server,
  Wrench,
  Brain,
  Code,
  Search,
  FileCheck,
  Users,
  RefreshCw,
  ChevronRight,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  Loader2,
  Database,
  Inbox,
  FolderGit2,
  Activity,
} from 'lucide-react';
import { Button } from '../ui/button';
import { useMCPOverviewStore } from '../../stores/mcp-overview-store';
import { AgentInfo, MCPTool, MCPServer, ToolCategory } from '../../types/mcp-overview';
import { cn } from '../../lib/utils';

// ============================================================================
// Sub-components
// ============================================================================

function AgentCard({ agent, isSelected, onClick }: { 
  agent: AgentInfo; 
  isSelected: boolean; 
  onClick: () => void;
}) {
  const statusColors = {
    ready: 'text-green-400 bg-green-400/10',
    busy: 'text-amber-400 bg-amber-400/10',
    offline: 'text-muted-foreground bg-muted-foreground/10',
    error: 'text-red-400 bg-red-400/10',
  };

  const costColors = {
    low: 'text-green-400',
    medium: 'text-amber-400',
    high: 'text-red-400',
  };

  return (
    <button
      onClick={onClick}
      className={cn(
        'w-full flex items-start gap-3 p-4 rounded-xl border-2 transition-all duration-200 text-left',
        isSelected
          ? 'border-primary bg-primary/5'
          : 'border-border bg-card/50 hover:border-border'
      )}
    >
      <div
        className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
        style={{ backgroundColor: `${agent.color}20` }}
      >
        {agent.category === 'build' ? (
          <Code className="w-5 h-5" style={{ color: agent.color }} />
        ) : (
          <Brain className="w-5 h-5" style={{ color: agent.color }} />
        )}
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-white truncate">{agent.name}</span>
          <span className={cn('text-[10px] px-1.5 py-0.5 rounded', statusColors[agent.status])}>
            {agent.status.toUpperCase()}
          </span>
        </div>
        <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{agent.description}</p>
        <div className="flex items-center gap-3 text-[10px] text-muted-foreground">
          <span>{agent.model}</span>
          <span className={costColors[agent.costTier]}>
            {agent.costTier === 'high' ? '●●●' : agent.costTier === 'medium' ? '●●○' : '●○○'} cost
          </span>
          {agent.mcpToolCount > 0 && (
            <span className="flex items-center gap-1">
              <Wrench className="w-3 h-3" />
              {agent.mcpToolCount} MCP
            </span>
          )}
        </div>
      </div>

      <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-3" />
    </button>
  );
}

function ServerCard({ server, onClick }: { server: MCPServer; onClick: () => void }) {
  const statusConfig = {
    connected: { icon: CheckCircle2, color: 'text-green-400', bg: 'bg-green-400/10' },
    connecting: { icon: Loader2, color: 'text-amber-400', bg: 'bg-amber-400/10' },
    disconnected: { icon: XCircle, color: 'text-muted-foreground', bg: 'bg-muted-foreground/10' },
    error: { icon: AlertTriangle, color: 'text-red-400', bg: 'bg-red-400/10' },
  };

  const config = statusConfig[server.status];
  const StatusIcon = config.icon;

  return (
    <button
      onClick={onClick}
      className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card/50 hover:border-border transition-colors w-full text-left"
    >
      <div className={cn('w-8 h-8 rounded-lg flex items-center justify-center', config.bg)}>
        <Server className={cn('w-4 h-4', config.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{server.name}</span>
          <StatusIcon className={cn('w-3.5 h-3.5', config.color, server.status === 'connecting' && 'animate-spin')} />
        </div>
        <p className="text-xs text-muted-foreground truncate">{server.url}</p>
      </div>
      <span className="text-xs text-muted-foreground">{server.toolCount} tools</span>
    </button>
  );
}

function ToolCategoryIcon({ category }: { category: ToolCategory }) {
  switch (category) {
    case 'rag':
      return <Search className="w-4 h-4 text-purple-400" />;
    case 'inbox':
      return <Inbox className="w-4 h-4 text-blue-400" />;
    case 'checkpoint':
      return <Database className="w-4 h-4 text-green-400" />;
    case 'repo':
      return <FolderGit2 className="w-4 h-4 text-orange-400" />;
    case 'file':
      return <FileCheck className="w-4 h-4 text-cyan-400" />;
    case 'git':
      return <FolderGit2 className="w-4 h-4 text-red-400" />;
    default:
      return <Wrench className="w-4 h-4 text-muted-foreground" />;
  }
}

function ToolCard({ tool, onToggle }: { tool: MCPTool; onToggle: () => void }) {
  return (
    <div className="flex items-center gap-3 p-3 rounded-lg border border-border bg-card/30">
      <ToolCategoryIcon category={tool.category} />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-mono text-foreground truncate block">{tool.name}</span>
        <p className="text-xs text-muted-foreground truncate">{tool.description}</p>
      </div>
      <button
        onClick={onToggle}
        className={cn(
          'w-8 h-4 rounded-full p-0.5 transition-colors',
          tool.enabled ? 'bg-primary' : 'bg-muted'
        )}
      >
        <div
          className={cn(
            'w-3 h-3 rounded-full bg-white transition-transform',
            tool.enabled ? 'translate-x-4' : 'translate-x-0'
          )}
        />
      </button>
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function MCPOverview() {
  const {
    agents,
    servers,
    tools,
    selectedAgent,
    isInitialized,
    isLoading,
    error,
    initialize,
    refresh,
    selectAgent,
    toggleTool,
    getToolsForAgent,
  } = useMCPOverviewStore();

  const [activeTab, setActiveTab] = useState<'spec' | 'build'>('spec');

  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
  }, [isInitialized, initialize]);

  const specAgents = agents.filter((a) => a.category === 'spec-creation');
  const buildAgents = agents.filter((a) => a.category === 'build');
  const displayedAgents = activeTab === 'spec' ? specAgents : buildAgents;

  // Group tools by category
  const toolsByCategory = tools.reduce((acc, tool) => {
    if (!acc[tool.category]) acc[tool.category] = [];
    acc[tool.category].push(tool);
    return acc;
  }, {} as Record<ToolCategory, MCPTool[]>);

  const selectedAgentData = agents.find((a) => a.id === selectedAgent);
  const selectedAgentTools = selectedAgent ? getToolsForAgent(selectedAgent) : [];

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-8 text-center">
        <AlertTriangle className="w-12 h-12 text-red-400 mb-4" />
        <h2 className="text-xl font-semibold text-white mb-2">Failed to Load MCP</h2>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={refresh} variant="outline">
          <RefreshCw className="w-4 h-4 mr-2" />
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-primary/10 flex items-center justify-center">
            <Users className="w-5 h-5 text-primary" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-white">MCP Overview</h1>
            <p className="text-xs text-muted-foreground">
              {agents.length} agents • {servers.filter(s => s.status === 'connected').length}/{servers.length} servers connected
            </p>
          </div>
        </div>
        <Button
          onClick={refresh}
          variant="outline"
          size="sm"
          disabled={isLoading}
          className="border-border"
        >
          <RefreshCw className={cn('w-4 h-4 mr-2', isLoading && 'animate-spin')} />
          Refresh
        </Button>
      </div>

      {/* Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left: Agents */}
        <div className="w-1/2 border-r border-border flex flex-col overflow-hidden">
          {/* Agent tabs */}
          <div className="flex items-center gap-1 px-4 py-3 border-b border-border">
            <button
              onClick={() => setActiveTab('spec')}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                activeTab === 'spec'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-white hover:bg-secondary'
              )}
            >
              <Brain className="w-4 h-4 inline mr-2" />
              Spec Creation ({specAgents.length})
            </button>
            <button
              onClick={() => setActiveTab('build')}
              className={cn(
                'px-4 py-2 text-sm font-medium rounded-lg transition-colors',
                activeTab === 'build'
                  ? 'bg-primary/10 text-primary'
                  : 'text-muted-foreground hover:text-white hover:bg-secondary'
              )}
            >
              <Code className="w-4 h-4 inline mr-2" />
              Build ({buildAgents.length})
            </button>
          </div>

          {/* Agent list */}
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {isLoading && !isInitialized ? (
              <div className="flex items-center justify-center h-full">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
              </div>
            ) : (
              displayedAgents.map((agent) => (
                <AgentCard
                  key={agent.id}
                  agent={agent}
                  isSelected={selectedAgent === agent.id}
                  onClick={() => selectAgent(selectedAgent === agent.id ? null : agent.id)}
                />
              ))
            )}
          </div>
        </div>

        {/* Right: Servers & Tools */}
        <div className="w-1/2 flex flex-col overflow-hidden">
          {/* Servers section */}
          <div className="p-4 border-b border-border">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Server className="w-4 h-4" />
              MCP Servers
            </h3>
            <div className="space-y-2">
              {servers.map((server) => (
                <ServerCard key={server.id} server={server} onClick={() => {}} />
              ))}
            </div>
          </div>

          {/* Tools section */}
          <div className="flex-1 overflow-y-auto p-4">
            <h3 className="text-sm font-medium text-muted-foreground mb-3 flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              {selectedAgentData ? `Tools for ${selectedAgentData.name}` : 'Available Tools'}
            </h3>
            
            {selectedAgent ? (
              // Show tools for selected agent
              <div className="space-y-2">
                {selectedAgentTools.length > 0 ? (
                  selectedAgentTools.map((tool) => (
                    <ToolCard
                      key={tool.name}
                      tool={tool}
                      onToggle={() => toggleTool(tool.name)}
                    />
                  ))
                ) : (
                  <p className="text-sm text-muted-foreground text-center py-8">
                    No MCP tools assigned to this agent
                  </p>
                )}
              </div>
            ) : (
              // Show all tools grouped by category
              <div className="space-y-4">
                {Object.entries(toolsByCategory).map(([category, categoryTools]) => (
                  <div key={category}>
                    <h4 className="text-xs text-muted-foreground uppercase tracking-wider mb-2 flex items-center gap-2">
                      <ToolCategoryIcon category={category as ToolCategory} />
                      {category}
                    </h4>
                    <div className="space-y-2">
                      {categoryTools.map((tool) => (
                        <ToolCard
                          key={tool.name}
                          tool={tool}
                          onToggle={() => toggleTool(tool.name)}
                        />
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
