/**
 * EpisodeTimeline - View conversation episodes over time
 */

import { useState, useEffect, useCallback } from 'react';
import {
  Clock,
  MessageSquare,
  Loader2,
  RefreshCw,
  ChevronDown,
  ChevronRight,
  Brain,
  AlertCircle,
  Calendar,
} from 'lucide-react';
import { useSettings, type GraphitiSettings } from '../../hooks/useSettings';

interface Episode {
  id: string;
  summary: string;
  timestamp: string;
  nodes: string[];
}

interface EpisodeCardProps {
  episode: Episode;
  isExpanded: boolean;
  onToggle: () => void;
}

function EpisodeCard({ episode, isExpanded, onToggle }: EpisodeCardProps) {
  const formattedDate = new Date(episode.timestamp).toLocaleDateString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return (
    <div className="border border-border rounded-lg bg-card/50 overflow-hidden">
      {/* Header - clickable */}
      <button
        onClick={onToggle}
        className="w-full flex items-start gap-3 p-4 hover:bg-card transition-colors text-left"
      >
        <div className="p-2 bg-blue-500/10 rounded-lg mt-0.5">
          <MessageSquare className="w-4 h-4 text-blue-400" />
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm text-foreground line-clamp-2">{episode.summary}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span className="flex items-center gap-1">
              <Clock className="w-3 h-3" />
              {formattedDate}
            </span>
            <span className="flex items-center gap-1">
              <Brain className="w-3 h-3" />
              {episode.nodes.length} memories
            </span>
          </div>
        </div>
        <div className="text-muted-foreground">
          {isExpanded ? (
            <ChevronDown className="w-4 h-4" />
          ) : (
            <ChevronRight className="w-4 h-4" />
          )}
        </div>
      </button>

      {/* Expanded content */}
      {isExpanded && episode.nodes.length > 0 && (
        <div className="px-4 pb-4 border-t border-border bg-secondary/30">
          <p className="text-xs text-muted-foreground mt-3 mb-2">
            Linked Memory IDs:
          </p>
          <div className="flex flex-wrap gap-1">
            {episode.nodes.slice(0, 10).map((nodeId) => (
              <span
                key={nodeId}
                className="px-2 py-0.5 bg-secondary text-xs text-muted-foreground rounded font-mono"
                title={nodeId}
              >
                {nodeId.slice(0, 8)}...
              </span>
            ))}
            {episode.nodes.length > 10 && (
              <span className="px-2 py-0.5 text-xs text-muted-foreground">
                +{episode.nodes.length - 10} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export function EpisodeTimeline() {
  const [graphitiSettings] = useSettings<GraphitiSettings>('graphiti');
  const [episodes, setEpisodes] = useState<Episode[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<'healthy' | 'unhealthy' | 'checking'>('checking');

  const enabled = graphitiSettings?.enabled ?? false;

  // Check health on mount
  useEffect(() => {
    if (enabled) {
      checkHealth();
    }
  }, [enabled]);

  const checkHealth = async () => {
    setHealthStatus('checking');
    try {
      const result = await window.electronAPI.graphiti.health();
      setHealthStatus(result.ok ? 'healthy' : 'unhealthy');
      if (result.ok) {
        loadEpisodes();
      }
    } catch {
      setHealthStatus('unhealthy');
    }
  };

  // Load episodes from Graphiti
  const loadEpisodes = useCallback(async () => {
    if (!enabled) return;

    setLoading(true);
    setError(null);

    try {
      const result = await window.electronAPI.graphiti.episodes({
        limit: 50,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      setEpisodes(result.episodes || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load episodes');
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  const toggleExpand = (id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  };

  // Group episodes by date
  const groupedEpisodes = episodes.reduce<Record<string, Episode[]>>((acc, episode) => {
    const date = new Date(episode.timestamp).toLocaleDateString(undefined, {
      weekday: 'long',
      month: 'long',
      day: 'numeric',
      year: 'numeric',
    });
    if (!acc[date]) {
      acc[date] = [];
    }
    acc[date].push(episode);
    return acc;
  }, {});

  // Not enabled state
  if (!enabled) {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="p-4 bg-purple-500/10 rounded-full mb-4">
          <Brain className="w-8 h-8 text-purple-400" />
        </div>
        <h2 className="text-lg font-medium text-foreground mb-2">AI Memory Disabled</h2>
        <p className="text-sm text-muted-foreground max-w-md">
          Enable Graphiti in Settings &gt; Integrations to view episode timeline.
        </p>
      </div>
    );
  }

  // Unhealthy state
  if (healthStatus === 'unhealthy') {
    return (
      <div className="flex flex-col items-center justify-center h-full text-center p-8">
        <div className="p-4 bg-red-500/10 rounded-full mb-4">
          <AlertCircle className="w-8 h-8 text-red-400" />
        </div>
        <h2 className="text-lg font-medium text-foreground mb-2">Graphiti Not Available</h2>
        <p className="text-sm text-muted-foreground max-w-md mb-4">
          Cannot connect to Graphiti server.
        </p>
        <button
          onClick={checkHealth}
          className="flex items-center gap-2 px-4 py-2 bg-secondary border border-border rounded-lg text-sm hover:bg-muted"
        >
          <RefreshCw className="w-4 h-4" />
          Retry Connection
        </button>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-blue-400" />
          <h1 className="text-lg font-semibold text-foreground">Episodes</h1>
          <span className="text-xs text-muted-foreground">
            {episodes.length} conversations
          </span>
        </div>
        <button
          onClick={loadEpisodes}
          disabled={loading}
          className="p-2 hover:bg-secondary rounded-lg transition-colors"
          title="Refresh episodes"
        >
          <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4">
        {loading && healthStatus === 'checking' ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <AlertCircle className="w-6 h-6 text-red-400 mb-2" />
            <p className="text-sm text-red-400">{error}</p>
          </div>
        ) : episodes.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-32 text-center">
            <MessageSquare className="w-6 h-6 text-muted-foreground mb-2" />
            <p className="text-sm text-muted-foreground">No episodes yet</p>
            <p className="text-xs text-muted-foreground mt-1">
              Episodes are created when AI agents have conversations
            </p>
          </div>
        ) : (
          <div className="space-y-6">
            {Object.entries(groupedEpisodes).map(([date, dateEpisodes]) => (
              <div key={date}>
                {/* Date header */}
                <div className="flex items-center gap-2 mb-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground font-medium px-2">
                    {date}
                  </span>
                  <div className="h-px flex-1 bg-border" />
                </div>

                {/* Episodes for this date */}
                <div className="space-y-3">
                  {dateEpisodes.map((episode) => (
                    <EpisodeCard
                      key={episode.id}
                      episode={episode}
                      isExpanded={expandedId === episode.id}
                      onToggle={() => toggleExpand(episode.id)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
