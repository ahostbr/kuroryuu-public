import { useEffect, useState } from 'react';
import { File, Folder, ExternalLink, RefreshCw, FileText } from 'lucide-react';

interface EvidenceItem {
  type: 'file' | 'folder' | 'worklog';
  name: string;
  path: string;
  matchReason?: string;
}

interface EvidenceListProps {
  projectRoot: string;
  taskId?: string;
  taskTitle?: string;
}

// Mapping of BUILD numbers to task IDs (based on worklog analysis)
const BUILD_TO_TASK: Record<string, string> = {
  'BUILD17': 'T011', // KanbanBoard
  'BUILD14': 'T002', // Testing/Gateway
  'BUILD15': 'T012', // PTY Daemon
  'BUILD12': 'T001', // Hooks
  'BUILD10': 'T010', // Desktop scaffold
  'BUILD11': 'T010', // Dashboard (part of desktop)
  'BUILD9': 'T010',  // Slash commands (part of desktop)
  'BUILD13': 'T017', // Prime context / Error handling
};

// Feature slug mappings for worklogs without BUILD numbers
const FEATURE_TO_TASK: Record<string, string> = {
  'kanbanboard': 'T011',
  'taskstore': 'T011',
  'terminal': 'T012',
  'pty': 'T012',
  'daemon': 'T012',
  'terminalgrid': 'T018',
  'multiagent': 'T018',
  'oauth': 'T025',
  'github': 'T025',
  'lmstudio': 'T026',
  'nativetools': 'T026',
  'devstral': 'T026',
  'leaderworker': 'T027',
  'leaderfollower': 'T027',
  'injection': 'T027',
  'stdio': 'T028',
  'bridge': 'T028',
  'hooks': 'T001',
  'checkpoint': 'T022',
  'evidence': 'T022',
  'manifest': 'T022',
  'demo': 'T021',
  'deterministic': 'T021',
  'convo': 'T020',
  'isolated': 'T020',
  'locking': 'T019',
  'claim': 'T019',
  'dark': 'T014',
  'theme': 'T014',
  'status': 'T014',
  'modal': 'T015',
  'detail': 'T015',
  'dragdrop': 'T016',
  'movement': 'T016',
  'error': 'T017',
  'fallback': 'T017',
  'recovery': 'T017',
  'agent': 'T013',
  'harness': 'T013',
  'cli': 'T013',
};

// Keywords extracted from task titles for matching
function getTaskKeywords(taskTitle: string): string[] {
  const normalized = taskTitle.toLowerCase();
  const words = normalized
    .replace(/[^a-z0-9\s]/g, ' ')
    .split(/\s+/)
    .filter(w => w.length > 2);
  
  // Add specific feature keywords
  const keywordMap: Record<string, string[]> = {
    'kanban': ['kanban', 'board', 'taskstore'],
    'terminal': ['terminal', 'pty', 'daemon'],
    'desktop': ['desktop', 'electron', 'vite'],
    'drag': ['drag', 'drop', 'movement'],
    'oauth': ['oauth', 'auth', 'github'],
    'hook': ['hook', 'hooks'],
    'agent': ['agent', 'cli', 'harness'],
    'modal': ['modal', 'detail', 'evidence'],
    'theme': ['theme', 'dark', 'status'],
    'error': ['error', 'fallback', 'recovery'],
    'parallel': ['parallel', 'multi', 'terminal', 'grid'],
    'lock': ['lock', 'locking', 'claim'],
    'convo': ['convo', 'log', 'isolated'],
    'demo': ['demo', 'script', 'deterministic'],
    'evidence': ['evidence', 'manifest', 'pack'],
    'lmstudio': ['lmstudio', 'devstral', 'native', 'tool'],
    'voice': ['voice', 'speech', 'tts', 'listen'],
    'wizard': ['wizard', 'setup', 'onboarding'],
    'leader': ['leader', 'worker', 'injection'],
  };
  
  const result = [...words];
  for (const [key, aliases] of Object.entries(keywordMap)) {
    if (normalized.includes(key)) {
      result.push(...aliases);
    }
  }
  
  return [...new Set(result)];
}

export function EvidenceList({ projectRoot, taskId, taskTitle }: EvidenceListProps) {
  const [items, setItems] = useState<EvidenceItem[]>([]);
  const [loading, setLoading] = useState(false);
  
  const loadEvidence = async () => {
    if (!taskId) {
      setItems([]);
      return;
    }
    
    setLoading(true);
    
    const allItems: EvidenceItem[] = [];
    
    // Scan checkpoint directories (worklogs now shown in Logs tab)
    const taskIdLower = taskId.toLowerCase();
    const evidencePaths = [
      `${projectRoot}/WORKING/convos`,
      `${projectRoot}/WORKING/checkpoints`,
      `${projectRoot}/WORKING/swarms`,
      `${projectRoot}/ai/checkpoints`,
    ];
    
    for (const base of evidencePaths) {
      try {
        const entries = await window.electronAPI.fs.readDir(base);
        for (const entry of entries) {
          const name = entry.replace(/\/$/, '');
          const lowerName = name.toLowerCase();
          
          if (lowerName.includes(taskIdLower)) {
            allItems.push({
              type: entry.endsWith('/') ? 'folder' : 'file',
              name,
              path: `${base}/${name}`,
              matchReason: `Contains ${taskId}`
            });
          }
        }
      } catch {
        // Directory may not exist
      }
    }
    
    // Sort: worklogs first, then by name
    allItems.sort((a, b) => {
      if (a.type === 'worklog' && b.type !== 'worklog') return -1;
      if (b.type === 'worklog' && a.type !== 'worklog') return 1;
      return a.name.localeCompare(b.name);
    });
    
    setItems(allItems);
    setLoading(false);
  };
  
  useEffect(() => {
    loadEvidence();
  }, [projectRoot, taskId]);
  
  const handleOpen = async (path: string) => {
    try {
      await window.electronAPI.shell.openPath(path);
    } catch (err) {
      console.error('Failed to open:', err);
    }
  };
  
  if (!taskId) {
    return (
      <div className="text-center text-muted-foreground text-sm py-8">
        Select a task to view evidence
      </div>
    );
  }
  
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between mb-3">
        <span className="text-xs text-muted-foreground">
          {items.length} items
        </span>
        <button 
          onClick={loadEvidence}
          className="p-1 rounded hover:bg-secondary text-muted-foreground"
          disabled={loading}
        >
          <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>
      
      {loading && items.length === 0 && (
        <div className="text-sm text-muted-foreground">Loading...</div>
      )}
      
      {!loading && items.length === 0 && (
        <div className="text-center text-muted-foreground text-sm py-8">
          No evidence found for {taskId}
        </div>
      )}
      
      {items.map((item) => (
        <div
          key={item.path}
          className="flex flex-col gap-1 p-2 rounded hover:bg-secondary cursor-pointer group"
          onClick={() => handleOpen(item.path)}
        >
          <div className="flex items-center gap-2">
            {item.type === 'worklog' ? (
              <FileText className="w-4 h-4 text-emerald-500" />
            ) : item.type === 'folder' ? (
              <Folder className="w-4 h-4 text-primary" />
            ) : (
              <File className="w-4 h-4 text-muted-foreground" />
            )}
            <span className="text-sm flex-1 truncate text-foreground">{item.name}</span>
            <ExternalLink className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
          </div>
          {item.matchReason && (
            <span className="text-xs text-muted-foreground ml-6">{item.matchReason}</span>
          )}
        </div>
      ))}
    </div>
  );
}
