/**
 * CheckpointsPanel - Main panel for browsing Kuroryuu checkpoints
 *
 * Displays when Graphiti is disabled, with a banner to access Graphiti setup info
 * Design: Dark luxury meets terminal - dragon's hoard of crystallized save points
 */
import { useState, useEffect, useRef } from 'react';
import {
  Save,
  Search,
  Calendar,
  RefreshCw,
  Info,
  ChevronDown,
  ChevronRight,
  Brain,
  X,
  Server,
  ExternalLink,
  Zap,
  Loader2,
  Terminal,
  Copy,
  Check,
  AlertCircle,
  Database,
  Settings,
} from 'lucide-react';
import { useCheckpointsStore, type Checkpoint, extractDateFromId } from '../../stores/checkpoints-store';
import { CheckpointCard } from './CheckpointCard';
import { CheckpointDetailPanel } from './CheckpointDetailPanel';
import { useSettings, type GraphitiSettings } from '../../hooks/useSettings';

// ============================================================================
// Helper Functions
// ============================================================================

function groupByDate(checkpoints: Checkpoint[]): Record<string, Checkpoint[]> {
  const groups: Record<string, Checkpoint[]> = {};

  for (const cp of checkpoints) {
    const date = cp.saved_at
      ? new Date(cp.saved_at).toISOString().split('T')[0]
      : extractDateFromId(cp.id);

    if (!groups[date]) {
      groups[date] = [];
    }
    groups[date].push(cp);
  }

  // Sort dates descending (newest first)
  const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
  const sorted: Record<string, Checkpoint[]> = {};
  for (const key of sortedKeys) {
    sorted[key] = groups[key];
  }
  return sorted;
}

function formatDateHeader(dateStr: string): string {
  const date = new Date(dateStr);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);

  if (date.toDateString() === today.toDateString()) {
    return 'Today';
  }
  if (date.toDateString() === yesterday.toDateString()) {
    return 'Yesterday';
  }
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });
}

// ============================================================================
// DateGroup Component
// ============================================================================

interface DateGroupProps {
  date: string;
  checkpoints: Checkpoint[];
  selectedId: string | null;
  onSelectCheckpoint: (cp: Checkpoint) => void;
  isExpanded: boolean;
  onToggle: () => void;
}

