import { useState, useCallback, useEffect, useRef } from 'react';
import {
  TrendingUp,
  Star,
  ChevronDown,
  ChevronUp,
  Instagram,
  Youtube,
  Loader2,
  Film,
  X,
  ExternalLink,
  Globe,
  BarChart3,
  ArrowLeft,
  ArrowRight,
  RotateCw,
} from 'lucide-react';
import { useSocialIntelStore } from '../../../stores/social-intel-store';
import type { Creator, VideoResult } from '../../../stores/social-intel-store';

function formatNumber(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1).replace(/\.0$/, '') + 'M';
  if (n >= 1_000) return (n / 1_000).toFixed(1).replace(/\.0$/, '') + 'K';
  return n.toString();
}

function formatDate(iso: string): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
  } catch {
    return iso;
  }
}

const PLATFORM_LABELS: Record<string, string> = {
  instagram: 'IG',
  youtube: 'YT',
  tiktok: 'TT',
};

const PLATFORM_COLORS: Record<string, string> = {
  instagram: 'bg-pink-500/20 text-pink-400',
  youtube: 'bg-red-500/20 text-red-400',
  tiktok: 'bg-sky-500/20 text-sky-400',
};

function PlatformIcon({ platform, className }: { platform: string; className?: string }) {
  if (platform === 'instagram') return <Instagram className={className} />;
  if (platform === 'youtube') return <Youtube className={className} />;
  // TikTok has no dedicated lucide icon — use Film as fallback
  return <Film className={className} />;
}

function CreatorCard({ creator }: { creator: Creator }) {
  const platformLabel = PLATFORM_LABELS[creator.platform] ?? creator.platform.toUpperCase();
  const platformColor = PLATFORM_COLORS[creator.platform] ?? 'bg-zinc-600/20 text-zinc-400';

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg p-3 flex flex-col gap-2 min-w-0">
      {/* Avatar + name row */}
      <div className="flex items-center gap-2 min-w-0">
        {creator.profilePicUrl ? (
          <img
            src={creator.profilePicUrl}
            alt={creator.username}
            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
          />
        ) : (
          <div className="w-8 h-8 rounded-full bg-zinc-700 flex items-center justify-center flex-shrink-0">
            <PlatformIcon platform={creator.platform} className="w-4 h-4 text-zinc-400" />
          </div>
        )}
        <div className="min-w-0">
          <div className="text-sm font-medium text-zinc-100 truncate">@{creator.username}</div>
          <div className="text-xs text-zinc-500 truncate">{creator.category}</div>
        </div>
      </div>

      {/* Platform badge */}
      <div className="flex items-center gap-1.5">
        <span className={`text-xs font-semibold px-1.5 py-0.5 rounded ${platformColor}`}>
          {platformLabel}
        </span>
      </div>

      {/* Stats */}
      <div className="space-y-0.5">
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500">Followers</span>
          <span className="text-zinc-300 font-medium">{formatNumber(creator.followers)}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500">Posts/mo</span>
          <span className="text-zinc-300 font-medium">{creator.postsPerMonth}</span>
        </div>
        <div className="flex justify-between text-xs">
          <span className="text-zinc-500">Avg views</span>
          <span className="text-zinc-300 font-medium">{formatNumber(creator.avgViews)}</span>
        </div>
      </div>

      {/* Last scraped */}
      {creator.lastScraped && (
        <div className="text-xs text-zinc-600 pt-0.5 border-t border-zinc-700">
          Scraped {formatDate(creator.lastScraped)}
        </div>
      )}
    </div>
  );
}

