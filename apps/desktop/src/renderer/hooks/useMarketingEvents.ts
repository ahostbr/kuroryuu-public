import { useEffect } from 'react';
import { useMarketingStore } from '../stores/marketing-store';

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
            // Refresh asset gallery and clear matching running job
            void useMarketingStore.getState().loadAssets();
            useMarketingStore.setState((s) => ({
              activeJobs: s.activeJobs.filter(
                (j) => !(j.type === tool && j.status === 'running'),
              ),
            }));
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
