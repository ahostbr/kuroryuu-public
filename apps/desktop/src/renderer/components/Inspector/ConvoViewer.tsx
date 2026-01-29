import { useEffect, useState } from 'react';
import { User, Bot, RefreshCw } from 'lucide-react';

interface ConvoMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface ConvoData {
  task_id: string;
  thread_id: string;
  timestamp: string;
  messages: ConvoMessage[];
}

interface ConvoViewerProps {
  projectRoot: string;
  taskId?: string;
}

export function ConvoViewer({ projectRoot, taskId }: ConvoViewerProps) {
  const [convos, setConvos] = useState<ConvoData[]>([]);
  const [selectedConvo, setSelectedConvo] = useState<ConvoData | null>(null);
  const [loading, setLoading] = useState(false);
  
  const loadConvos = async () => {
    if (!taskId) {
      setConvos([]);
      setSelectedConvo(null);
      return;
    }
    
    setLoading(true);
    
    try {
      const convoDir = `${projectRoot}/WORKING/convos`;
      const threads = await window.electronAPI.fs.readDir(convoDir);
      
      const loadedConvos: ConvoData[] = [];
      
      for (const thread of threads) {
        const threadPath = `${convoDir}/${thread.replace('/', '')}`;
        try {
          const files = await window.electronAPI.fs.readDir(threadPath);
          for (const file of files) {
            if (file.endsWith('.json')) {
              const content = await window.electronAPI.fs.readFile(`${threadPath}/${file}`);
              const data = JSON.parse(content);
              if (data.task_id === taskId) {
                loadedConvos.push(data);
              }
            }
          }
        } catch {
          // Skip if can't read
        }
      }
      
      // Sort by timestamp descending
      loadedConvos.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
      
      setConvos(loadedConvos);
      if (loadedConvos.length > 0) {
        setSelectedConvo(loadedConvos[0]);
      }
    } catch {
      setConvos([]);
    }
    
    setLoading(false);
  };
  
  useEffect(() => {
    loadConvos();
  }, [projectRoot, taskId]);
  
  if (!taskId) {
    return (
      <div className="text-center text-muted-foreground text-sm py-8">
        Select a task to view conversations
      </div>
    );
  }
  
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <RefreshCw className="w-4 h-4 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  if (convos.length === 0) {
    return (
      <div className="text-center text-muted-foreground text-sm py-8">
        No conversations found for {taskId}
      </div>
    );
  }
  
  return (
    <div className="space-y-3">
      {/* Convo selector */}
      {convos.length > 1 && (
        <select
          value={selectedConvo?.timestamp || ''}
          onChange={(e) => {
            const c = convos.find(c => c.timestamp === e.target.value);
            setSelectedConvo(c || null);
          }}
          className="w-full bg-secondary border border-border rounded px-2 py-1 text-xs text-foreground"
        >
          {convos.map((c) => (
            <option key={c.timestamp} value={c.timestamp}>
              {c.thread_id} — {c.timestamp}
            </option>
          ))}
        </select>
      )}
      
      {/* Messages */}
      {selectedConvo && (
        <div className="space-y-2">
          {selectedConvo.messages
            .filter(m => m.role !== 'system')
            .map((msg, i) => (
              <div
                key={i}
                className={`p-2 rounded text-sm ${
                  msg.role === 'user' 
                    ? 'bg-secondary border-l-2 border-primary' 
                    : 'bg-secondary/50'
                }`}
              >
                <div className="flex items-center gap-1.5 mb-1 text-xs text-muted-foreground">
                  {msg.role === 'user' ? (
                    <User className="w-3 h-3" />
                  ) : (
                    <Bot className="w-3 h-3" />
                  )}
                  {msg.role}
                </div>
                <div className="text-foreground whitespace-pre-wrap text-xs leading-relaxed">
                  {msg.content.length > 500 
                    ? msg.content.slice(0, 500) + '...' 
                    : msg.content}
                </div>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
