/**
 * AgentActivityFeed - Right sidebar showing agent status and event log
 * Real-time updates from WebSocket
 */

import { Circle, Zap, CheckCircle2, XCircle, Play, User } from 'lucide-react';
import { type AgentInfo } from '../../hooks/useGatewayWebSocket';
import { OrchestrationEvent } from './types';

interface AgentActivityFeedProps {
  agents: AgentInfo[];
  isConnected: boolean;
  events?: OrchestrationEvent[];
}

export function AgentActivityFeed({ agents, isConnected, events = [] }: AgentActivityFeedProps) {
  // Events now come from parent (OrchestrationPanel) which tracks task changes

  const activeAgents = agents.filter(a => a.status === 'busy' || a.status === 'idle');
  const workingAgents = agents.filter(a => a.status === 'busy');

  return (
    <div className="h-full flex flex-col bg-card/30 border-l border-border">
      {/* Agent Status Section */}
      <div className="border-b border-border/50">
        <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50 flex items-center justify-between">
          <span>Agents ({activeAgents.length})</span>
          {workingAgents.length > 0 && (
            <span className="flex items-center gap-1 text-yellow-400 normal-case">
              <Zap className="w-3 h-3" />
              {workingAgents.length} working
            </span>
          )}
        </div>

        <div className="py-2 max-h-[200px] overflow-auto">
          {activeAgents.length === 0 ? (
            <div className="px-3 py-4 text-center text-xs text-muted-foreground">
              No agents online
            </div>
          ) : (
            activeAgents.map((agent) => (
              <AgentRow key={agent.id} agent={agent} />
            ))
          )}
        </div>
      </div>

      {/* Event Log Section */}
      <div className="flex-1 overflow-auto">
        <div className="px-3 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider border-b border-border/50 sticky top-0 bg-card/50 backdrop-blur-sm">
          Activity
        </div>

        <div className="py-1">
          {events.length === 0 ? (
            <div className="px-3 py-8 text-center text-xs text-muted-foreground">
              <div className="w-8 h-8 mx-auto mb-2 rounded-full bg-muted/20 flex items-center justify-center">
                <Play className="w-4 h-4 opacity-30" />
              </div>
              Events will appear here
            </div>
          ) : (
            events.map((event) => (
              <EventRow key={event.id} event={event} />
            ))
          )}
        </div>
      </div>

      {/* Connection status footer */}
      <div className="px-3 py-2 border-t border-border/50 flex items-center gap-2 text-xs">
        <span className={`w-2 h-2 rounded-full ${
          isConnected ? 'bg-green-400' : 'bg-red-400'
        }`} />
        <span className="text-muted-foreground">
          {isConnected ? 'Connected' : 'Disconnected'}
        </span>
      </div>
    </div>
  );
}

interface AgentRowProps {
  agent: AgentInfo;
}

function AgentRow({ agent }: AgentRowProps) {
  const isBusy = agent.status === 'busy';
  const agentName = agent.id.split('-').slice(0, 2).join('-');

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 hover:bg-muted/30 transition-colors">
      <span className={`w-2 h-2 rounded-full flex-shrink-0 ${
        isBusy ? 'bg-yellow-400 animate-pulse' : 'bg-green-400/50'
      }`} />

      <div className="flex-1 min-w-0">
        <span className={`text-sm truncate ${
          isBusy ? 'text-foreground' : 'text-muted-foreground'
        }`}>
          {agentName}
        </span>
      </div>

      <span className={`text-xs ${
        isBusy ? 'text-yellow-400' : 'text-muted-foreground'
      }`}>
        {isBusy ? 'working' : 'idle'}
      </span>
    </div>
  );
}

interface EventRowProps {
  event: OrchestrationEvent;
}

function EventRow({ event }: EventRowProps) {
  const time = new Date(event.timestamp).toLocaleTimeString([], {
    hour: '2-digit',
    minute: '2-digit',
  });

  const getEventIcon = () => {
    switch (event.type) {
      case 'created':
        return <Play className="w-3 h-3 text-blue-400" />;
      case 'claimed':
        return <User className="w-3 h-3 text-cyan-400" />;
      case 'started':
        return <Zap className="w-3 h-3 text-yellow-400" />;
      case 'completed':
        return <CheckCircle2 className="w-3 h-3 text-green-400" />;
      case 'failed':
        return <XCircle className="w-3 h-3 text-red-400" />;
      default:
        return <Circle className="w-3 h-3 text-muted-foreground" />;
    }
  };

  const getEventText = () => {
    switch (event.type) {
      case 'created':
        return 'Task created';
      case 'claimed':
        return `Claimed by ${event.id || 'agent'}`;
      case 'started':
        return 'Started';
      case 'completed':
        return 'Completed';
      case 'failed':
        return 'Failed';
      default:
        return event.type;
    }
  };

  return (
    <div className="flex items-start gap-2 px-3 py-1.5 hover:bg-muted/30 transition-colors">
      <span className="text-xs text-muted-foreground w-10 flex-shrink-0">
        {time}
      </span>
      {getEventIcon()}
      <div className="flex-1 min-w-0">
        <p className="text-xs text-foreground truncate">{getEventText()}</p>
        <p className="text-xs text-muted-foreground truncate">{event.taskTitle}</p>
      </div>
    </div>
  );
}
