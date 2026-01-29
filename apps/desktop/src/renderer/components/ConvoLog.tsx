import { useConvoStore, type ConvoMessage } from '../stores/convo-store';
import { User, Bot, Settings, Download, Trash2 } from 'lucide-react';
import { useKuroryuuDialog } from '../hooks/useKuroryuuDialog';

interface ConvoLogProps {
  terminalId: string;
}

function MessageBubble({ message }: { message: ConvoMessage }) {
  const isUser = message.role === 'user';
  const isSystem = message.role === 'system';
  
  return (
    <div className={`flex gap-2 ${isUser ? 'flex-row-reverse' : ''}`}>
      <div className={`flex-shrink-0 w-6 h-6 rounded-full flex items-center justify-center
                      ${isUser ? 'bg-primary/20 text-primary' : 
                        isSystem ? 'bg-muted text-muted-foreground' : 
                        'bg-secondary text-foreground'}`}>
        {isUser ? <User className="w-3.5 h-3.5" /> : 
         isSystem ? <Settings className="w-3.5 h-3.5" /> :
         <Bot className="w-3.5 h-3.5" />}
      </div>
      <div className={`flex-1 max-w-[85%] ${isUser ? 'text-right' : ''}`}>
        <div className={`inline-block px-3 py-2 rounded-lg text-sm
                        ${isUser ? 'bg-primary/10 text-yellow-100' : 
                          isSystem ? 'bg-secondary/50 text-muted-foreground italic' :
                          'bg-secondary text-foreground'}`}>
          <pre className="whitespace-pre-wrap font-sans">{message.content}</pre>
        </div>
        <div className="text-[10px] text-muted-foreground mt-0.5">
          {new Date(message.timestamp).toLocaleTimeString()}
        </div>
      </div>
    </div>
  );
}

export function ConvoLog({ terminalId }: ConvoLogProps) {
  const { getThreadByTerminal, clearThread, exportThread, createThread } = useConvoStore();
  const { confirm } = useKuroryuuDialog();
  
  let thread = getThreadByTerminal(terminalId);
  
  // Auto-create thread if it doesn't exist
  if (!thread) {
    const threadId = createThread(terminalId);
    thread = useConvoStore.getState().threads.get(threadId);
  }
  
  if (!thread) return null;
  
  const handleExport = () => {
    const content = exportThread(thread!.id);
    const blob = new Blob([content], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `convo-${thread!.terminalId}-${Date.now()}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };
  
  const handleClear = async () => {
    const yes = await confirm({
      title: 'Clear Conversation',
      message: 'Clear conversation history? This cannot be undone.',
    });
    if (yes) {
      clearThread(thread!.id);
    }
  };
  
  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-2 border-b border-border">
        <span className="text-xs font-medium text-muted-foreground">
          Conversation ({thread.messages.length} messages)
        </span>
        <div className="flex items-center gap-1">
          <button
            onClick={handleExport}
            className="p-1 text-muted-foreground hover:text-foreground rounded hover:bg-secondary"
            title="Export conversation"
          >
            <Download className="w-3.5 h-3.5" />
          </button>
          <button
            onClick={handleClear}
            className="p-1 text-muted-foreground hover:text-red-400 rounded hover:bg-secondary"
            title="Clear conversation"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>
      
      {/* Messages */}
      <div className="flex-1 overflow-auto p-3 space-y-3">
        {thread.messages.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm py-8">
            No messages yet
          </div>
        ) : (
          thread.messages.map(msg => (
            <MessageBubble key={msg.id} message={msg} />
          ))
        )}
      </div>
    </div>
  );
}