function VideoLightbox({
  video,
  onClose,
}: {
  video: VideoResult;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className="relative max-w-2xl w-full mx-4 bg-zinc-900 rounded-xl overflow-hidden border border-zinc-700 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onClose}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-black/60 hover:bg-black/80 text-zinc-300 hover:text-white transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Large thumbnail */}
        {video.thumbnail ? (
          <img
            src={video.thumbnail}
            alt={`@${video.creator}`}
            className="w-full aspect-video object-cover"
          />
        ) : (
          <div className="w-full aspect-video bg-zinc-800 flex items-center justify-center">
            <Film className="w-12 h-12 text-zinc-600" />
          </div>
        )}

        {/* Info bar */}
        <div className="p-4 space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-100">@{video.creator}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">
              {video.platform.toUpperCase()}
            </span>
            {video.configName && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                {video.configName}
              </span>
            )}
          </div>
          <div className="flex items-center gap-4 text-xs text-zinc-500">
            <span>{formatNumber(video.views)} views</span>
            <span>{formatNumber(video.likes)} likes</span>
            <span>{formatNumber(video.comments)} comments</span>
            {video.datePosted && <span>Posted {formatDate(video.datePosted)}</span>}
          </div>
          {video.link && (
            <a
              href={video.link}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-1.5 text-xs text-amber-400 hover:text-amber-300 transition-colors mt-1"
              onClick={(e) => {
                e.preventDefault();
                window.electronAPI?.shell?.openExternal?.(video.link);
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              Open on {video.platform === 'youtube' ? 'YouTube' : video.platform === 'instagram' ? 'Instagram' : 'TikTok'}
            </a>
          )}
        </div>
      </div>
    </div>
  );
}

function VideoCard({ video, onThumbnailClick }: { video: VideoResult; onThumbnailClick: () => void }) {
  const [showAnalysis, setShowAnalysis] = useState(false);
  const [showConcepts, setShowConcepts] = useState(false);
  const toggleStar = useSocialIntelStore((s) => s.toggleStar);

  return (
    <div className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
      <div className="flex gap-3 p-4">
        {/* Thumbnail — clickable for lightbox */}
        <button
          onClick={onThumbnailClick}
          className="flex-shrink-0 w-20 h-14 rounded overflow-hidden bg-zinc-700 flex items-center justify-center hover:ring-2 hover:ring-amber-500/50 transition-all cursor-pointer"
        >
          {video.thumbnail ? (
            <img src={video.thumbnail} alt="" className="w-full h-full object-cover" />
          ) : (
            <Film className="w-5 h-5 text-zinc-500" />
          )}
        </button>

        {/* Meta */}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-zinc-100">@{video.creator}</span>
            <span className="text-xs px-1.5 py-0.5 rounded bg-zinc-700 text-zinc-400">
              {video.platform.toUpperCase()}
            </span>
            {video.configName && (
              <span className="text-xs px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400">
                {video.configName}
              </span>
            )}
          </div>

          <div className="flex items-center gap-3 mt-1 text-xs text-zinc-500">
            <span>{formatNumber(video.views)} views</span>
            <span>{formatNumber(video.likes)} likes</span>
            <span>{formatNumber(video.comments)} comments</span>
          </div>

          {video.datePosted && (
            <div className="text-xs text-zinc-600 mt-0.5">
              Posted {formatDate(video.datePosted)}
            </div>
          )}
        </div>

        {/* Star */}
        <button
          onClick={() => toggleStar(video.id)}
          className={`flex-shrink-0 p-1.5 rounded transition-colors ${
            video.starred
              ? 'text-amber-400 hover:text-amber-300'
              : 'text-zinc-600 hover:text-zinc-400'
          }`}
          title={video.starred ? 'Unstar' : 'Star'}
        >
          <Star className={`w-4 h-4 ${video.starred ? 'fill-current' : ''}`} />
        </button>
      </div>

      {/* Expand toggles */}
      {(video.analysis || video.concepts) && (
        <div className="flex border-t border-zinc-700">
          {video.analysis && (
            <button
              onClick={() => setShowAnalysis((v) => !v)}
              className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors"
            >
              {showAnalysis ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
              Analysis
            </button>
          )}
          {video.concepts && (
            <>
              {video.analysis && <div className="w-px bg-zinc-700" />}
              <button
                onClick={() => setShowConcepts((v) => !v)}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 text-xs text-zinc-400 hover:text-zinc-200 hover:bg-zinc-700/50 transition-colors"
              >
                {showConcepts ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                Concepts
              </button>
            </>
          )}
        </div>
      )}

      {/* Expanded content */}
      {showAnalysis && video.analysis && (
        <div className="px-4 py-3 border-t border-zinc-700 bg-zinc-900/50">
          <div className="text-xs font-medium text-zinc-400 mb-2">Analysis</div>
          <div className="text-sm text-zinc-300 whitespace-pre-wrap">{video.analysis}</div>
        </div>
      )}
      {showConcepts && video.concepts && (
        <div className="px-4 py-3 border-t border-zinc-700 bg-zinc-900/50">
          <div className="text-xs font-medium text-zinc-400 mb-2">Concepts</div>
          <div className="text-sm text-zinc-300 whitespace-pre-wrap">{video.concepts}</div>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// Browser Tab — Electron WebContentsView with IPC positioning
// ============================================================================

function BrowserTab() {
  const containerRef = useRef<HTMLDivElement>(null);
  const [url, setUrl] = useState('https://www.youtube.com');
  const [currentUrl, setCurrentUrl] = useState('');
  const [inputUrl, setInputUrl] = useState('https://www.youtube.com');

  // Position the native browser view over this container
  const updateBounds = useCallback(() => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    // Account for window position offset (Electron uses screen coords for child views)
    window.electronAPI?.ipcRenderer?.invoke?.('browser:show', {
      x: Math.round(rect.left),
      y: Math.round(rect.top),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    });
  }, []);

  // Show browser view on mount, hide on unmount
  useEffect(() => {
    // Navigate to initial URL
    window.electronAPI?.ipcRenderer?.invoke?.('browser:navigate', url);
    // Small delay for layout to settle, then position
    const timer = setTimeout(updateBounds, 100);

    // Track resizes
    const observer = new ResizeObserver(updateBounds);
    if (containerRef.current) observer.observe(containerRef.current);

    // Poll URL for address bar updates
    const urlPoll = setInterval(async () => {
      const cur = await window.electronAPI?.ipcRenderer?.invoke?.('browser:get-url');
      if (cur && cur !== currentUrl) setCurrentUrl(cur);
    }, 1000);

    return () => {
      clearTimeout(timer);
      clearInterval(urlPoll);
      observer.disconnect();
      window.electronAPI?.ipcRenderer?.invoke?.('browser:hide');
    };
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const handleNavigate = () => {
    let navUrl = inputUrl.trim();
    if (!navUrl) return;
    if (!navUrl.startsWith('http://') && !navUrl.startsWith('https://')) {
      navUrl = 'https://' + navUrl;
    }
    setUrl(navUrl);
    window.electronAPI?.ipcRenderer?.invoke?.('browser:navigate', navUrl);
  };

  const handleBack = () => window.electronAPI?.ipcRenderer?.invoke?.('browser:navigate', '').then(() => {
    // Use the bridge for back since IPC only has navigate
    fetch('http://127.0.0.1:7425/browser/go-back', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => {});
  });

  const handleForward = () => {
    fetch('http://127.0.0.1:7425/browser/go-forward', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => {});
  };

  const handleReload = () => {
    fetch('http://127.0.0.1:7425/browser/reload', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{}',
    }).catch(() => {});
  };

  return (
    <div className="h-full flex flex-col">
      {/* URL bar */}
      <div className="flex items-center gap-1.5 px-3 py-2 border-b border-zinc-700 bg-zinc-800/50 flex-shrink-0">
        <button onClick={handleBack} className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200" title="Back">
          <ArrowLeft className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleForward} className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200" title="Forward">
          <ArrowRight className="w-3.5 h-3.5" />
        </button>
        <button onClick={handleReload} className="p-1 rounded hover:bg-zinc-700 text-zinc-400 hover:text-zinc-200" title="Reload">
          <RotateCw className="w-3.5 h-3.5" />
        </button>
        <input
          type="text"
          value={inputUrl}
          onChange={(e) => setInputUrl(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && handleNavigate()}
          className="flex-1 bg-zinc-900 border border-zinc-700 rounded px-2.5 py-1 text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
          placeholder="Enter URL..."
        />
        <button
          onClick={handleNavigate}
          className="px-2.5 py-1 text-xs rounded bg-amber-500 hover:bg-amber-600 text-zinc-900 font-medium"
        >
          Go
        </button>
      </div>

      {/* Native browser view renders here (positioned via IPC) */}
      <div ref={containerRef} className="flex-1 bg-zinc-900" />
    </div>
  );
}

// ============================================================================
// Intel Tab — Creators, Videos, Analysis results
// ============================================================================

type SortOption = 'views' | 'date-posted' | 'date-analyzed';

function IntelTab() {
  const creators = useSocialIntelStore((s) => s.creators);
  const videos = useSocialIntelStore((s) => s.videos);
  const pipelineStatus = useSocialIntelStore((s) => s.pipelineStatus);
  const selectedPlatformFilter = useSocialIntelStore((s) => s.selectedPlatformFilter);
  const selectedCategoryFilter = useSocialIntelStore((s) => s.selectedCategoryFilter);
  const setSelectedPlatformFilter = useSocialIntelStore((s) => s.setSelectedPlatformFilter);
  const setSelectedCategoryFilter = useSocialIntelStore((s) => s.setSelectedCategoryFilter);

  const [sort, setSort] = useState<SortOption>('views');
  const [lightboxVideoId, setLightboxVideoId] = useState<string | null>(null);
  const lightboxVideo = lightboxVideoId ? videos.find((v) => v.id === lightboxVideoId) ?? null : null;

  const availableCategories = Array.from(new Set(creators.map((c) => c.category).filter(Boolean)));

  const filteredVideos = videos
    .filter((v) => {
      if (selectedPlatformFilter && v.platform !== selectedPlatformFilter) return false;
      if (selectedCategoryFilter) {
        const creator = creators.find((c) => c.username === v.creator);
        if (!creator || creator.category !== selectedCategoryFilter) return false;
      }
      return true;
    })
    .sort((a, b) => {
      if (sort === 'views') return b.views - a.views;
      if (sort === 'date-posted') return new Date(b.datePosted).getTime() - new Date(a.datePosted).getTime();
      if (sort === 'date-analyzed') return new Date(b.dateAnalyzed).getTime() - new Date(a.dateAnalyzed).getTime();
      return 0;
    });

  return (
    <div className="flex-1 overflow-y-auto p-6 space-y-5">

        {/* Pipeline Status Bar */}
        {pipelineStatus.running && (
          <div className="flex items-center gap-3 p-3 bg-zinc-800 rounded-lg border border-amber-500/30">
            <Loader2 className="w-4 h-4 animate-spin text-amber-500 flex-shrink-0" />
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm text-zinc-300 capitalize">{pipelineStatus.phase}</span>
                <span className="text-xs text-zinc-500">{pipelineStatus.progress}%</span>
              </div>
              {pipelineStatus.message && (
                <div className="text-xs text-zinc-400 mb-1.5">{pipelineStatus.message}</div>
              )}
              <div className="h-1.5 bg-zinc-700 rounded">
                <div
                  className="h-full bg-amber-500 rounded transition-all"
                  style={{ width: `${pipelineStatus.progress}%` }}
                />
              </div>
              {pipelineStatus.errors.length > 0 && (
                <div className="text-xs text-red-400 mt-1">
                  {pipelineStatus.errors.length} error{pipelineStatus.errors.length !== 1 ? 's' : ''}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Filter Bar */}
        <div className="flex items-center gap-2 flex-wrap">
          <select
            value={selectedPlatformFilter ?? ''}
            onChange={(e) => setSelectedPlatformFilter(e.target.value || null)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
          >
            <option value="">All Platforms</option>
            <option value="instagram">Instagram</option>
            <option value="youtube">YouTube</option>
            <option value="tiktok">TikTok</option>
          </select>

          <select
            value={selectedCategoryFilter ?? ''}
            onChange={(e) => setSelectedCategoryFilter(e.target.value || null)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
          >
            <option value="">All Categories</option>
            {availableCategories.map((cat) => (
              <option key={cat} value={cat}>{cat}</option>
            ))}
          </select>

          <select
            value={sort}
            onChange={(e) => setSort(e.target.value as SortOption)}
            className="bg-zinc-800 border border-zinc-700 rounded px-3 py-1.5 text-xs text-zinc-100 focus:outline-none focus:border-amber-500"
          >
            <option value="views">Views (desc)</option>
            <option value="date-posted">Date Posted</option>
            <option value="date-analyzed">Date Analyzed</option>
          </select>
        </div>

        {/* Creators Section */}
        {creators.length > 0 && (
          <div>
            <div className="text-xs font-medium text-zinc-400 mb-2.5 uppercase tracking-wide">
              Creators ({creators.length})
            </div>
            <div className="grid grid-cols-3 gap-2.5 sm:grid-cols-4">
              {creators.map((creator) => (
                <CreatorCard key={creator.id} creator={creator} />
              ))}
            </div>
          </div>
        )}

        {/* Video Results */}
        {filteredVideos.length > 0 && (
          <div>
            <div className="text-xs font-medium text-zinc-400 mb-2.5 uppercase tracking-wide">
              Videos ({filteredVideos.length})
            </div>
            <div className="space-y-3">
              {filteredVideos.map((video) => (
                <VideoCard
                  key={video.id}
                  video={video}
                  onThumbnailClick={() => setLightboxVideoId(video.id)}
                />
              ))}
            </div>
          </div>
        )}

        {/* Lightbox */}
        {lightboxVideo && (
          <VideoLightbox
            video={lightboxVideo}
            onClose={() => setLightboxVideoId(null)}
          />
        )}

        {/* Empty State */}
        {creators.length === 0 && videos.length === 0 && !pipelineStatus.running && (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <TrendingUp className="w-10 h-10 text-zinc-600 mb-3" />
            <div className="text-sm font-medium text-zinc-400 mb-1">No data yet</div>
            <div className="text-xs text-zinc-600 max-w-xs">
              Use the terminal to add creators and run the pipeline. Try:{' '}
              <span className="text-zinc-500 font-mono">"track @mkbhd on YouTube"</span>
            </div>
          </div>
        )}
    </div>
  );
}

// ============================================================================
// Main Export — Tabbed container (Browser default, Intel tab 2)
// ============================================================================

type Tab = 'browser' | 'intel';

export function SocialIntelPage() {
  const [activeTab, setActiveTab] = useState<Tab>('browser');

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {/* Header with tabs */}
      <div className="px-4 py-2 border-b border-zinc-700 flex-shrink-0 flex items-center gap-4">
        <div className="flex items-center gap-2">
          <TrendingUp className="w-4 h-4 text-amber-500" />
          <span className="text-sm font-semibold text-zinc-100">Social Intel</span>
        </div>

        {/* Tab buttons */}
        <div className="flex items-center gap-0.5 bg-zinc-800 rounded-lg p-0.5">
          <button
            onClick={() => setActiveTab('browser')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'browser'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            Browser
          </button>
          <button
            onClick={() => setActiveTab('intel')}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium rounded-md transition-colors ${
              activeTab === 'intel'
                ? 'bg-zinc-700 text-zinc-100'
                : 'text-zinc-500 hover:text-zinc-300'
            }`}
          >
            <BarChart3 className="w-3.5 h-3.5" />
            Intel
          </button>
        </div>
      </div>

      {/* Tab content */}
      <div className="flex-1 overflow-hidden">
        {activeTab === 'browser' && <BrowserTab />}
        {activeTab === 'intel' && <IntelTab />}
      </div>
    </div>
  );
}