function DateGroup({ date, checkpoints, selectedId, onSelectCheckpoint, isExpanded, onToggle }: DateGroupProps) {
  return (
    <div className="mb-4">
      {/* Date Header */}
      <button
        onClick={onToggle}
        className="w-full flex items-center gap-2 px-2 py-2 rounded-lg hover:bg-secondary/50 transition-colors"
      >
        {isExpanded ? (
          <ChevronDown className="w-4 h-4 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-4 h-4 text-muted-foreground" />
        )}
        <Calendar className="w-4 h-4 text-primary" />
        <span className="text-sm font-medium text-foreground">{formatDateHeader(date)}</span>
        <span className="text-xs text-muted-foreground ml-auto">
          {checkpoints.length} checkpoint{checkpoints.length !== 1 ? 's' : ''}
        </span>
      </button>

      {/* Checkpoints */}
      {isExpanded && (
        <div className="ml-6 mt-2 space-y-2">
          {checkpoints.map((cp) => (
            <CheckpointCard
              key={cp.id}
              checkpoint={cp}
              isSelected={selectedId === cp.id}
              onClick={() => onSelectCheckpoint(cp)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

// ============================================================================
// GraphitiSetupModal Component
// ============================================================================

interface GraphitiSetupModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function GraphitiSetupModal({ isOpen, onClose }: GraphitiSetupModalProps) {
  const [graphitiSettings] = useSettings<GraphitiSettings>('graphiti');
  const [isLaunching, setIsLaunching] = useState(false);
  const [launchOutput, setLaunchOutput] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'unhealthy' | 'checking'>('checking');

  const serverUrl = graphitiSettings?.serverUrl || 'http://localhost:8000';
  const port = new URL(serverUrl).port || '8000';
  const launchCommand = `cd SASgraphiti-server && docker-compose up -d`;
  const altCommand = `graphiti server --port ${port}`;

  useEffect(() => {
    if (isOpen) {
      checkHealth();
    }
  }, [isOpen]);

  const checkHealth = async () => {
    setHealthStatus('checking');
    try {
      const result = await window.electronAPI.graphiti.health();
      setHealthStatus(result.ok ? 'healthy' : 'unhealthy');
    } catch {
      setHealthStatus('unhealthy');
    }
  };

  const copyCommand = async () => {
    try {
      await navigator.clipboard.writeText(launchCommand);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = launchCommand;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const launchGraphitiServer = async () => {
    setIsLaunching(true);
    setLaunchOutput(null);
    setError(null);

    try {
      if (window.electronAPI?.graphiti?.launchServer) {
        const result = await window.electronAPI.graphiti.launchServer();
        if (result.success) {
          setLaunchOutput('Server starting...');
          let attempts = 0;
          const pollHealth = async () => {
            attempts++;
            const health = await window.electronAPI.graphiti.health();
            if (health.ok) {
              setIsLaunching(false);
              setLaunchOutput(null);
              setHealthStatus('healthy');
            } else if (attempts < 10) {
              setTimeout(pollHealth, 2000);
            } else {
              setIsLaunching(false);
              setLaunchOutput('Server started but not responding. Check logs.');
            }
          };
          setTimeout(pollHealth, 3000);
          return;
        } else {
          setError(result.error || 'Failed to launch server');
          setLaunchOutput('manual');
          setIsLaunching(false);
        }
      } else {
        setLaunchOutput('manual');
        setIsLaunching(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to launch server');
      setLaunchOutput('manual');
      setIsLaunching(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative w-full max-w-lg max-h-[80vh] overflow-y-auto m-4 bg-card border border-border rounded-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-purple-400" />
            <h2 className="text-lg font-semibold text-foreground">AI Memory (Graphiti)</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {/* Status Card */}
          <div className={`relative overflow-hidden p-4 rounded-xl border ${
            healthStatus === 'healthy'
              ? 'bg-gradient-to-br from-green-500/5 via-transparent to-green-500/5 border-green-500/30'
              : 'bg-gradient-to-br from-red-500/5 via-transparent to-purple-500/5 border-red-500/30'
          }`}>
            <div className="flex items-center gap-3 mb-3">
              <div className="relative">
                <div className={`p-2 rounded-lg border ${
                  healthStatus === 'healthy'
                    ? 'bg-green-500/20 border-green-500/30'
                    : 'bg-red-500/20 border-red-500/30'
                }`}>
                  <Server className={`w-5 h-5 ${
                    healthStatus === 'healthy' ? 'text-green-400' : 'text-red-400'
                  }`} />
                </div>
                <span className={`absolute -top-1 -right-1 w-3 h-3 rounded-full border-2 border-background ${
                  healthStatus === 'checking'
                    ? 'bg-yellow-500 animate-pulse'
                    : healthStatus === 'healthy'
                    ? 'bg-green-500'
                    : 'bg-red-500 animate-pulse'
                }`} />
              </div>
              <div>
                <h3 className="font-semibold text-foreground">
                  {healthStatus === 'healthy' ? 'Server Online' : 'Server Offline'}
                </h3>
                <p className="text-xs text-muted-foreground font-mono">{serverUrl}</p>
              </div>
            </div>

            {healthStatus !== 'healthy' && (
              <>
                <p className="text-sm text-muted-foreground mb-4">
                  Start the Graphiti server to enable AI memory features.
                </p>

                <div className="flex items-center gap-2">
                  <button
                    onClick={launchGraphitiServer}
                    disabled={isLaunching}
                    className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all bg-gradient-to-r from-purple-600 to-purple-500 hover:from-purple-500 hover:to-purple-400 text-white shadow-lg shadow-purple-500/20"
                  >
                    {isLaunching ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Zap className="w-4 h-4" />
                    )}
                    {isLaunching ? 'Starting...' : 'Launch Server'}
                  </button>
                  <button
                    onClick={checkHealth}
                    className="flex items-center gap-2 px-3 py-2 bg-secondary border border-border rounded-lg text-sm hover:bg-muted transition-colors"
                  >
                    <RefreshCw className="w-4 h-4" />
                    Retry
                  </button>
                </div>

                {launchOutput === 'manual' && (
                  <div className="mt-4 p-3 bg-purple-500/10 border border-purple-500/30 rounded-lg">
                    <div className="flex items-center justify-between mb-2">
                      <span className="text-xs text-purple-300 flex items-center gap-1.5">
                        <Terminal className="w-3.5 h-3.5" />
                        Run in terminal:
                      </span>
                      <button
                        onClick={copyCommand}
                        className="flex items-center gap-1 px-2 py-0.5 text-xs bg-purple-500/20 rounded text-purple-300 hover:bg-purple-500/30"
                      >
                        {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copied!' : 'Copy'}
                      </button>
                    </div>
                    <code className="block text-xs font-mono text-purple-200 bg-background/80 p-2 rounded">
                      {launchCommand}
                    </code>
                    <p className="text-xs text-muted-foreground mt-2">
                      Or: <code className="text-purple-300/80">{altCommand}</code>
                    </p>
                  </div>
                )}

                {error && (
                  <div className="mt-3 p-2 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center gap-2 text-sm text-red-400">
                    <AlertCircle className="w-4 h-4" />
                    {error}
                  </div>
                )}
              </>
            )}

            {healthStatus === 'healthy' && (
              <p className="text-sm text-green-400">
                Graphiti is running. Enable it in Settings → Integrations to use AI memory.
              </p>
            )}
          </div>

          {/* Setup Instructions */}
          <div className="p-4 bg-secondary/30 border border-border/50 rounded-xl">
            <h3 className="font-medium text-foreground mb-3 flex items-center gap-2">
              <Settings className="w-4 h-4 text-purple-400" />
              Setup Instructions
            </h3>
            <div className="space-y-2 text-sm text-muted-foreground">
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 bg-purple-500/20 text-purple-400 rounded text-xs font-semibold flex items-center justify-center flex-shrink-0">1</span>
                <p>Install Neo4j database (required)</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 bg-purple-500/20 text-purple-400 rounded text-xs font-semibold flex items-center justify-center flex-shrink-0">2</span>
                <p>Start the Graphiti server</p>
              </div>
              <div className="flex items-start gap-2">
                <span className="w-5 h-5 bg-purple-500/20 text-purple-400 rounded text-xs font-semibold flex items-center justify-center flex-shrink-0">3</span>
                <p>Enable in Settings → Integrations</p>
              </div>
            </div>
            <button
              onClick={() => window.open('https://github.com/getzep/graphiti', '_blank')}
              className="mt-3 flex items-center gap-1.5 text-purple-400 hover:text-purple-300 text-sm"
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Documentation
            </button>
          </div>

          {/* Docker Quick Start */}
          <div className="p-3 bg-secondary/20 border border-border/50 rounded-lg">
            <div className="flex items-center gap-2 mb-2">
              <Database className="w-3.5 h-3.5 text-blue-400" />
              <span className="text-sm font-medium text-foreground">Quick Start</span>
            </div>
            <code className="block text-xs font-mono text-blue-300 bg-background/60 p-2 rounded">
              docker run -p 8000:8000 zepai/graphiti
            </code>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// CheckpointsPanel - Main Component
// ============================================================================

export function CheckpointsPanel() {
  const {
    checkpoints,
    isLoading,
    searchQuery,
    selectedCheckpointId,
    selectedCheckpoint,
    detailLoading,
    loadCheckpoints,
    setSearchQuery,
    selectCheckpoint,
    getFilteredCheckpoints,
  } = useCheckpointsStore();

  const [expandedDates, setExpandedDates] = useState<Set<string>>(new Set());
  const [showGraphitiModal, setShowGraphitiModal] = useState(false);
  const hasInitialExpand = useRef(false);

  // Load checkpoints on mount
  useEffect(() => {
    loadCheckpoints();
  }, [loadCheckpoints]);

  // Auto-expand first 3 dates (only once on initial load)
  useEffect(() => {
    if (checkpoints.length > 0 && !hasInitialExpand.current) {
      hasInitialExpand.current = true;
      const grouped = groupByDate(checkpoints);
      const dates = Object.keys(grouped).slice(0, 3);
      setExpandedDates(new Set(dates));
    }
  }, [checkpoints]);

  const filteredCheckpoints = getFilteredCheckpoints();
  const groupedCheckpoints = groupByDate(filteredCheckpoints);
  // Use the fully loaded checkpoint (with data), or fall back to list item only for basic display
  // The detail panel needs selectedCheckpoint to show Related Documents
  const listCheckpoint = checkpoints.find((cp) => cp.id === selectedCheckpointId);
  const selectedCp = selectedCheckpoint || listCheckpoint;

  const toggleDate = (date: string) => {
    setExpandedDates((prev) => {
      const next = new Set(prev);
      if (next.has(date)) {
        next.delete(date);
      } else {
        next.add(date);
      }
      return next;
    });
  };

  return (
    <div className="h-full flex bg-background">
      {/* Main Content */}
      <div className="flex-1 flex flex-col h-full">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Save className="w-5 h-5 text-primary" />
            <h1 className="text-lg font-semibold text-foreground">Checkpoints</h1>
            <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-sm">
              {checkpoints.length} saved
            </span>
          </div>

          <div className="flex items-center gap-2">
            <button
              onClick={() => loadCheckpoints()}
              disabled={isLoading}
              className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-foreground hover:bg-muted transition-colors text-sm"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        </div>

        {/* Graphiti Banner - Click to open modal */}
        <button
          onClick={() => setShowGraphitiModal(true)}
          className="px-6 py-2.5 border-b border-border bg-purple-500/5 hover:bg-purple-500/10 transition-colors text-left group"
        >
          <div className="flex items-center gap-3">
            <Brain className="w-4 h-4 text-purple-400 group-hover:text-purple-300 transition-colors" />
            <div className="flex-1">
              <span className="text-xs text-purple-300 group-hover:text-purple-200 transition-colors">
                Want AI Memory? Click here to set up Graphiti →
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-purple-400 group-hover:translate-x-0.5 transition-transform" />
          </div>
        </button>

        {/* Info Banner */}
        <div className="px-6 py-3 border-b border-border bg-primary/5">
          <div className="flex items-start gap-3">
            <Info className="w-4 h-4 text-primary mt-0.5 flex-shrink-0" />
            <div className="text-xs text-muted-foreground">
              <span className="font-medium text-foreground">Kuroryuu Checkpoints</span>
              <span className="mx-1.5">·</span>
              Session save points from{' '}
              <code className="px-1 py-0.5 bg-secondary rounded text-[10px]">k_checkpoint</code>{' '}
              MCP tool. Agents can save and restore state across sessions.
            </div>
          </div>
        </div>

        {/* Search */}
        <div className="px-6 py-3 border-b border-border">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search checkpoints..."
              className="w-full pl-10 pr-4 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder:text-muted-foreground focus:outline-none focus:border-primary"
            />
          </div>
        </div>

        {/* Checkpoints List */}
        <div className="flex-1 overflow-y-auto p-6">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center text-muted-foreground">
                <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-primary/50" />
                <p>Loading checkpoints...</p>
              </div>
            </div>
          ) : Object.keys(groupedCheckpoints).length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full">
              <div className="p-4 rounded-full bg-primary/10 mb-4">
                <Save className="w-8 h-8 text-primary opacity-60" />
              </div>
              <h2 className="text-lg font-medium text-foreground mb-2">No Checkpoints</h2>
              <p className="text-sm text-muted-foreground max-w-md text-center">
                {searchQuery
                  ? 'No checkpoints match your search'
                  : 'Checkpoints will appear here when agents save their progress via k_checkpoint.'}
              </p>
            </div>
          ) : (
            Object.entries(groupedCheckpoints).map(([date, dateCheckpoints]) => (
              <DateGroup
                key={date}
                date={date}
                checkpoints={dateCheckpoints}
                selectedId={selectedCheckpointId}
                onSelectCheckpoint={(cp) => selectCheckpoint(cp.id)}
                isExpanded={expandedDates.has(date)}
                onToggle={() => toggleDate(date)}
              />
            ))
          )}
        </div>
      </div>

      {/* Detail Panel - only show when a checkpoint is selected */}
      {selectedCheckpointId && (
        <CheckpointDetailPanel
          checkpoint={selectedCheckpoint || listCheckpoint!}
          isLoading={detailLoading || !selectedCheckpoint}
          onClose={() => selectCheckpoint(null)}
        />
      )}

      {/* Graphiti Setup Modal */}
      <GraphitiSetupModal
        isOpen={showGraphitiModal}
        onClose={() => setShowGraphitiModal(false)}
      />
    </div>
  );
}
