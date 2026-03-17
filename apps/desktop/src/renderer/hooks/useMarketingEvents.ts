import { useEffect } from 'react';
import { useMarketingStore } from '../stores/marketing-store';
import { useSocialIntelStore } from '../stores/social-intel-store';
import type { ActiveJob } from '../types/marketing';
import type { Creator, VideoResult, PipelineStatus } from '../stores/social-intel-store';

const GATEWAY = 'http://127.0.0.1:8200';

/**
 * Subscribes to the Gateway /v1/marketing/events SSE stream.
 * Any caller (GUI or agent curl) that triggers a Gateway generation endpoint
 * will cause the matching store state to update and panel to re-render.
 *
 * Handles both marketing tool events and social-intel pipeline events.
 *
 * Mount once at the MarketingWorkspace level.
 */
export function useMarketingEvents(): void {
  useEffect(() => {
    const es = new EventSource(`${GATEWAY}/v1/marketing/events`);

    es.onmessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data as string) as Record<string, unknown>;
        const eventType = event['type'] as string;
        if (eventType === 'connected') return;

        // Route social-intel events to the social-intel store
        if (eventType?.startsWith('social-intel:')) {
          _handleSocialIntelEvent(eventType, event);
          return;
        }

        const tool = event['tool'] as string;

        switch (tool) {
          case 'research':
            if (eventType === 'complete') {
              useMarketingStore.setState({
                lastResearch: event as never,
                researchLoading: false,
              });
            }
            break;
          case 'scrape':
            if (eventType === 'complete') {
              useMarketingStore.setState({
                lastScrape: event as never,
                scrapeLoading: false,
              });
            }
            break;
          case 'image':
          case 'voiceover':
          case 'music': {
            const syntheticId = `external-${tool}`;
            if (eventType === 'progress') {
              const store = useMarketingStore.getState();
              const existing = store.activeJobs.find((j) => j.id === syntheticId);
              if (!existing) {
                store.addJob({
                  id: syntheticId,
                  type: tool as ActiveJob['type'],
                  status: 'running',
                  progress: 0,
                  message: 'Agent generating...',
                  startedAt: new Date().toISOString(),
                });
              }
              store.updateJob(syntheticId, {
                progress: event['progress'] as number,
                message: event['message'] as string,
              });
            } else if (eventType === 'complete') {
              useMarketingStore.getState().removeJob(syntheticId);
              void useMarketingStore.getState().loadAssets();
            }
            break;
          }
          default:
            break;
        }
      } catch {
        // Malformed event — ignore
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects on error — no manual retry needed
    };

    return () => {
      es.close();
    };
  }, []);
}

/**
 * Route social-intel SSE events to the social-intel Zustand store.
 *
 * Event types emitted by skills via POST /v1/marketing/events/emit:
 * - social-intel:creator-added    { data: Creator }
 * - social-intel:creator-updated  { data: { id, ...partialCreator } }
 * - social-intel:creator-removed  { data: { id } }
 * - social-intel:video-analyzed   { data: VideoResult }
 * - social-intel:concept-generated { data: { videoId, concepts } }
 * - social-intel:pipeline-progress { data: Partial<PipelineStatus> }
 * - social-intel:pipeline-complete { data: Partial<PipelineStatus> }
 */
function _handleSocialIntelEvent(
  eventType: string,
  event: Record<string, unknown>,
): void {
  const store = useSocialIntelStore.getState();
  const data = event['data'] as Record<string, unknown> | undefined;
  if (!data) return;

  switch (eventType) {
    case 'social-intel:creator-added':
      store.addCreator(data as unknown as Creator);
      break;

    case 'social-intel:creator-updated': {
      const id = data['id'] as string;
      if (id) store.updateCreator(id, data as Partial<Creator>);
      break;
    }

    case 'social-intel:creator-removed': {
      const id = data['id'] as string;
      if (id) store.removeCreator(id);
      break;
    }

    case 'social-intel:video-analyzed':
      store.addVideoResult(data as unknown as VideoResult);
      break;

    case 'social-intel:concept-generated': {
      // Update an existing video's concepts field
      const videoId = data['videoId'] as string;
      const concepts = data['concepts'] as string;
      if (videoId && concepts) {
        useSocialIntelStore.setState((s) => ({
          videos: s.videos.map((v) =>
            v.id === videoId ? { ...v, concepts } : v
          ),
        }));
      }
      break;
    }

    case 'social-intel:video-updated': {
      // Update fields on an existing video (e.g. thumbnail, likes, comments)
      const videoId = data['id'] as string;
      if (videoId) {
        useSocialIntelStore.setState((s) => ({
          videos: s.videos.map((v) =>
            v.id === videoId ? { ...v, ...(data as Partial<VideoResult>) } : v
          ),
        }));
      }
      break;
    }

    case 'social-intel:videos-clear':
      store.clearVideos();
      break;

    case 'social-intel:pipeline-progress':
      store.updatePipeline(data as Partial<PipelineStatus>);
      break;

    case 'social-intel:pipeline-complete':
      store.updatePipeline({
        running: false,
        phase: 'done',
        ...(data as Partial<PipelineStatus>),
      });
      break;

    default:
      break;
  }
}
