import { useState, useEffect } from 'react';
import { Database, Send, Search, Save, FolderOpen, Wifi, WifiOff } from 'lucide-react';

function MCPControls(): React.JSX.Element {
  const [isConnected, setIsConnected] = useState(false);
  const [ragQuery, setRagQuery] = useState('');
  const [ragResults, setRagResults] = useState<any[]>([]);
  const [inboxMessage, setInboxMessage] = useState('');
  const [inboxRecipient, setInboxRecipient] = useState('devstral-log');
  const [checkpointName, setCheckpointName] = useState('');
  const [checkpointData, setCheckpointData] = useState('');

  useEffect(() => {
    testConnection();
  }, []);

  const testConnection = async () => {
    try {
      const result = await (window as any).api.mcp.connect();
      setIsConnected(result.success);
      console.log('MCP connection test:', result);
    } catch (error) {
      setIsConnected(false);
      console.error('MCP connection error:', error);
    }
  };

  const performRagQuery = async () => {
    if (!ragQuery.trim()) return;

    try {
      const result = await (window as any).api.mcp.ragQuery(ragQuery);
      
      if (result.success && result.data) {
        setRagResults(result.data.results || []);
      } else {
        alert(`RAG query failed: ${result.error}`);
      }
    } catch (error) {
      alert(`RAG query error: ${error}`);
    }
  };

  const sendInboxMessage = async () => {
    if (!inboxMessage.trim() || !inboxRecipient.trim()) return;

    try {
      const result = await (window as any).api.mcp.sendMessage(inboxRecipient, inboxMessage, 'normal');
      
      if (result.success) {
        setInboxMessage('');
        alert('Message sent successfully');
      } else {
        alert(`Failed to send message: ${result.error}`);
      }
    } catch (error) {
      alert(`Inbox error: ${error}`);
    }
  };

  const saveCheckpoint = async () => {
    if (!checkpointName.trim() || !checkpointData.trim()) return;

    try {
      const data = JSON.parse(checkpointData);
      const result = await (window as any).api.mcp.saveCheckpoint(checkpointName, data);
      
      if (result.success) {
        alert('Checkpoint saved successfully');
      } else {
        alert(`Failed to save checkpoint: ${result.error}`);
      }
    } catch (error) {
      alert(`Checkpoint save error: ${error}`);
    }
  };

  const loadCheckpoint = async () => {
    if (!checkpointName.trim()) return;

    try {
      const result = await (window as any).api.mcp.loadCheckpoint(checkpointName);
      
      if (result.success && result.data) {
        setCheckpointData(JSON.stringify(result.data, null, 2));
      } else {
        alert(`Failed to load checkpoint: ${result.error}`);
      }
    } catch (error) {
      alert(`Checkpoint load error: ${error}`);
    }
  };

  return (
    <div className="max-w-2xl">
      <h2 className="shrine-header">
        <div className="header-icon-shrine">
          <Database />
        </div>
        <span className="header-text">MCP Integration</span>
      </h2>

      {/* Connection Status */}
      <div className="content-card p-5 mb-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {isConnected ? (
              <Wifi className="w-4 h-4" style={{ color: 'var(--status-active)' }} />
            ) : (
              <WifiOff className="w-4 h-4" style={{ color: 'var(--status-error)' }} />
            )}
            <span className="text-sm" style={{ color: 'var(--text-primary)' }}>
              MCP Core: {isConnected ? 'Connected' : 'Disconnected'}
            </span>
          </div>

          <button
            onClick={testConnection}
            className="px-3 py-1.5 text-sm rounded-lg transition-colors"
            style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--gold-muted)' }}
          >
            Test Connection
          </button>
        </div>

        <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>
          Connects to Kuroryuu MCP_CORE at http://127.0.0.1:8100
        </p>
      </div>

      {isConnected && (
        <>
          {/* RAG Query */}
          <div className="content-card p-5 mb-4">
            <h4 className="font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              <Search className="w-4 h-4" style={{ color: 'var(--gold-primary)' }} />
              RAG Search
            </h4>

            <div className="flex gap-2 mb-3">
              <input
                type="text"
                value={ragQuery}
                onChange={(e) => setRagQuery(e.target.value)}
                onKeyPress={(e) => e.key === 'Enter' && performRagQuery()}
                placeholder="Search codebase..."
                className="shrine-input flex-1"
              />
              <button
                onClick={performRagQuery}
                disabled={!ragQuery.trim()}
                className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--gold-primary)', color: 'var(--bg-shrine)' }}
              >
                <Search className="w-4 h-4" />
                Search
              </button>
            </div>

            {ragResults.length > 0 && (
              <div className="max-h-32 overflow-y-auto rounded p-2" style={{ backgroundColor: 'var(--bg-card)' }}>
                {ragResults.map((result, index) => (
                  <div key={index} className="text-xs mb-1 p-2 rounded" style={{ backgroundColor: 'var(--bg-panel)' }}>
                    <div style={{ fontFamily: 'var(--font-mono)', color: 'var(--gold-primary)' }}>{result.file}</div>
                    <div style={{ color: 'var(--text-secondary)' }}>{result.content}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Inbox Messaging */}
          <div className="content-card p-5 mb-4">
            <h4 className="font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              <Send className="w-4 h-4" style={{ color: 'var(--gold-primary)' }} />
              Inbox Messaging
            </h4>

            <div className="space-y-2">
              <input
                type="text"
                value={inboxRecipient}
                onChange={(e) => setInboxRecipient(e.target.value)}
                placeholder="Recipient (e.g., devstral-log)"
                className="shrine-input"
              />

              <div className="flex gap-2">
                <input
                  type="text"
                  value={inboxMessage}
                  onChange={(e) => setInboxMessage(e.target.value)}
                  onKeyPress={(e) => e.key === 'Enter' && sendInboxMessage()}
                  placeholder="Message content..."
                  className="shrine-input flex-1"
                />
                <button
                  onClick={sendInboxMessage}
                  disabled={!inboxMessage.trim() || !inboxRecipient.trim()}
                  className="flex items-center gap-2 px-4 py-2 rounded-lg transition-colors disabled:opacity-50"
                  style={{ backgroundColor: 'var(--status-active)', color: 'white' }}
                >
                  <Send className="w-4 h-4" />
                  Send
                </button>
              </div>
            </div>
          </div>

          {/* Checkpoints */}
          <div className="content-card p-5 mb-4">
            <h4 className="font-medium mb-3 flex items-center gap-2" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>
              <Database className="w-4 h-4" style={{ color: 'var(--gold-primary)' }} />
              Checkpoints
            </h4>

            <div className="space-y-2">
              <input
                type="text"
                value={checkpointName}
                onChange={(e) => setCheckpointName(e.target.value)}
                placeholder="Checkpoint name"
                className="shrine-input"
              />

              <textarea
                value={checkpointData}
                onChange={(e) => setCheckpointData(e.target.value)}
                placeholder="Checkpoint data (JSON)"
                rows={3}
                className="shrine-input resize-y"
              />

              <div className="flex gap-2">
                <button
                  onClick={saveCheckpoint}
                  disabled={!checkpointName.trim() || !checkpointData.trim()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                  style={{ backgroundColor: 'var(--gold-primary)', color: 'var(--bg-shrine)' }}
                >
                  <Save className="w-4 h-4" />
                  Save
                </button>
                <button
                  onClick={loadCheckpoint}
                  disabled={!checkpointName.trim()}
                  className="flex items-center gap-2 px-3 py-2 rounded-lg transition-colors disabled:opacity-50"
                  style={{ backgroundColor: 'var(--gold-muted)', color: 'var(--text-primary)' }}
                >
                  <FolderOpen className="w-4 h-4" />
                  Load
                </button>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export default MCPControls;
