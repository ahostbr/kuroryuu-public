import { useEffect, useState } from 'react';
import { Minus, Square, X, Monitor, Copy } from 'lucide-react';

export function TitleBar() {
  const [maximized, setMaximized] = useState(false);
  const [isSpanned, setIsSpanned] = useState(false);
  const [displayCount, setDisplayCount] = useState(1);
  const [version, setVersion] = useState('');

  useEffect(() => {
    let mounted = true;
    const api = window.electronAPI?.app;
    if (!api) return;

    void api.isMaximized().then((v) => { if (mounted) setMaximized(v); });
    void api.isSpanned().then((v) => { if (mounted) setIsSpanned(v); });
    void api.getDisplayCount().then((v) => { if (mounted) setDisplayCount(v); });
    void api.getVersion().then((v) => { if (mounted) setVersion(v); });

    const unsub1 = api.onMaximizeChange((v) => setMaximized(v));
    const unsub2 = api.onSpanChange((v) => setIsSpanned(v));

    return () => {
      mounted = false;
      unsub1();
      unsub2();
    };
  }, []);

  const api = window.electronAPI?.app;

  return (
    <div
      className="flex items-center h-9 bg-[var(--background)] border-b border-[var(--border)] select-none shrink-0"
      style={{ WebkitAppRegion: 'drag' } as React.CSSProperties}
    >
      {/* Left: Branding */}
      <div
        className="flex items-center gap-2 px-3 h-full shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        <span className="text-[11px] font-semibold text-[var(--foreground)]">Kuroryuu</span>
        {version && (
          <span className="text-[10px] text-[var(--muted-foreground)]">v{version}</span>
        )}
      </div>

      {/* Spacer */}
      <div className="flex-1 min-w-0" />

      {/* Right: Span + Window controls */}
      <div
        className="flex items-center h-full shrink-0"
        style={{ WebkitAppRegion: 'no-drag' } as React.CSSProperties}
      >
        {displayCount > 1 && (
          <>
            <button
              onClick={() => isSpanned ? api?.restoreSpan() : api?.spanAllMonitors()}
              title={isSpanned ? 'Restore from multi-monitor span' : 'Span across all monitors'}
              className={`flex items-center justify-center w-11 h-full transition-colors ${
                isSpanned
                  ? 'text-[var(--primary)]'
                  : 'text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)]'
              }`}
            >
              <Monitor size={14} />
            </button>
            <div className="w-px h-4 bg-[var(--border)] mx-0.5 shrink-0" />
          </>
        )}

        <button
          onClick={() => api?.minimize()}
          className="flex items-center justify-center w-11 h-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          title="Minimize"
        >
          <Minus size={14} />
        </button>
        <button
          onClick={() => api?.maximize()}
          className="flex items-center justify-center w-11 h-full text-[var(--muted-foreground)] hover:text-[var(--foreground)] hover:bg-[var(--muted)] transition-colors"
          title={maximized ? 'Restore' : 'Maximize'}
        >
          {maximized ? <Copy size={13} className="rotate-180" /> : <Square size={13} />}
        </button>
        <button
          onClick={() => api?.closeWindow()}
          className="flex items-center justify-center w-11 h-full text-[var(--muted-foreground)] hover:bg-red-600/80 hover:text-zinc-100 transition-colors"
          title="Close"
        >
          <X size={14} />
        </button>
      </div>
    </div>
  );
}
