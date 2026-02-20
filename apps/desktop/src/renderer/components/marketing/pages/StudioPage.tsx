import { useState, useEffect } from 'react';
import { MonitorPlay, RefreshCw, ExternalLink, Square, Loader2 } from 'lucide-react';

type StudioStatus = 'booting' | 'running' | 'error' | 'stopped';

function StatusBadge({ status }: { status: StudioStatus }) {
  const configs: Record<StudioStatus, { label: string; dot: string; text: string }> = {
    booting: { label: 'Booting…', dot: 'bg-amber-400 animate-pulse', text: 'text-amber-400' },
    running: { label: 'Running',  dot: 'bg-green-400',              text: 'text-green-400' },
    error:   { label: 'Error',    dot: 'bg-red-500',                text: 'text-red-400'   },
    stopped: { label: 'Stopped',  dot: 'bg-zinc-600',               text: 'text-zinc-500'  },
  };
  const { label, dot, text } = configs[status];
  return (
    <span className={`flex items-center gap-1.5 text-xs font-medium ${text}`}>
      <span className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${dot}`} />
      {label}
    </span>
  );
}

export function StudioPage() {
  const [template, setTemplate] = useState('product-demo');
  const [status, setStatus] = useState<StudioStatus>('booting');
  const [error, setError] = useState('');
  const [iframeKey, setIframeKey] = useState(0);

  async function startStudio(tmpl: string) {
    setStatus('booting');
    setError('');
    try {
      const res = await window.electronAPI.marketing.studioServer('start', tmpl);
      if (res.ok) {
        setStatus('running');
      } else {
        setStatus('error');
        setError(res.error ?? 'Failed to start Remotion Studio');
      }
    } catch (err) {
      setStatus('error');
      setError(String(err));
    }
  }

  async function killServer() {
    await window.electronAPI.marketing.studioServer('stop');
    setStatus('stopped');
  }

  // Auto-boot on mount and restart when template changes
  useEffect(() => {
    startStudio(template);
    return () => {
      // Stop on unmount (tab closed / navigated away)
      window.electronAPI.marketing.studioServer('stop');
    };
  }, [template]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Toolbar */}
      <div className="flex items-center gap-3 px-4 py-2.5 border-b border-zinc-800 flex-shrink-0">
        <MonitorPlay className="w-4 h-4 text-amber-500 flex-shrink-0" />
        <span className="text-sm font-medium text-zinc-200">Remotion Studio</span>

        <select
          value={template}
          onChange={(e) => setTemplate(e.target.value)}
          className="ml-1 bg-zinc-800 border border-zinc-700 rounded px-2 py-1 text-xs text-zinc-200 focus:outline-none focus:border-amber-500"
        >
          <option value="product-demo">Product Demo</option>
          <option value="sprint-review">Sprint Review</option>
        </select>

        <StatusBadge status={status} />

        <div className="flex items-center gap-1 ml-auto">
          {status === 'running' && (
            <>
              <button
                onClick={() => setIframeKey((k) => k + 1)}
                title="Refresh Studio"
                className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                <RefreshCw className="w-3.5 h-3.5" />
              </button>
              <button
                onClick={() => window.electronAPI.shell.openExternal('http://localhost:3000')}
                title="Open in browser"
                className="p-1.5 rounded text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700 transition-colors"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </>
          )}
          {(status === 'running' || status === 'booting') && (
            <button
              onClick={killServer}
              title="Stop Studio server"
              className="flex items-center gap-1.5 px-2 py-1 rounded text-xs text-zinc-400 hover:text-red-400 hover:bg-zinc-700 transition-colors"
            >
              <Square className="w-3 h-3" />
              Stop
            </button>
          )}
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden">
        {status === 'booting' && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-400">
            <Loader2 className="w-8 h-8 animate-spin text-amber-500" />
            <p className="text-sm">Starting Remotion Studio…</p>
          </div>
        )}

        {status === 'running' && (
          <iframe
            key={iframeKey}
            src="http://localhost:3000"
            className="w-full h-full border-none"
            title="Remotion Studio"
            sandbox="allow-same-origin allow-scripts allow-forms allow-modals allow-downloads"
          />
        )}

        {status === 'error' && (
          <div className="flex flex-col items-center justify-center h-full gap-3 p-8 text-center">
            <div className="w-10 h-10 rounded-full bg-red-500/10 flex items-center justify-center">
              <MonitorPlay className="w-5 h-5 text-red-400" />
            </div>
            <p className="text-sm font-medium text-zinc-200">Failed to start Remotion Studio</p>
            <p className="text-xs text-zinc-500 max-w-sm break-words">{error}</p>
            <button
              onClick={() => startStudio(template)}
              className="mt-2 px-3 py-1.5 rounded bg-amber-500 hover:bg-amber-400 text-black text-xs font-medium transition-colors"
            >
              Retry
            </button>
          </div>
        )}

        {status === 'stopped' && (
          <div className="flex flex-col items-center justify-center h-full gap-3 text-zinc-500">
            <MonitorPlay className="w-8 h-8 text-zinc-600" />
            <p className="text-sm">Studio stopped.</p>
            <button
              onClick={() => startStudio(template)}
              className="px-3 py-1.5 rounded bg-zinc-700 hover:bg-zinc-600 text-zinc-200 text-xs font-medium transition-colors"
            >
              Start Studio
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
