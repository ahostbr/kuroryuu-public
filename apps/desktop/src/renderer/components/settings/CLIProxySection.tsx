/**
 * CLI Proxy Section for IntegrationsDialog
 * Shows status and triggers the setup wizard
 */

import { useState, useEffect } from 'react';
import {
  Server,
  Check,
  AlertCircle,
  Loader2,
  RefreshCw,
  ExternalLink,
  Zap,
} from 'lucide-react';
import { CLIProxyWizard } from './CLIProxyWizard';

type CLIProxyStatus = 'checking' | 'stopped' | 'running' | 'configured';

interface ProviderModels {
  claude: number;
  gemini: number;
  openai: number;
  total: number;
}

export function CLIProxySection() {
  const [status, setStatus] = useState<CLIProxyStatus>('checking');
  const [models, setModels] = useState<ProviderModels>({ claude: 0, gemini: 0, openai: 0, total: 0 });
  const [showWizard, setShowWizard] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  useEffect(() => {
    checkStatus();
  }, []);

  const checkStatus = async () => {
    setIsRefreshing(true);
    try {
      const response = await fetch('http://127.0.0.1:8317/v1/models', {
        headers: { 'Authorization': 'Bearer kuroryuu-local-key' },
        signal: AbortSignal.timeout(3000),
      });

      if (response.ok) {
        const data = await response.json();
        const modelList = data.data || [];

        // Group models by provider
        const grouped: ProviderModels = {
          claude: modelList.filter((m: { id: string }) => m.id.toLowerCase().includes('claude')).length,
          gemini: modelList.filter((m: { id: string }) => m.id.toLowerCase().includes('gemini')).length,
          openai: modelList.filter((m: { id: string }) => /gpt|o1|codex/i.test(m.id)).length,
          total: modelList.length,
        };

        setModels(grouped);
        setStatus(grouped.total > 0 ? 'configured' : 'running');
      } else {
        setStatus('stopped');
        setModels({ claude: 0, gemini: 0, openai: 0, total: 0 });
      }
    } catch {
      setStatus('stopped');
      setModels({ claude: 0, gemini: 0, openai: 0, total: 0 });
    } finally {
      setIsRefreshing(false);
    }
  };

  const handleWizardClose = () => {
    setShowWizard(false);
    checkStatus();
  };

  const getStatusIcon = () => {
    if (status === 'checking' || isRefreshing) {
      return <Loader2 className="w-4 h-4 text-muted-foreground animate-spin" />;
    }
    if (status === 'configured') {
      return <Check className="w-4 h-4 text-green-400" />;
    }
    if (status === 'running') {
      return <Zap className="w-4 h-4 text-yellow-400" />;
    }
    return <AlertCircle className="w-4 h-4 text-red-400" />;
  };

  const getStatusText = () => {
    if (status === 'checking') return 'Checking...';
    if (status === 'configured') {
      const parts: string[] = [];
      if (models.claude > 0) parts.push(`Claude (${models.claude})`);
      if (models.gemini > 0) parts.push(`Gemini (${models.gemini})`);
      if (models.openai > 0) parts.push(`OpenAI (${models.openai})`);
      return parts.length > 0 ? parts.join(' • ') : `${models.total} models available`;
    }
    if (status === 'running') return 'Running - No OAuth configured';
    return 'Not running';
  };

  const getStatusColor = () => {
    if (status === 'configured') return 'text-green-400';
    if (status === 'running') return 'text-yellow-400';
    return 'text-red-400';
  };

  return (
    <>
      <div>
        {/* Header with icon and status */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <div className="p-1.5 bg-blue-500/10 rounded">
              <Server className="w-3.5 h-3.5 text-blue-400" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h3 className="text-sm font-medium text-foreground">CLI Proxy API</h3>
                <button
                  onClick={checkStatus}
                  disabled={isRefreshing}
                  className="p-0.5 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
                  title="Refresh status"
                >
                  <RefreshCw className={`w-2.5 h-2.5 ${isRefreshing ? 'animate-spin' : ''}`} />
                </button>
              </div>
              <p className="text-[10px] text-muted-foreground">Docker • OAuth multi-provider</p>
            </div>
          </div>
        </div>

        {/* Status line */}
        <div className={`text-xs flex items-center gap-1 mb-2 ${getStatusColor()}`}>
          {getStatusIcon()}
          {getStatusText()}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowWizard(true)}
            className="flex items-center gap-1 px-2 py-1 bg-primary text-black rounded hover:bg-primary/80 transition-colors text-xs font-medium"
          >
            {status === 'configured' ? 'Manage' : 'Setup'}
          </button>
          {status === 'configured' && (
            <button
              onClick={() => window.electronAPI?.shell?.openExternal?.('http://127.0.0.1:8317/management.html')}
              className="flex items-center gap-1 px-2 py-1 text-xs text-blue-400 hover:underline"
            >
              Dashboard <ExternalLink className="w-2.5 h-2.5" />
            </button>
          )}
        </div>

        {/* Info hint */}
        {status === 'stopped' && (
          <p className="text-[10px] text-muted-foreground mt-2">
            Claude, GPT, Gemini via OAuth
          </p>
        )}
      </div>

      {/* Wizard Modal */}
      {showWizard && <CLIProxyWizard onClose={handleWizardClose} />}
    </>
  );
}
