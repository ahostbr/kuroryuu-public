import { useState, useEffect, useCallback } from 'react';
import { useTaskStore } from '../stores/task-store';
import { Tooltip } from './ui/tooltip';
import {
  Circle,
  Cpu,
  Lock,
  Wifi,
  WifiOff,
  Server,
  Sparkles,
  Play,
  Pause,
  AlertTriangle,
  CheckCircle2,
  Loader2,
  Zap,
  Cloud,
  Terminal
} from 'lucide-react';

type ConnectionState = 'connected' | 'connecting' | 'disconnected' | 'error';
type BackendType = 'lmstudio' | 'cliproxyapi' | 'claude' | 'none';

interface BackendInfo {
  name: string;
  type: BackendType;
  healthy: boolean;
  circuit_open?: boolean;
  url?: string;
}

interface ServiceStatus {
  gateway: ConnectionState;
  lmstudio: ConnectionState;
  orchestration: 'idle' | 'running' | 'paused' | 'error';
  activeBackend: BackendType;
  backends: BackendInfo[];
}

export function StatusBar() {
  const { tasks, locks } = useTaskStore();
  
  const activeCount = tasks.filter(t => t.status === 'active').length;
  const todoCount = tasks.filter(t => t.status === 'backlog').length;
  const doneCount = tasks.filter(t => t.status === 'done').length;
  const lockedCount = locks.length;

  // Service connection status
  const [status, setStatus] = useState<ServiceStatus>({
    gateway: 'connecting',
    lmstudio: 'disconnected',
    orchestration: 'idle',
    activeBackend: 'none',
    backends: []
  });

  // Track previous backend for switch announcements
  const [prevBackend, setPrevBackend] = useState<BackendType>('none');

  // PC Control (Full Desktop Access) armed status
  const [pcControlArmed, setPcControlArmed] = useState(false);

  // Check gateway health
  const checkGateway = useCallback(async () => {
    try {
      const res = await fetch('http://127.0.0.1:8200/v1/health', {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      setStatus(s => ({ ...s, gateway: res.ok ? 'connected' : 'error' }));
    } catch {
      setStatus(s => ({ ...s, gateway: 'disconnected' }));
    }
  }, []);

  // Check LM Studio / CLIProxyAPI health (via Gateway backend API)
  const checkLMStudio = useCallback(async () => {
    try {
      // First try Gateway's backend status API (shows active backend from fallback chain)
      const [currentRes, backendsRes] = await Promise.all([
        fetch('http://127.0.0.1:8200/api/backends/current', {
          method: 'GET',
          signal: AbortSignal.timeout(2000)
        }).catch(() => null),
        fetch('http://127.0.0.1:8200/api/backends', {
          method: 'GET',
          signal: AbortSignal.timeout(2000)
        }).catch(() => null)
      ]);

      let activeBackend: BackendType = 'none';
      let backends: BackendInfo[] = [];
      let isConnected = false;

      // Parse current backend
      if (currentRes?.ok) {
        const data = await currentRes.json();
        if (data.ok && data.backend) {
          activeBackend = data.backend.name as BackendType;
          isConnected = true;
        }
      }

      // Parse all backends
      if (backendsRes?.ok) {
        const data = await backendsRes.json();
        backends = (data.backends || []).map((b: any) => ({
          name: b.name,
          type: b.name as BackendType,
          healthy: b.healthy,
          circuit_open: b.circuit_open,
          url: b.url
        }));
      }

      // If Gateway API failed, try direct checks
      if (!isConnected) {
        // Try LMStudio directly
        try {
          const lmRes = await fetch('http://127.0.0.1:1234/v1/models', {
            method: 'GET',
            signal: AbortSignal.timeout(2000)
          });
          if (lmRes.ok) {
            activeBackend = 'lmstudio';
            isConnected = true;
            backends = [{ name: 'lmstudio', type: 'lmstudio', healthy: true, url: 'http://127.0.0.1:1234' }];
          }
        } catch { /* continue */ }

        // Try CLIProxyAPI as fallback
        if (!isConnected) {
          try {
            const cliproxyRes = await fetch('http://127.0.0.1:8317/v1/models', {
              method: 'GET',
              headers: { 'Authorization': 'Bearer kuroryuu-local-key' },
              signal: AbortSignal.timeout(2000)
            });
            if (cliproxyRes.ok) {
              activeBackend = 'cliproxyapi';
              isConnected = true;
              backends = [{ name: 'cliproxyapi', type: 'cliproxyapi', healthy: true, url: 'http://127.0.0.1:8317' }];
            }
          } catch { /* continue */ }
        }
      }

      setStatus(s => {
        // Detect backend switch
        if (s.activeBackend !== activeBackend && activeBackend !== 'none' && s.activeBackend !== 'none') {
          console.log(`[StatusBar] Backend switched: ${s.activeBackend} → ${activeBackend}`);
        }
        return {
          ...s,
          lmstudio: isConnected ? 'connected' : 'disconnected',
          activeBackend,
          backends
        };
      });
    } catch {
      setStatus(s => ({ ...s, lmstudio: 'disconnected', activeBackend: 'none', backends: [] }));
    }
  }, []);

  // Check orchestration status
  const checkOrchestration = useCallback(async () => {
    try {
      const res = await fetch('http://127.0.0.1:8200/v1/orchestration/recovery/stats', {
        method: 'GET',
        signal: AbortSignal.timeout(2000)
      });
      if (res.ok) {
        const data = await res.json();
        const orchState = data.is_paused ? 'paused' : 
                          data.active_tasks > 0 ? 'running' : 'idle';
        setStatus(s => ({ ...s, orchestration: orchState }));
      }
    } catch {
      // Gateway might be down, don't change orchestration status
    }
  }, []);

  // Check PC Control (WinAppDriver) status
  const checkPcControl = useCallback(async () => {
    try {
      const status = await window.electronAPI?.winappdriver?.status?.();
      if (status) {
        setPcControlArmed(status.armed);
      }
    } catch {
      setPcControlArmed(false);
    }
  }, []);

  // Poll services on mount and interval
  useEffect(() => {
    checkGateway();
    checkLMStudio();
    checkOrchestration();
    checkPcControl();

    const interval = setInterval(() => {
      checkGateway();
      checkLMStudio();
      checkOrchestration();
      checkPcControl();
    }, 10000); // Every 10 seconds

    return () => clearInterval(interval);
  }, [checkGateway, checkLMStudio, checkOrchestration, checkPcControl]);

  // Connection status indicator component
  const ConnectionIndicator = ({ 
    state, 
    label, 
    icon: Icon 
  }: { 
    state: ConnectionState; 
    label: string; 
    icon: React.ComponentType<{ className?: string }>;
  }) => {
    const colors = {
      connected: 'text-green-500',
      connecting: 'text-primary',
      disconnected: 'text-muted-foreground',
      error: 'text-red-500'
    };
    
    const icons = {
      connected: <CheckCircle2 className="w-2.5 h-2.5" />,
      connecting: <Loader2 className="w-2.5 h-2.5 animate-spin" />,
      disconnected: <Circle className="w-2.5 h-2.5" />,
      error: <AlertTriangle className="w-2.5 h-2.5" />
    };

    return (
      <span 
        className={`flex items-center gap-1 ${colors[state]} cursor-default`}
        title={`${label}: ${state}`}
      >
        <Icon className="w-3 h-3" />
        {icons[state]}
      </span>
    );
  };

  // Orchestration status indicator
  const OrchestrationIndicator = () => {
    const colors = {
      idle: 'text-muted-foreground',
      running: 'text-green-500',
      paused: 'text-primary',
      error: 'text-red-500'
    };

    const icons = {
      idle: <Circle className="w-2.5 h-2.5" />,
      running: <Play className="w-2.5 h-2.5 fill-current" />,
      paused: <Pause className="w-2.5 h-2.5" />,
      error: <AlertTriangle className="w-2.5 h-2.5" />
    };

    return (
      <span
        className={`flex items-center gap-1 ${colors[status.orchestration]} cursor-default`}
        title={`Orchestration: ${status.orchestration}`}
      >
        <Cpu className="w-3 h-3" />
        {icons[status.orchestration]}
      </span>
    );
  };

  // Backend status indicator with rich tooltip
  const BackendIndicator = () => {
    const backendConfig: Record<BackendType, {
      color: string;
      bgColor: string;
      borderColor: string;
      glowColor: string;
      icon: React.ReactNode;
      label: string;
      description: string;
    }> = {
      lmstudio: {
        color: 'text-green-400',
        bgColor: 'bg-green-500/10',
        borderColor: 'border-green-500/30',
        glowColor: 'shadow-green-500/20',
        icon: <Sparkles className="w-3 h-3" />,
        label: 'LMStudio',
        description: 'Local LLM (fastest)'
      },
      cliproxyapi: {
        color: 'text-blue-400',
        bgColor: 'bg-blue-500/10',
        borderColor: 'border-blue-500/30',
        glowColor: 'shadow-blue-500/20',
        icon: <Terminal className="w-3 h-3" />,
        label: 'CLIProxy',
        description: 'Claude via CLI'
      },
      claude: {
        color: 'text-yellow-400',
        bgColor: 'bg-yellow-500/10',
        borderColor: 'border-yellow-500/30',
        glowColor: 'shadow-yellow-500/20',
        icon: <Cloud className="w-3 h-3" />,
        label: 'Claude',
        description: 'Direct API'
      },
      none: {
        color: 'text-red-400',
        bgColor: 'bg-red-500/10',
        borderColor: 'border-red-500/30',
        glowColor: 'shadow-red-500/20',
        icon: <WifiOff className="w-3 h-3" />,
        label: 'Offline',
        description: 'No backends available'
      }
    };

    const config = backendConfig[status.activeBackend];

    // Build tooltip content with backend chain status
    const tooltipContent = (
      <div className="space-y-2 min-w-[180px]">
        <div className="font-medium text-foreground border-b border-border pb-1">
          LLM Backends
        </div>
        <div className="space-y-1.5">
          {status.backends.length > 0 ? (
            status.backends.map((backend) => {
              const bc = backendConfig[backend.type] || backendConfig.none;
              const isActive = backend.type === status.activeBackend;
              return (
                <div
                  key={backend.name}
                  className={`flex items-center gap-2 px-1.5 py-0.5 rounded ${
                    isActive ? bc.bgColor : ''
                  }`}
                >
                  <span className={bc.color}>{bc.icon}</span>
                  <span className={isActive ? 'text-foreground font-medium' : 'text-muted-foreground'}>
                    {bc.label}
                  </span>
                  {backend.healthy ? (
                    <CheckCircle2 className="w-3 h-3 text-green-500 ml-auto" />
                  ) : backend.circuit_open ? (
                    <span title="Circuit open">
                      <AlertTriangle className="w-3 h-3 text-yellow-500 ml-auto" />
                    </span>
                  ) : (
                    <Circle className="w-3 h-3 text-red-500 ml-auto" />
                  )}
                  {isActive && (
                    <span className="text-[9px] px-1 py-0.5 rounded bg-primary/20 text-primary">
                      ACTIVE
                    </span>
                  )}
                </div>
              );
            })
          ) : (
            <div className="text-muted-foreground text-xs">
              No backends detected
            </div>
          )}
        </div>
        <div className="text-[10px] text-muted-foreground pt-1 border-t border-border">
          {config.description}
        </div>
      </div>
    );

    return (
      <Tooltip content={tooltipContent} side="top" delay={100}>
        <div
          className={`
            flex items-center gap-1.5 px-2 py-0.5 rounded-full
            border transition-all duration-300 cursor-default
            ${config.bgColor} ${config.borderColor} ${config.color}
            hover:shadow-lg ${config.glowColor}
          `}
        >
          {config.icon}
          <span className="text-[10px] font-medium uppercase tracking-wide">
            {config.label}
          </span>
          {status.activeBackend !== 'none' && (
            <span className="relative flex h-1.5 w-1.5">
              <span className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${config.bgColor.replace('/10', '/40')}`}></span>
              <span className={`relative inline-flex rounded-full h-1.5 w-1.5 ${config.bgColor.replace('/10', '')}`}></span>
            </span>
          )}
        </div>
      </Tooltip>
    );
  };
  
  return (
    <div className="h-7 flex items-center justify-between px-4 bg-card border-t border-border text-xs">
      <div className="flex items-center gap-4">
        {/* PC Control Warning - DANGER */}
        {pcControlArmed && (
          <div className="flex items-center gap-1 px-2 py-0.5 bg-red-500 text-white rounded text-[10px] font-medium animate-pulse">
            <AlertTriangle className="w-3 h-3" />
            <span>PC Control</span>
          </div>
        )}

        {/* Backend indicator - prominent position */}
        <BackendIndicator />

        {/* Service connections */}
        <div className="flex items-center gap-2 pr-3 border-r border-border">
          <ConnectionIndicator state={status.gateway} label="Gateway" icon={Server} />
          <OrchestrationIndicator />
        </div>
        
        {/* Task counts */}
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Circle className="w-2 h-2 fill-muted-foreground" />
          {todoCount} todo
        </span>
        
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Cpu className="w-3 h-3 text-primary" />
          {activeCount} active
        </span>
        
        <span className="flex items-center gap-1.5 text-muted-foreground">
          <Circle className="w-2 h-2 fill-green-500" />
          {doneCount} done
        </span>
        
        {/* Locks */}
        {lockedCount > 0 && (
          <span className="flex items-center gap-1.5 text-primary">
            <Lock className="w-3 h-3" />
            {lockedCount} locked
          </span>
        )}
      </div>
      
      <div className="flex items-center gap-3 text-muted-foreground">
        {/* Quick status summary */}
        {status.gateway === 'connected' && status.activeBackend !== 'none' && (
          <span className="text-green-500/70 flex items-center gap-1">
            <Zap className="w-3 h-3" />
            Ready
          </span>
        )}
        {status.gateway === 'connected' && status.activeBackend === 'none' && (
          <span className="text-yellow-500/70 flex items-center gap-1">
            <AlertTriangle className="w-3 h-3" />
            No LLM
          </span>
        )}
        {status.gateway === 'disconnected' && (
          <span className="text-muted-foreground flex items-center gap-1">
            <WifiOff className="w-3 h-3" />
            Offline
          </span>
        )}
        <span className="text-[10px] opacity-60">v0.1.0</span>
      </div>
    </div>
  );
}
