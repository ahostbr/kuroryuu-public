/**
 * useDragOverlay — Prevents xterm.js (and other canvases/iframes) from
 * stealing mouse events during drag-to-resize or drag-to-move operations.
 *
 * When dragging starts, a transparent full-viewport overlay is injected into
 * the DOM so that `document.addEventListener('mousemove', ...)` receives
 * every event regardless of what's underneath the cursor.
 *
 * Usage:
 *   const { activate, deactivate } = useDragOverlay();
 *
 *   // In your mousedown handler:
 *   activate('col-resize');          // optional cursor style
 *   document.addEventListener('mousemove', onMove);
 *   document.addEventListener('mouseup', () => { deactivate(); ... });
 */

import { useRef, useCallback } from 'react';

const OVERLAY_ID = 'drag-overlay';

export function useDragOverlay() {
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const activate = useCallback((cursor?: string) => {
    // Reuse existing overlay if still in DOM (guard against double-activate)
    let el = document.getElementById(OVERLAY_ID) as HTMLDivElement | null;
    if (!el) {
      el = document.createElement('div');
      el.id = OVERLAY_ID;
      el.style.position = 'fixed';
      el.style.inset = '0';
      el.style.zIndex = '99999';
      el.style.background = 'transparent';
      document.body.appendChild(el);
    }
    el.style.cursor = cursor || 'default';
    overlayRef.current = el;
  }, []);

  const deactivate = useCallback(() => {
    const el = overlayRef.current || document.getElementById(OVERLAY_ID);
    if (el) el.remove();
    overlayRef.current = null;
  }, []);

  return { activate, deactivate };
}
