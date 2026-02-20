import { useEffect } from 'react';
import { useMarketingStore } from '../stores/marketing-store';
import type { ActiveJob } from '../types/marketing';

const GATEWAY = 'http://127.0.0.1:8200';

/**
 * Subscribes to the Gateway /v1/marketing/events SSE stream.
 * Any caller (GUI or agent curl) that triggers a Gateway generation endpoint
 * will cause the matching store state to update and panel to re-render.
 *
 * Mount once at the MarketingWorkspace level.
 */
export function useMarketingEvents(): void {
  useEffect(() => {
    const es = new EventSource(`${GATEWAY}/v1/marketing/events`);

    es.onmessage = (e: MessageEvent) => {
      try {
        const event = JSON.parse(e.data as string) as Record<string, unknown>;
        if (event['type'] !== 'complete') return;

        const tool = event['tool'] as string;

        switch (tool) {
          case 'research':
            useMarketingStore.setState({
              lastResearch: event as never,
              researchLoading: false,
            });
            break;
          case 'scrape':
            useMarketingStore.setState({
              lastScrape: event as never,
              scrapeLoading: false,
            });
            break;
          case 'image':
          case 'voiceover':
          case 'music': {
            const syntheticId = `external-${tool}`;
            if (event['type'] === 'progress') {
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
            } else if (event['type'] === 'complete') {
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
