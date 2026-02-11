import { useEffect, useRef } from 'react';
import { useMarketingStore } from '../stores/marketing-store';

/**
 * File watcher hook for marketing assets in tools/marketing/output/
 * Polls Gateway endpoint for asset list changes.
 */
export function useMarketingAssets(enabled = true) {
  const loadAssets = useMarketingStore((s) => s.loadAssets);
  const assets = useMarketingStore((s) => s.assets);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!enabled) return;

    // Initial load
    loadAssets();

    // Poll every 5 seconds
    intervalRef.current = setInterval(loadAssets, 5000);

    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [enabled, loadAssets]);

  return assets;
}
