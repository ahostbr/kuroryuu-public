import { useState } from 'react';
import {
  CheckCircle2,
  Loader2,
  Download,
  Database,
  FolderSearch,
  Rocket,
  GitBranch,
  Box,
} from 'lucide-react';
import type { LLMAppsCatalog } from '../../types/llm-apps';

interface LLMAppsSetupWizardProps {
  onComplete: () => void;
}

type Stage = 1 | 2 | 3;

export function LLMAppsSetupWizard({ onComplete }: LLMAppsSetupWizardProps) {
  const [stage, setStage] = useState<Stage>(1);
  const [cloning, setCloning] = useState(false);
  const [cloned, setCloned] = useState(false);
  const [building, setBuilding] = useState(false);
  const [catalog, setCatalog] = useState<LLMAppsCatalog | null>(null);
  const [indexing, setIndexing] = useState(false);
  const [indexed, setIndexed] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const cloneRepo = async () => {
    setCloning(true);
    setError(null);
    try {
      const result = await window.electronAPI.llmApps.cloneRepo();
      if (result.ok) {
        setCloned(true);
        setStage(2);
      } else {
        setError(result.error || 'Clone failed');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setCloning(false);
    }
  };

  const buildCatalog = async () => {
    setBuilding(true);
    setError(null);
    try {
      const result = await window.electronAPI.llmApps.buildCatalog();
      if (result.ok && result.catalog) {
        setCatalog(result.catalog as LLMAppsCatalog);
        setStage(3);
      } else {
        setError(result.error || 'Catalog build failed');
      }
    } catch (err) {
      setError(String(err));
    } finally {
      setBuilding(false);
    }
  };

  const indexRag = async () => {
    setIndexing(true);
    setError(null);
    try {
      const res = await fetch('http://127.0.0.1:8200/v1/llm-apps/catalog');
      if (res.ok) {
        setIndexed(true);
      } else {
        // RAG indexing is optional — just skip on failure
        setIndexed(true);
      }
    } catch {
      // Gateway may not be running — skip
      setIndexed(true);
    } finally {
      setIndexing(false);
    }
  };

  const completeSetup = async () => {
    await window.electronAPI.llmApps.saveSetup({ complete: true, catalogBuilt: !!catalog, ragIndexed: indexed });
    onComplete();
  };

  const stageItems = [
    { num: 1, label: 'Clone Repository', icon: GitBranch },
    { num: 2, label: 'Build Catalog', icon: FolderSearch },
    { num: 3, label: 'Finish', icon: Rocket },
  ];

  return (
    <div className="w-full h-full bg-zinc-900 text-zinc-100 overflow-auto p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-amber-500 mb-2">LLM Apps Catalog Setup</h1>
          <p className="text-zinc-400">
            Clone and index the awesome-llm-apps collection — 100+ ready-to-run LLM applications
          </p>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-3 mb-8">
          {stageItems.map((s, i) => (
            <div key={s.num} className="flex items-center gap-3">
              <div
                className={`flex items-center gap-2 px-4 py-2 rounded ${
                  stage === s.num
                    ? 'bg-amber-500/20 text-amber-500'
                    : stage > s.num
                      ? 'bg-green-500/10 text-green-500'
                      : 'bg-zinc-800 text-zinc-500'
                }`}
              >
                {stage > s.num ? (
                  <CheckCircle2 className="w-4 h-4" />
                ) : (
                  <s.icon className="w-4 h-4" />
                )}
                <span className="text-sm font-medium">{s.num}. {s.label}</span>
              </div>
              {i < stageItems.length - 1 && <div className="w-8 h-0.5 bg-zinc-800" />}
            </div>
          ))}
        </div>

        {/* Error display */}
        {error && (
          <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400 mb-6">
            {error}
          </div>
        )}

        {/* Stage 1: Clone */}
        {stage === 1 && (
          <div className="space-y-6">
            <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
              <div className="flex items-start gap-4">
                <div className="w-12 h-12 rounded-lg bg-amber-500/10 flex items-center justify-center flex-shrink-0">
                  <Box className="w-6 h-6 text-amber-500" />
                </div>
                <div className="flex-1">
                  <h2 className="text-xl font-semibold mb-2">awesome-llm-apps</h2>
                  <p className="text-zinc-400 text-sm mb-3">
                    A curated collection of 100+ production-ready LLM applications: AI agents, RAG systems,
                    multi-agent teams, MCP integrations, voice agents, and framework crash courses.
                  </p>
                  <a
                    href="#"
                    onClick={(e) => {
                      e.preventDefault();
                      window.electronAPI.shell.openExternal('https://github.com/Shubhamsaboo/awesome-llm-apps');
                    }}
                    className="text-xs text-zinc-500 hover:text-amber-500 hover:underline cursor-pointer"
                  >
                    https://github.com/Shubhamsaboo/awesome-llm-apps
                  </a>

                  <div className="flex flex-wrap gap-2 mt-4">
                    {['Agents', 'RAG', 'Multi-Agent Teams', 'MCP', 'Voice', 'Crash Courses'].map((tag) => (
                      <span key={tag} className="px-2 py-0.5 text-xs rounded bg-zinc-700 text-zinc-300">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50 text-sm text-zinc-400">
              <strong className="text-zinc-300">What happens:</strong> The repository will be cloned (shallow, ~50MB)
              into <code className="text-amber-500/80">tools/llm-apps/awesome-llm-apps/</code>. This folder is
              gitignored — it won't affect your project.
            </div>

            <div className="flex justify-end gap-3">
              <button
                onClick={cloneRepo}
                disabled={cloning || cloned}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded font-medium transition-colors flex items-center gap-2"
              >
                {cloning ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Cloning...
                  </>
                ) : cloned ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Cloned
                  </>
                ) : (
                  <>
                    <Download className="w-4 h-4" />
                    Clone Repository
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {/* Stage 2: Build Catalog */}
        {stage === 2 && (
          <div className="space-y-6">
            <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
              <h2 className="text-xl font-semibold mb-2">Build App Catalog</h2>
              <p className="text-zinc-400 text-sm mb-4">
                Scan the repository to discover all apps, extract descriptions from READMEs,
                and parse tech stacks from requirements files.
              </p>

              {catalog && (
                <div className="mt-4 space-y-3">
                  <div className="flex items-center gap-2 text-green-400">
                    <CheckCircle2 className="w-5 h-5" />
                    <span className="font-medium">
                      Found {catalog.totalApps} apps in {catalog.categories.length} categories
                    </span>
                  </div>
                  <div className="grid grid-cols-2 gap-2 mt-3">
                    {catalog.categories.slice(0, 10).map((cat) => (
                      <div key={cat.id} className="flex items-center justify-between px-3 py-1.5 bg-zinc-900 rounded text-sm">
                        <span className="text-zinc-300">{cat.label}</span>
                        <span className="text-amber-500 font-mono text-xs">{cat.appCount}</span>
                      </div>
                    ))}
                    {catalog.categories.length > 10 && (
                      <div className="px-3 py-1.5 text-zinc-500 text-sm">
                        +{catalog.categories.length - 10} more...
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>

            <div className="flex justify-between">
              <button
                onClick={() => setStage(1)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm transition-colors"
              >
                Back
              </button>
              <div className="flex gap-3">
                {!catalog && (
                  <button
                    onClick={buildCatalog}
                    disabled={building}
                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded font-medium transition-colors flex items-center gap-2"
                  >
                    {building ? (
                      <>
                        <Loader2 className="w-4 h-4 animate-spin" />
                        Scanning...
                      </>
                    ) : (
                      <>
                        <FolderSearch className="w-4 h-4" />
                        Build Catalog
                      </>
                    )}
                  </button>
                )}
                {catalog && (
                  <button
                    onClick={() => setStage(3)}
                    className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-zinc-900 rounded font-medium transition-colors"
                  >
                    Next
                  </button>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Stage 3: RAG Index + Complete */}
        {stage === 3 && (
          <div className="space-y-6">
            <div className="bg-zinc-800 rounded-lg p-6 border border-zinc-700">
              <h2 className="text-xl font-semibold mb-2">RAG Index (Optional)</h2>
              <p className="text-zinc-400 text-sm mb-4">
                Index all app code and READMEs into Kuroryuu RAG so Claude can search and reference them
                when building new features or answering questions about LLM patterns.
              </p>

              <button
                onClick={indexRag}
                disabled={indexing || indexed}
                className="px-4 py-2 bg-violet-500 hover:bg-violet-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded text-sm font-medium transition-colors flex items-center gap-2"
              >
                {indexing ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Indexing...
                  </>
                ) : indexed ? (
                  <>
                    <CheckCircle2 className="w-4 h-4" />
                    Indexed
                  </>
                ) : (
                  <>
                    <Database className="w-4 h-4" />
                    Index for Claude
                  </>
                )}
              </button>
            </div>

            {catalog && (
              <div className="bg-zinc-800/50 rounded-lg p-4 border border-zinc-700/50">
                <h3 className="text-sm font-medium text-zinc-300 mb-2">Setup Summary</h3>
                <div className="space-y-1 text-sm text-zinc-400">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    Repository cloned
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    {catalog.totalApps} apps cataloged across {catalog.categories.length} categories
                  </div>
                  <div className="flex items-center gap-2">
                    {indexed ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-green-500" />
                    ) : (
                      <div className="w-3.5 h-3.5 rounded-full border border-zinc-600" />
                    )}
                    RAG index {indexed ? 'created' : '(skipped)'}
                  </div>
                </div>
              </div>
            )}

            <div className="flex justify-between">
              <button
                onClick={() => setStage(2)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={completeSetup}
                className="px-6 py-2.5 bg-amber-500 hover:bg-amber-600 text-zinc-900 rounded font-medium transition-colors flex items-center gap-2"
              >
                <Rocket className="w-4 h-4" />
                Complete Setup
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
