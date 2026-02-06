/**
 * Servers Tab
 *
 * Compact server health monitoring - all servers in one card.
 */
import React, { useEffect } from 'react';
import { Server, RefreshCw } from 'lucide-react';
import { useCommandCenter } from '../../../hooks/useCommandCenter';
import { ServerCard } from '../servers/ServerCard';

// Auto-refresh interval (30 seconds)
const REFRESH_INTERVAL = 30000;

export function ServersTab() {
  const { servers, pingAllServers, pingServer, restartServer } = useCommandCenter();

  // Auto-refresh servers
  useEffect(() => {
    const interval = setInterval(() => {
      pingAllServers();
    }, REFRESH_INTERVAL);

    return () => clearInterval(interval);
  }, [pingAllServers]);

  if (servers.length === 0) {
    return (
      <div className="p-4">
        <div className="flex flex-col items-center justify-center h-40 text-center">
          <Server className="w-10 h-10 text-muted-foreground/30 mb-2" />
          <p className="text-sm text-muted-foreground">No servers configured</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-4">
      <div className="rounded-lg border border-border bg-card">
        {/* Card header with Ping All */}
        <div className="flex items-center justify-between px-3 py-2 border-b border-border">
          <div className="flex items-center gap-2">
            <Server className="w-3.5 h-3.5 text-muted-foreground" />
            <span className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Servers ({servers.length})
            </span>
          </div>
          <button
            onClick={() => pingAllServers()}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-muted-foreground hover:text-foreground hover:bg-secondary/60 transition-colors"
          >
            <RefreshCw className="w-3 h-3" />
            Ping All
          </button>
        </div>

        {/* Server rows */}
        <div className="divide-y divide-border/50">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onPing={() => pingServer(server.id)}
              onRestart={() => restartServer(server.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}

export default ServersTab;
