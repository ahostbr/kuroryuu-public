import { useState, useCallback } from 'react';
import { Globe, ArrowLeft, ArrowRight, RotateCw, ExternalLink } from 'lucide-react';
import { useLiteNotionStore } from '../../../stores/litenotion-store';

export function BrowserPage() {
  const browserUrl = useLiteNotionStore((s) => s.browserUrl);
  const setBrowserUrl = useLiteNotionStore((s) => s.setBrowserUrl);
  const pushBrowserHistory = useLiteNotionStore((s) => s.pushBrowserHistory);
  const [inputUrl, setInputUrl] = useState(browserUrl);
  const [key, setKey] = useState(0);

  const navigate = useCallback((url: string) => {
    let normalizedUrl = url.trim();
    if (normalizedUrl && !normalizedUrl.startsWith('http://') && !normalizedUrl.startsWith('https://')) {
      normalizedUrl = 'https://' + normalizedUrl;
    }
    if (normalizedUrl) {
      pushBrowserHistory(browserUrl);
      setBrowserUrl(normalizedUrl);
      setInputUrl(normalizedUrl);
    }
  }, [browserUrl, setBrowserUrl, pushBrowserHistory]);

  const handleRefresh = () => setKey((k) => k + 1);

  const handleOpenExternal = () => {
    window.electronAPI?.shell?.openExternal?.(browserUrl);
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Nav bar */}
      <div className="px-3 py-2 border-b border-zinc-700 flex items-center gap-2 bg-zinc-800 flex-shrink-0">
        <button
          onClick={() => window.history.back()}
          className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
          title="Back"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>
        <button
          onClick={() => window.history.forward()}
          className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
          title="Forward"
        >
          <ArrowRight className="w-4 h-4" />
        </button>
        <button
          onClick={handleRefresh}
          className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
          title="Refresh"
        >
          <RotateCw className="w-4 h-4" />
        </button>

        <div className="flex-1 flex items-center gap-2">
          <Globe className="w-4 h-4 text-zinc-500 flex-shrink-0" />
          <input
            type="text"
            value={inputUrl}
            onChange={(e) => setInputUrl(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && navigate(inputUrl)}
            placeholder="Enter URL..."
            className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-3 py-1.5 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          />
        </div>

        <button
          onClick={handleOpenExternal}
          className="p-1.5 rounded text-zinc-400 hover:text-zinc-100 hover:bg-zinc-700 transition-colors"
          title="Open in external browser"
        >
          <ExternalLink className="w-4 h-4" />
        </button>
      </div>

      {/* Content area — shows placeholder since webview requires Electron webview tag */}
      <div className="flex-1 flex items-center justify-center bg-zinc-900 text-zinc-500">
        <div className="text-center space-y-3">
          <Globe className="w-12 h-12 mx-auto text-zinc-600" />
          <div>
            <p className="text-sm font-medium text-zinc-400">Browser Preview</p>
            <p className="text-xs text-zinc-500 mt-1">
              Navigate to: <span className="text-amber-500/80 font-mono">{browserUrl}</span>
            </p>
            <button
              onClick={handleOpenExternal}
              className="mt-3 px-4 py-2 bg-zinc-800 hover:bg-zinc-700 border border-zinc-700 rounded text-sm text-zinc-300 transition-colors"
            >
              Open in External Browser
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
