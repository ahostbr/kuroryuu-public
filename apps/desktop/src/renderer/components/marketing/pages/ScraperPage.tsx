import { useState } from 'react';
import { Globe, Loader2 } from 'lucide-react';
import { useMarketingStore } from '../../../stores/marketing-store';

export function ScraperPage() {
  const [url, setUrl] = useState('');
  const [mode, setMode] = useState<'markdown' | 'screenshot' | 'extract'>('markdown');

  const runScrape = useMarketingStore((s) => s.runScrape);
  const lastScrape = useMarketingStore((s) => s.lastScrape);
  const scrapeLoading = useMarketingStore((s) => s.scrapeLoading);
  const filteredJobs = useMarketingStore((s) => s.activeJobs).filter((j) => j.type === 'scrape');

  const handleSubmit = () => {
    if (url.trim()) {
      runScrape(url, mode);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header */}
      <div className="px-6 py-4 border-b border-zinc-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Globe className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Web Scraper</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Extract content from any webpage</p>
          </div>
        </div>
      </div>

      {/* Scrollable content */}
      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        {/* Form card */}
        <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">URL</label>
            <input
              type="text"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://example.com"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Mode</label>
            <select
              value={mode}
              onChange={(e) => setMode(e.target.value as 'markdown' | 'screenshot' | 'extract')}
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
            >
              <option value="markdown">Markdown</option>
              <option value="screenshot">Screenshot</option>
              <option value="extract">Extract</option>
            </select>
          </div>

          <button
            onClick={handleSubmit}
            disabled={scrapeLoading || !url.trim()}
            className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {scrapeLoading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Scraping...
              </>
            ) : (
              <>
                <Globe className="w-4 h-4" />
                Scrape
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
        {lastScrape && (
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-5">
            <div className="flex items-center justify-between mb-3">
              <span className="text-xs font-medium text-zinc-400">{lastScrape.title}</span>
              <div className="flex items-center gap-3 text-xs text-zinc-500">
                <span>{lastScrape.word_count} words</span>
                <span>{lastScrape.mode} mode</span>
              </div>
            </div>
            <div className="text-sm text-zinc-300 whitespace-pre-wrap">{lastScrape.content}</div>
          </div>
        )}
      </div>
    </div>
  );
}
