import { useEffect, useState } from 'react';
import { Search, Filter, RefreshCw, Loader2, ChevronRight, Layers, BookOpen, Download } from 'lucide-react';
import { useLLMAppsStore } from '../../stores/llm-apps-store';
import { LLMAppDetail } from './LLMAppDetail';
import type { LLMApp } from '../../types/llm-apps';

export function LLMAppsCatalog() {
  const catalog = useLLMAppsStore((s) => s.catalog);
  const loading = useLLMAppsStore((s) => s.loading);
  const loadCatalog = useLLMAppsStore((s) => s.loadCatalog);
  const searchQuery = useLLMAppsStore((s) => s.searchQuery);
  const setSearchQuery = useLLMAppsStore((s) => s.setSearchQuery);
  const selectedCategory = useLLMAppsStore((s) => s.selectedCategory);
  const setSelectedCategory = useLLMAppsStore((s) => s.setSelectedCategory);
  const selectedApp = useLLMAppsStore((s) => s.selectedApp);
  const setSelectedApp = useLLMAppsStore((s) => s.setSelectedApp);
  const filteredApps = useLLMAppsStore((s) => s.filteredApps);
  const [rebuilding, setRebuilding] = useState(false);
  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  useEffect(() => {
    if (!catalog) loadCatalog();
  }, [catalog, loadCatalog]);

  const handleRebuild = async () => {
    setRebuilding(true);
    try {
      await window.electronAPI.llmApps.buildCatalog();
      await loadCatalog();
    } catch (err) {
      console.error('[LLM Apps] Rebuild failed:', err);
    } finally {
      setRebuilding(false);
    }
  };

  const handleCheckUpdates = async () => {
    setUpdating(true);
    setUpdateMsg(null);
    try {
      const result = await window.electronAPI.llmApps.pullUpdates();
      if (result.ok) {
        await loadCatalog();
        const delta = result.newApps ?? 0;
        if (delta > 0) {
          setUpdateMsg(`Updated! ${delta} new app${delta !== 1 ? 's' : ''} found`);
        } else if (delta < 0) {
          setUpdateMsg(`Updated! ${Math.abs(delta)} app${Math.abs(delta) !== 1 ? 's' : ''} removed`);
        } else {
          setUpdateMsg('Already up to date');
        }
      } else {
        setUpdateMsg(`Update failed: ${result.error}`);
      }
    } catch {
      setUpdateMsg('Update failed — check network connection');
    } finally {
      setUpdating(false);
      setTimeout(() => setUpdateMsg(null), 5000);
    }
  };

  // Detail view
  if (selectedApp) {
    return <LLMAppDetail app={selectedApp} onBack={() => setSelectedApp(null)} />;
  }

  const apps = filteredApps();
  const categories = catalog?.categories || [];

  return (
    <div className="w-full h-full bg-zinc-900 text-zinc-100 flex flex-col overflow-hidden">
      {/* Top Bar */}
      <div className="flex-shrink-0 border-b border-zinc-800 px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <Layers className="w-5 h-5 text-amber-500" />
            <h1 className="text-lg font-bold text-zinc-100">LLM Apps Catalog</h1>
            {catalog && (
              <span className="text-xs text-zinc-500 bg-zinc-800 px-2 py-0.5 rounded">
                {catalog.totalApps} apps
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {updateMsg && (
              <span className={`text-[11px] px-2 py-1 rounded ${updateMsg.startsWith('Updated') || updateMsg === 'Already up to date' ? 'text-emerald-400 bg-emerald-500/10' : 'text-red-400 bg-red-500/10'}`}>
                {updateMsg}
              </span>
            )}
            <button
              onClick={handleCheckUpdates}
              disabled={updating}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-300 rounded text-xs transition-colors flex items-center gap-1.5"
              title="Fetch upstream changes and rebuild catalog"
            >
              {updating ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <Download className="w-3.5 h-3.5" />
              )}
              Check for Updates
            </button>
            <button
              onClick={handleRebuild}
              disabled={rebuilding}
              className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 disabled:bg-zinc-800 disabled:text-zinc-600 text-zinc-300 rounded text-xs transition-colors flex items-center gap-1.5"
              title="Re-scan local repository"
            >
              {rebuilding ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5" />
              )}
              Re-scan
            </button>
          </div>
        </div>

        {/* Search + Filter */}
        <div className="flex gap-3">
          <div className="flex-1 relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-500" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search apps, tech stack, categories..."
              className="w-full bg-zinc-800 border border-zinc-700 rounded pl-9 pr-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500/50"
            />
          </div>
          <div className="relative">
            <select
              value={selectedCategory || ''}
              onChange={(e) => setSelectedCategory(e.target.value || null)}
              className="appearance-none bg-zinc-800 border border-zinc-700 rounded px-3 py-2 pr-8 text-sm text-zinc-300 focus:outline-none focus:border-amber-500/50 cursor-pointer"
            >
              <option value="">All Categories</option>
              {categories.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label} ({cat.appCount})
                </option>
              ))}
            </select>
            <Filter className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-zinc-500 pointer-events-none" />
          </div>
        </div>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-6">
        {loading ? (
          <div className="flex items-center justify-center h-64">
            <Loader2 className="w-6 h-6 animate-spin text-amber-500" />
          </div>
        ) : apps.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-64 text-zinc-500">
            <Search className="w-8 h-8 mb-3 opacity-50" />
            <p className="text-sm">No apps found{searchQuery ? ` for "${searchQuery}"` : ''}</p>
          </div>
        ) : (
          <>
            <div className="text-xs text-zinc-500 mb-4">
              Showing {apps.length} app{apps.length !== 1 ? 's' : ''}
              {selectedCategory && ` in ${categories.find((c) => c.id === selectedCategory)?.label}`}
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {apps.map((app) => (
                <AppCard key={app.id} app={app} onClick={() => setSelectedApp(app)} />
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AppCard({ app, onClick }: { app: LLMApp; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="text-left bg-zinc-800 hover:bg-zinc-800/80 border border-zinc-700 hover:border-zinc-600 rounded-lg p-4 transition-all group"
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium text-zinc-100 group-hover:text-amber-500 transition-colors text-sm leading-tight">
          {app.name}
        </h3>
        <ChevronRight className="w-4 h-4 text-zinc-600 group-hover:text-amber-500 transition-colors flex-shrink-0 mt-0.5" />
      </div>

      <div className="flex items-center gap-1.5 mb-2">
        <span className="inline-block text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-500/80">
          {app.category}
        </span>
        {app.tutorialUrl && (
          <span className="inline-flex items-center gap-0.5 text-[10px] px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400" title="Has step-by-step tutorial">
            <BookOpen className="w-2.5 h-2.5" />
            Tutorial
          </span>
        )}
      </div>

      {app.description && (
        <p className="text-xs text-zinc-500 mb-3 line-clamp-2 leading-relaxed">
          {app.description}
        </p>
      )}

      {app.techStack.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {app.techStack.slice(0, 5).map((tech) => (
            <span
              key={tech}
              className="px-1.5 py-0.5 text-[10px] rounded bg-zinc-700/50 text-zinc-400"
            >
              {tech}
            </span>
          ))}
          {app.techStack.length > 5 && (
            <span className="px-1.5 py-0.5 text-[10px] text-zinc-600">
              +{app.techStack.length - 5}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-3 mt-3 text-[10px] text-zinc-600">
        <span>{app.pyFileCount} .py file{app.pyFileCount !== 1 ? 's' : ''}</span>
        {app.hasReadme && <span>README</span>}
        {app.hasRequirements && <span>requirements.txt</span>}
      </div>
    </button>
  );
}
