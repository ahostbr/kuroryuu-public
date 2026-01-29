import { useEffect, useState } from 'react';
import { 
  CheckCircle2, 
  Circle, 
  XCircle, 
  RefreshCw,
  FileText,
  Code,
  Search
} from 'lucide-react';

interface SwarmSummary {
  swarm_id: string;
  task_id: string;
  task_title?: string;
  backend: string;
  timestamp: string;
  approved: boolean;
  artifacts: {
    plan?: string;
    changes?: string;
    review?: string;
  };
}

interface SwarmStatusProps {
  projectRoot: string;
  taskId?: string;
}

export function SwarmStatus({ projectRoot, taskId }: SwarmStatusProps) {
  const [swarms, setSwarms] = useState<SwarmSummary[]>([]);
  const [loading, setLoading] = useState(false);
  
  const loadSwarms = async () => {
    setLoading(true);
    
    try {
      const swarmsDir = `${projectRoot}/WORKING/swarms`;
      const dirs = await window.electronAPI.fs.readDir(swarmsDir);
      
      const loadedSwarms: SwarmSummary[] = [];
      
      for (const dir of dirs) {
        if (!dir.endsWith('/')) continue;
        
        const swarmPath = `${swarmsDir}/${dir.replace('/', '')}`;
        try {
          const summaryPath = `${swarmPath}/summary.json`;
          const content = await window.electronAPI.fs.readFile(summaryPath);
          const data = JSON.parse(content) as SwarmSummary;
          
          // Filter by task if specified
          if (!taskId || data.task_id === taskId) {
            loadedSwarms.push(data);
          }
        } catch {
          // Skip incomplete swarms
        }
      }
      
      // Sort by timestamp descending
      loadedSwarms.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      
      setSwarms(loadedSwarms);
    } catch {
      setSwarms([]);
    }
    
    setLoading(false);
  };
  
  useEffect(() => {
    loadSwarms();
  }, [projectRoot, taskId]);
  
  const handleOpenArtifact = async (path?: string) => {
    if (!path) return;
    try {
      await window.electronAPI.shell.openPath(path);
    } catch (err) {
      console.error('Failed to open:', err);
    }
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (swarms.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-sm py-8">
        {taskId 
          ? `No swarm runs found for ${taskId}`
          : 'No swarm runs yet'}
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground">
          {swarms.length} swarm run{swarms.length !== 1 ? 's' : ''}
        </span>
        <button 
          onClick={loadSwarms}
          className="p-1 rounded hover:bg-secondary text-muted-foreground"
        >
          <RefreshCw className="w-3.5 h-3.5" />
        </button>
      </div>
      
      {swarms.map((swarm) => (
        <div 
          key={swarm.swarm_id}
          className="bg-secondary/50 rounded-lg p-3 space-y-3"
        >
          {/* Header */}
          <div className="flex items-start justify-between">
            <div>
              <div className="flex items-center gap-2">
                {swarm.approved ? (
                  <CheckCircle2 className="w-4 h-4 text-green-500" />
                ) : (
                  <XCircle className="w-4 h-4 text-red-500" />
                )}
                <span className="text-sm font-medium text-foreground">
                  {swarm.task_id}
                </span>
              </div>
              <span className="text-xs text-muted-foreground font-mono">
                {swarm.swarm_id}
              </span>
            </div>
            <span className={`text-xs px-2 py-0.5 rounded ${
              swarm.approved 
                ? 'bg-green-500/20 text-green-400' 
                : 'bg-red-500/20 text-red-400'
            }`}>
              {swarm.approved ? 'APPROVED' : 'REJECTED'}
            </span>
          </div>
          
          {/* Pipeline status */}
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs">
              <Circle className="w-3 h-3 text-blue-400 fill-blue-400" />
              <span className="text-muted-foreground">Planner</span>
            </div>
            <div className="flex-1 h-px bg-muted" />
            <div className="flex items-center gap-1 text-xs">
              <Circle className="w-3 h-3 text-purple-400 fill-purple-400" />
              <span className="text-muted-foreground">Coder</span>
            </div>
            <div className="flex-1 h-px bg-muted" />
            <div className="flex items-center gap-1 text-xs">
              <Circle className="w-3 h-3 text-primary fill-yellow-400" />
              <span className="text-muted-foreground">Reviewer</span>
            </div>
          </div>
          
          {/* Artifacts */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => handleOpenArtifact(swarm.artifacts.plan)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-muted rounded hover:bg-muted text-foreground"
              disabled={!swarm.artifacts.plan}
            >
              <FileText className="w-3 h-3" />
              Plan
            </button>
            <button
              onClick={() => handleOpenArtifact(swarm.artifacts.changes)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-muted rounded hover:bg-muted text-foreground"
              disabled={!swarm.artifacts.changes}
            >
              <Code className="w-3 h-3" />
              Changes
            </button>
            <button
              onClick={() => handleOpenArtifact(swarm.artifacts.review)}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-muted rounded hover:bg-muted text-foreground"
              disabled={!swarm.artifacts.review}
            >
              <Search className="w-3 h-3" />
              Review
            </button>
          </div>
          
          {/* Metadata */}
          <div className="flex items-center gap-3 text-xs text-muted-foreground">
            <span>{swarm.backend}</span>
            <span>{new Date(swarm.timestamp).toLocaleString()}</span>
          </div>
        </div>
      ))}
    </div>
  );
}
