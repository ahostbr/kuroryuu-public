import { useState, useEffect } from 'react';
import { Activity, Cpu, HardDrive, Zap, Users, Clock } from 'lucide-react';
import { useSystemMetrics } from '../hooks/useWebSocket';

interface PerformanceMonitorProps {
  className?: string;
  compact?: boolean;
}

export function PerformanceMonitor({ className = '', compact = false }: PerformanceMonitorProps) {
  const { metrics, isConnected } = useSystemMetrics();
  const [animatedMetrics, setAnimatedMetrics] = useState(metrics);

  // Smooth animation for metric changes
  useEffect(() => {
    const interval = setInterval(() => {
      setAnimatedMetrics(prev => ({
        cpu_percent: lerp(prev.cpu_percent, metrics.cpu_percent, 0.1),
        memory_percent: lerp(prev.memory_percent, metrics.memory_percent, 0.1),
        active_agents: metrics.active_agents,
        pending_tasks: metrics.pending_tasks,
        completed_tasks: metrics.completed_tasks,
        avg_response_time: lerp(prev.avg_response_time, metrics.avg_response_time, 0.2)
      }));
    }, 100);

    return () => clearInterval(interval);
  }, [metrics]);

  const lerp = (start: number, end: number, factor: number) => {
    return start + (end - start) * factor;
  };

  const getStatusColor = (value: number, thresholds: [number, number]) => {
    if (value < thresholds[0]) return 'text-green-400';
    if (value < thresholds[1]) return 'text-primary';
    return 'text-red-400';
  };

  const getPerformanceGrade = () => {
    const cpuScore = animatedMetrics.cpu_percent < 50 ? 1 : animatedMetrics.cpu_percent < 80 ? 0.5 : 0;
    const memoryScore = animatedMetrics.memory_percent < 70 ? 1 : animatedMetrics.memory_percent < 90 ? 0.5 : 0;
    const responseScore = animatedMetrics.avg_response_time < 500 ? 1 : animatedMetrics.avg_response_time < 1000 ? 0.5 : 0;
    
    const totalScore = (cpuScore + memoryScore + responseScore) / 3;
    
    if (totalScore >= 0.8) return { grade: 'A', color: 'text-green-400' };
    if (totalScore >= 0.6) return { grade: 'B', color: 'text-primary' };
    return { grade: 'C', color: 'text-red-400' };
  };

  const performance = getPerformanceGrade();

  if (compact) {
    return (
      <div className={`flex items-center gap-3 ${className}`}>
        <div className="flex items-center gap-1">
          <Activity className={`w-3 h-3 ${isConnected ? 'text-green-400' : 'text-red-400'}`} />
          <span className="text-xs text-muted-foreground">
            {isConnected ? 'Live' : 'Offline'}
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          <Cpu className="w-3 h-3 text-muted-foreground" />
          <span className={`text-xs ${getStatusColor(animatedMetrics.cpu_percent, [50, 80])}`}>
            {animatedMetrics.cpu_percent.toFixed(0)}%
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          <HardDrive className="w-3 h-3 text-muted-foreground" />
          <span className={`text-xs ${getStatusColor(animatedMetrics.memory_percent, [70, 90])}`}>
            {animatedMetrics.memory_percent.toFixed(0)}%
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          <Users className="w-3 h-3 text-muted-foreground" />
          <span className="text-xs text-foreground">
            {animatedMetrics.active_agents}
          </span>
        </div>
        
        <div className="flex items-center gap-1">
          <Zap className={`w-3 h-3 ${performance.color}`} />
          <span className={`text-xs font-medium ${performance.color}`}>
            {performance.grade}
          </span>
        </div>
      </div>
    );
  }

  return (
    <div className={`bg-card border border-border rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-4">
        <h3 className="text-sm font-medium text-foreground">System Performance</h3>
        <div className="flex items-center gap-2">
          <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-green-400 animate-pulse-status' : 'bg-red-400'}`} />
          <span className="text-xs text-muted-foreground">
            {isConnected ? 'Real-time' : 'Disconnected'}
          </span>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        {/* CPU Usage */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Cpu className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground">CPU</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-secondary rounded-full h-2 overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${
                  animatedMetrics.cpu_percent < 50 ? 'bg-green-400' :
                  animatedMetrics.cpu_percent < 80 ? 'bg-primary' : 'bg-red-400'
                }`}
                style={{ width: `${Math.min(animatedMetrics.cpu_percent, 100)}%` }}
              />
            </div>
            <span className={`text-sm font-medium ${getStatusColor(animatedMetrics.cpu_percent, [50, 80])}`}>
              {animatedMetrics.cpu_percent.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Memory Usage */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <HardDrive className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground">Memory</span>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex-1 bg-secondary rounded-full h-2 overflow-hidden">
              <div 
                className={`h-full transition-all duration-500 ${
                  animatedMetrics.memory_percent < 70 ? 'bg-green-400' :
                  animatedMetrics.memory_percent < 90 ? 'bg-primary' : 'bg-red-400'
                }`}
                style={{ width: `${Math.min(animatedMetrics.memory_percent, 100)}%` }}
              />
            </div>
            <span className={`text-sm font-medium ${getStatusColor(animatedMetrics.memory_percent, [70, 90])}`}>
              {animatedMetrics.memory_percent.toFixed(1)}%
            </span>
          </div>
        </div>

        {/* Active Agents */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Users className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground">Agents</span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-lg font-semibold text-green-400">
              {animatedMetrics.active_agents}
            </span>
            <span className="text-xs text-muted-foreground">active</span>
          </div>
        </div>

        {/* Response Time */}
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="w-4 h-4 text-muted-foreground" />
            <span className="text-sm text-foreground">Response</span>
          </div>
          <div className="flex items-center justify-between">
            <span className={`text-lg font-semibold ${getStatusColor(animatedMetrics.avg_response_time, [500, 1000])}`}>
              {animatedMetrics.avg_response_time.toFixed(0)}ms
            </span>
            <span className="text-xs text-muted-foreground">avg</span>
          </div>
        </div>
      </div>

      {/* Task Stats */}
      <div className="mt-4 pt-4 border-t border-border">
        <div className="flex items-center justify-between text-sm">
          <div className="flex items-center gap-4">
            <span className="text-muted-foreground">
              Pending: <span className="text-primary font-medium">{animatedMetrics.pending_tasks}</span>
            </span>
            <span className="text-muted-foreground">
              Completed: <span className="text-green-400 font-medium">{animatedMetrics.completed_tasks}</span>
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-muted-foreground">Grade:</span>
            <span className={`font-bold text-lg ${performance.color}`}>
              {performance.grade}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}
