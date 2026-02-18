/**
 * PlaygroundViewer - Sandboxed iframe renderer for Claude-generated playground HTML.
 * Injects a postMessage bridge shim to capture prompt output from the playground.
 */
import React, { useRef, useEffect, useCallback } from 'react';

interface PlaygroundViewerProps {
  html: string;
  fileName?: string;
  onPromptCapture: (text: string) => void;
}

/** Script injected before </body> to bridge prompt output from iframe to parent */
const BRIDGE_SHIM = `
<script>
(function() {
  // Watch for prompt output elements and relay via postMessage
  function findAndRelay() {
    // Look for common prompt output patterns:
    // 1. Element with id="prompt-output" or data-prompt-output
    // 2. Textarea with class containing "prompt"
    // 3. Pre/code blocks inside a prompt container
    var selectors = [
      '#prompt-output',
      '[data-prompt-output]',
      '.prompt-output',
      '.prompt-text',
      '#promptOutput',
    ];
    for (var i = 0; i < selectors.length; i++) {
      var el = document.querySelector(selectors[i]);
      if (el) return el;
    }
    return null;
  }

  // Intercept copy buttons — when user clicks copy, also relay content
  document.addEventListener('click', function(e) {
    var btn = e.target.closest('button');
    if (!btn) return;
    var text = btn.textContent || '';
    if (text.match(/copy|Copy|COPY/)) {
      // Try to find the prompt output near this button
      var container = btn.closest('.prompt-section, .prompt-container, .output-section, [class*="prompt"]');
      if (container) {
        var pre = container.querySelector('pre, code, textarea, .prompt-text, #prompt-output, [data-prompt-output]');
        if (pre) {
          var content = pre.value || pre.textContent || '';
          if (content.trim()) {
            window.parent.postMessage({ type: 'playground-prompt', text: content.trim() }, '*');
          }
        }
      }
    }
  }, true);

  // MutationObserver to detect when prompt output changes
  var observer = new MutationObserver(function() {
    var el = findAndRelay();
    if (el) {
      var content = el.value || el.textContent || '';
      if (content.trim()) {
        window.parent.postMessage({ type: 'playground-prompt', text: content.trim() }, '*');
      }
    }
  });

  // Start observing once DOM is ready
  if (document.body) {
    observer.observe(document.body, { childList: true, subtree: true, characterData: true });
  } else {
    document.addEventListener('DOMContentLoaded', function() {
      observer.observe(document.body, { childList: true, subtree: true, characterData: true });
    });
  }
})();
</script>`;

function injectBridge(html: string): string {
  // Inject the bridge shim before </body> or at the end
  const bodyClose = html.lastIndexOf('</body>');
  if (bodyClose !== -1) {
    return html.slice(0, bodyClose) + BRIDGE_SHIM + html.slice(bodyClose);
  }
  return html + BRIDGE_SHIM;
}

export function PlaygroundViewer({ html, fileName, onPromptCapture }: PlaygroundViewerProps) {
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const handleMessage = useCallback((event: MessageEvent) => {
    // Only accept messages from our iframe
    if (!event.data || event.data.type !== 'playground-prompt') return;
    if (typeof event.data.text === 'string' && event.data.text.trim()) {
      onPromptCapture(event.data.text.trim());
    }
  }, [onPromptCapture]);

  useEffect(() => {
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [handleMessage]);

  const injectedHTML = injectBridge(html);

  return (
    <div className="flex flex-col h-full w-full">
      {/* Header bar */}
      <div
        className="flex items-center justify-between px-4 py-2 shrink-0"
        style={{
          background: 'color-mix(in srgb, var(--g-card) 90%, transparent)',
          borderBottom: '1px solid color-mix(in srgb, var(--g-accent) 8%, transparent)',
        }}
      >
        <div className="flex items-center gap-2">
          <span style={{ color: 'color-mix(in srgb, var(--g-success) 60%, transparent)', fontSize: '0.5rem' }}>{'\u25CF'}</span>
          <span style={{
            fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
            fontSize: '0.6rem',
            color: 'color-mix(in srgb, var(--g-accent) 50%, transparent)',
            letterSpacing: '0.1em',
          }}>
            {fileName || 'playground.html'}
          </span>
        </div>
        <span style={{
          fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
          fontSize: '0.55rem',
          color: 'color-mix(in srgb, var(--g-muted) 40%, transparent)',
          letterSpacing: '0.05em',
        }}>
          SANDBOX MODE
        </span>
      </div>

      {/* Sandboxed iframe */}
      <iframe
        ref={iframeRef}
        sandbox="allow-scripts"
        srcDoc={injectedHTML}
        title="Claude Playground"
        style={{
          width: '100%',
          flex: 1,
          border: 'none',
          background: '#fff',
        }}
      />
    </div>
  );
}
