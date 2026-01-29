/**
 * GatewayMcpStatus - Compact status indicator for Gateway and MCP
 * Shows connection status and MCP tools count in the terminal top bar
 */
import { useState, useEffect, useCallback } from 'react';
import { Wrench, Wifi, WifiOff } from 'lucide-react';

type ConnectionState = 'connected' | 'checking' | 'disconnected' | 'error';

interface StatusState {
  gateway: ConnectionState;
  mcpToolsCount: number;
}

interface GatewayMcpStatusProps {
  showLabel?: boolean;
}

export function GatewayMcpStatus({ showLabel = false }: GatewayMcpStatusProps) {
  const [status, setStatus] = useState<StatusState>({
    gateway: 'checking',
    mcpToolsCount: 0,
  });

  const checkStatus = useCallback(async () => {
    try {
      // Check gateway health first
      const gwResult = await window.electronAPI?.gateway?.health?.();

      if (gwResult?.ok) {
        // Gateway is up, now get MCP tools count
        const mcpResult = await window.electronAPI?.mcp?.tools?.();
        const toolsCount = mcpResult?.tools?.length ?? 0;

        setStatus({
          gateway: 'connected',
          mcpToolsCount: toolsCount,
        });
      } else {
        setStatus({ gateway: 'error', mcpToolsCount: 0 });
      }
    } catch {
      setStatus({ gateway: 'disconnected', mcpToolsCount: 0 });
    }
  }, []);

  // Poll on mount and every 10 seconds
  useEffect(() => {
    checkStatus();
    const interval = setInterval(checkStatus, 10000);
    return () => clearInterval(interval);
  }, [checkStatus]);

  const isConnected = status.gateway === 'connected';
  const isChecking = status.gateway === 'checking';
  const isError = status.gateway === 'error' || status.gateway === 'disconnected';

  // Match old style: green for connected, red for error, gray/pulsing for checking
  const getStatusColor = () => {
    if (isConnected) return 'text-green-400';
    if (isError) return 'text-red-400';
    return 'text-gray-400';
  };

  const getStatusText = () => {
    if (isConnected) return `Gateway: Online | MCP: ${status.mcpToolsCount} tools`;
    if (isChecking) return 'Gateway: Checking...';
    return 'Gateway: Offline - click to retry';
  };

  return (
    <div
      className="flex items-center gap-1.5 cursor-pointer"
      onClick={checkStatus}
      title={getStatusText()}
    >
      {/* Gateway wifi icon - green/red like before */}
      <span className={`flex items-center gap-1 ${getStatusColor()} ${isChecking ? 'animate-pulse' : ''}`}>
        {isConnected ? (
          <Wifi className="w-3.5 h-3.5" />
        ) : (
          <WifiOff className="w-3.5 h-3.5" />
        )}
        {showLabel && <span className="text-[10px]">GW</span>}
      </span>

      {/* MCP tools count - show when connected */}
      {isConnected && (
        <>
          <span className="w-px h-3 bg-muted-foreground/30" />
          <span className="flex items-center gap-1 text-primary">
            <Wrench className="w-3 h-3" />
            <span className="text-[10px] font-medium">{status.mcpToolsCount}</span>
          </span>
        </>
      )}
    </div>
  );
}

export default GatewayMcpStatus;
