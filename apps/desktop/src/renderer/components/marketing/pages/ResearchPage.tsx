import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';
import { useMarketingStore } from '../../../stores/marketing-store';

export function ResearchPage() {
  const [query, setQuery] = useState('');
  const [mode, setMode] = useState<'quick' | 'deep' | 'reason'>('quick');

  const runResearch = useMarketingStore((s) => s.runResearch);
  const lastResearch = useMarketingStore((s) => s.lastResearch);
  const researchLoading = useMarketingStore((s) => s.researchLoading);
  const filteredJobs = useMarketingStore((s) => s.activeJobs).filter((j) => j.type === 'research');

  const handleSubmit = () => {
    if (query.trim()) {
      runResearch(query, mode);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Search className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Research</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Search the web and synthesize marketing intelligence</p>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Form card */}
        <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Query</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter search query..."
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'quick' | 'deep' | 'reason')}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            >
              <option value="quick">Quick</option>
              <option value="deep">Deep</option>
              <option value="reason">Reason</option>
            </select>
          </div>

          <button
            onClick={handleSubmit}
            disabled={researchLoading || !query.trim()}
            className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {researchLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Researching...
              </>
            ) : (
              <>
                <Search className="w-4 h-4" />
                Research
              </>
            )}
          </button>
        </div>

        {/* Active jobs */}
        {filteredJobs.map((job) => (
          <div key={job.id} className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg border border-amber-500/30">
            <Loader2 className="w-4 h-4 animate-spin text-amber-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="text-sm text-zinc-300">{job.message}</div>
              <div className="h-1.5 bg-zinc-700 rounded mt-1.5">
                <div className="h-full bg-amber-500 rounded transition-all" style={{ width: `${job.progress}%` }} />
              </div>
            </div>
          </div>
        ))}

        {/* Results */}
        {lastResearch && (
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-zinc-400">{lastResearch.citations.length} citations</span>
              <span className="text-xs text-zinc-500">{lastResearch.mode} mode</span>
            </div>
            <div className="text-sm text-zinc-300 whitespace-pre-wrap">{lastResearch.content}</div>
            {lastResearch.citations.length > 0 && (
              <div className="mt-4 pt-3 border-t border-zinc-700 space-y-2">
                <div className="text-xs font-medium text-zinc-400">Sources</div>
                {lastResearch.citations.map((c) => (
                  <div key={c.index} className="text-xs">
                    <span className="text-amber-500">[{c.index}]</span>{' '}
                    <span className="text-zinc-300">{c.title}</span>
                    <div className="text-zinc-500 truncate">{c.url}</div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
