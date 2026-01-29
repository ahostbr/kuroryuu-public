/**
 * Servers Tab
 *
 * Server health monitoring for MCP Core and Gateway.
 */
import React, { useEffect } from 'react';
import { Server, RefreshCw } from 'lucide-react';
import { useCommandCenter } from '../../../hooks/useCommandCenter';
import { ServerCard } from '../servers/ServerCard';
import type { ServerHealth } from '../../../types/command-center';

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

  return (
    <div className="p-6">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Server Health</h2>
          <p className="text-sm text-muted-foreground">
            Monitor and manage backend services
          </p>
        </div>

        <button
          onClick={() => pingAllServers()}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          Ping All
        </button>
      </div>

      {/* Server Grid */}
      {servers.length === 0 ? (
        <div className="flex flex-col items-center justify-center h-64 text-center">
          <Server className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <h3 className="text-lg font-medium text-foreground mb-2">No Servers Configured</h3>
          <p className="text-sm text-muted-foreground">
            Server configuration is managed in the settings.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {servers.map((server) => (
            <ServerCard
              key={server.id}
              server={server}
              onPing={() => pingServer(server.id)}
              onRestart={() => restartServer(server.id)}
            />
          ))}
        </div>
      )}

      {/* Legend */}
      <div className="mt-8 p-4 bg-secondary/30 rounded-lg">
        <h3 className="text-sm font-medium text-foreground mb-3">Status Legend</h3>
        <div className="flex flex-wrap gap-4 text-sm">
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-success" />
            <span className="text-muted-foreground">Connected</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-warning animate-pulse" />
            <span className="text-muted-foreground">Connecting</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-muted" />
            <span className="text-muted-foreground">Disconnected</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-destructive" />
            <span className="text-muted-foreground">Error</span>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ServersTab;
