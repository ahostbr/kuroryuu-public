/**
 * Server Status
 *
 * Server status dashboard for managing tools and servers.
 * Features real-time WebSocket updates and tool execution.
 */
import React, { useEffect } from 'react';
import * as Tabs from '@radix-ui/react-tabs';
import { Wrench, Server, RefreshCw, Wifi, WifiOff, Network } from 'lucide-react';
import { useCommandCenter } from '../../hooks/useCommandCenter';
import { ToolsTab } from './tabs/ToolsTab';
import { ServersTab } from './tabs/ServersTab';
import { GraphitiCanvas } from '../graphiti/GraphitiCanvas';
import { useGraphitiEnabled } from '../../stores/graphiti-store';

export function CommandCenter() {
  const {
    isConnected,
    connectionState,
    activeTab,
    isInitialized,
    error,
    setActiveTab,
    initialize,
    pingAllServers,
    loadTools,
    connectWebSocket,
  } = useCommandCenter();

  // Check if Graphiti is enabled
  const graphitiEnabled = useGraphitiEnabled();

  // Initialize on mount
  useEffect(() => {
    if (!isInitialized) {
      initialize();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isInitialized]); // initialize is stable from store

  const handleRefresh = async () => {
    await Promise.all([pingAllServers(), loadTools()]);
  };

  const handleReconnect = () => {
    connectWebSocket();
  };

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <h1 className="text-xl font-semibold text-foreground">Server Status</h1>

          {/* Connection Status */}
          <div
            className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-sm ${
              isConnected
                ? 'bg-success/10 text-success'
                : connectionState === 'connecting'
                  ? 'bg-warning/10 text-warning'
                  : 'bg-destructive/10 text-destructive'
            }`}
          >
            {isConnected ? (
              <>
                <Wifi className="w-4 h-4" />
                <span>Connected</span>
              </>
            ) : connectionState === 'connecting' ? (
              <>
                <Wifi className="w-4 h-4 animate-pulse" />
                <span>Connecting...</span>
              </>
            ) : (
              <>
                <WifiOff className="w-4 h-4" />
                <span>Disconnected</span>
                <button
                  onClick={handleReconnect}
                  className="ml-1 underline hover:no-underline"
                >
                  Retry
                </button>
              </>
            )}
          </div>
        </div>

        {/* Refresh Button */}
        <button
          onClick={handleRefresh}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-secondary hover:bg-secondary/80 text-foreground transition-colors"
        >
          <RefreshCw className="w-4 h-4" />
          <span>Refresh</span>
        </button>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="px-6 py-3 bg-destructive/10 border-b border-destructive/20 text-destructive text-sm">
          {error}
        </div>
      )}

      {/* Tabs */}
      <Tabs.Root
        value={activeTab}
        onValueChange={(value) => setActiveTab(value as typeof activeTab)}
        className="flex-1 flex flex-col overflow-hidden"
      >
        <Tabs.List className="flex gap-1 px-6 pt-4 border-b border-border">
          <Tabs.Trigger
            value="tools"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === 'tools'
                ? 'bg-secondary text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            <Wrench className="w-4 h-4" />
            Tools
          </Tabs.Trigger>

          <Tabs.Trigger
            value="servers"
            className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors ${
              activeTab === 'servers'
                ? 'bg-secondary text-foreground border-b-2 border-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
            }`}
          >
            <Server className="w-4 h-4" />
            Servers
          </Tabs.Trigger>

          {/* Graphiti Tab - Only shown when enabled */}
          {graphitiEnabled && (
            <Tabs.Trigger
              value="graphiti"
              className={`flex items-center gap-2 px-4 py-2.5 rounded-t-lg text-sm font-medium transition-colors ${
                activeTab === 'graphiti'
                  ? 'bg-secondary text-foreground border-b-2 border-primary'
                  : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
              }`}
            >
              <Network className="w-4 h-4" />
              Graphiti
            </Tabs.Trigger>
          )}
        </Tabs.List>

        <Tabs.Content value="tools" className="flex-1 overflow-auto">
          <ToolsTab />
        </Tabs.Content>

        <Tabs.Content value="servers" className="flex-1 overflow-auto">
          <ServersTab />
        </Tabs.Content>

        {/* Graphiti Content - Unified observability canvas */}
        {graphitiEnabled && (
          <Tabs.Content value="graphiti" className="flex-1 overflow-hidden">
            <GraphitiCanvas className="w-full h-full" />
          </Tabs.Content>
        )}
      </Tabs.Root>
    </div>
  );
}

export default CommandCenter;
