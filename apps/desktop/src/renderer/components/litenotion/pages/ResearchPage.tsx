import { useState } from 'react';
import { Search, Loader2 } from 'lucide-react';

export function ResearchPage() {
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<string | null>(null);

  const handleSubmit = async () => {
    if (!query.trim()) return;
    setLoading(true);
    try {
      const res = await fetch('http://127.0.0.1:8200/v1/marketing/research', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ query, mode: 'quick' }),
      });
      if (!res.ok) throw new Error(`Research failed: ${res.status}`);
      const data = await res.json();
      setResults(data.content || JSON.stringify(data, null, 2));
    } catch (e) {
      setResults(`Error: ${e}`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="h-full flex flex-col overflow-hidden">
      <div className="px-6 py-4 border-b border-zinc-700 flex-shrink-0">
        <div className="flex items-center gap-3">
          <Search className="w-5 h-5 text-amber-500" />
          <div>
            <h2 className="text-lg font-semibold text-zinc-100">Research</h2>
            <p className="text-xs text-zinc-400 mt-0.5">Search and synthesize information</p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-6 space-y-4">
        <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-5 space-y-4">
          <div>
            <label className="block text-xs font-medium text-zinc-400 mb-1.5">Query</label>
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="What do you want to research?"
              className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            />
          </div>

          <button
            onClick={handleSubmit}
            disabled={loading || !query.trim()}
            className="w-full px-4 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded-lg text-sm font-medium transition-colors flex items-center justify-center gap-2"
          >
            {loading ? (
              <><Loader2 className="w-4 h-4 animate-spin" /> Researching...</>
            ) : (
              <><Search className="w-4 h-4" /> Research</>
            )}
          </button>
        </div>

        {results && (
          <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-5">
            <div className="text-sm text-zinc-300 whitespace-pre-wrap">{results}</div>
          </div>
        )}
      </div>
    </div>
  );
}
