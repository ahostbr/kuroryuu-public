/**
 * FeedbackBar - Bottom bar for captured prompt output from playground iframe.
 * Shows the prompt text, copy button, send-to-Claude dropdown, and history toggle.
 */
import React, { useState, useEffect } from 'react';
import type { FeedbackEntry } from '../../types/genui';

interface FeedbackBarProps {
  promptOutput: string | null;
  feedbackHistory: FeedbackEntry[];
  onSend: (ptyId: string) => void;
  onCopy: () => void;
}

interface PtySession {
  id: string;
  label?: string;
}

export function FeedbackBar({ promptOutput, feedbackHistory, onSend, onCopy }: FeedbackBarProps) {
  const [ptySessions, setPtySessions] = useState<PtySession[]>([]);
  const [selectedPty, setSelectedPty] = useState('');
  const [showHistory, setShowHistory] = useState(false);
  const [copied, setCopied] = useState(false);

  // Refresh PTY session list
  useEffect(() => {
    async function loadSessions() {
      try {
        const sessions = await (window as any).electronAPI?.pty?.list?.();
        if (Array.isArray(sessions)) {
          const mapped = sessions.map((s: any) => ({
            id: s.id || s.termId || String(s),
            label: s.label || s.name || s.id || String(s),
          }));
          setPtySessions(mapped);
          if (mapped.length > 0 && !selectedPty) {
            setSelectedPty(mapped[0].id);
          }
        }
      } catch {
        setPtySessions([]);
      }
    }
    loadSessions();
    const interval = setInterval(loadSessions, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleCopy = () => {
    if (!promptOutput) return;
    navigator.clipboard.writeText(promptOutput).then(() => {
      setCopied(true);
      onCopy();
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleSend = () => {
    if (!selectedPty || !promptOutput) return;
    onSend(selectedPty);
  };

  if (!promptOutput && feedbackHistory.length === 0) return null;

  const monoFont = "ui-monospace, 'Share Tech Mono', monospace";

  return (
    <div
      className="shrink-0"
      style={{
        borderTop: '1px solid color-mix(in srgb, var(--g-accent) 15%, transparent)',
        background: 'color-mix(in srgb, var(--g-card) 95%, transparent)',
      }}
    >
      {/* Prompt output display */}
      {promptOutput && (
        <div className="px-4 py-3">
          <div className="flex items-start gap-3">
            <div className="flex-1 min-w-0">
              <div
                className="flex items-center gap-2 mb-1"
                style={{
                  fontFamily: monoFont,
                  fontSize: '0.55rem',
                  letterSpacing: '0.15em',
                  color: 'color-mix(in srgb, var(--g-accent) 50%, transparent)',
                  textTransform: 'uppercase',
                }}
              >
                {'\u25C8'} Prompt Output Captured
              </div>
              <div
                style={{
                  fontFamily: monoFont,
                  fontSize: '0.75rem',
                  lineHeight: 1.5,
                  color: 'color-mix(in srgb, var(--g-fg) 80%, transparent)',
                  maxHeight: '4.5em',
                  overflow: 'auto',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {promptOutput}
              </div>
            </div>

            {/* Action buttons */}
            <div className="flex items-center gap-2 shrink-0 pt-3">
              {/* Copy */}
              <button
                onClick={handleCopy}
                style={{
                  fontFamily: monoFont,
                  fontSize: '0.6rem',
                  letterSpacing: '0.1em',
                  padding: '4px 12px',
                  borderRadius: '3px',
                  border: '1px solid color-mix(in srgb, var(--g-accent) 20%, transparent)',
                  background: copied
                    ? 'color-mix(in srgb, var(--g-success) 15%, transparent)'
                    : 'color-mix(in srgb, var(--g-accent) 5%, transparent)',
                  color: copied
                    ? 'color-mix(in srgb, var(--g-success) 80%, transparent)'
                    : 'color-mix(in srgb, var(--g-accent) 60%, transparent)',
                  cursor: 'pointer',
                  textTransform: 'uppercase',
                }}
              >
                {copied ? 'Copied!' : 'Copy'}
              </button>

              {/* Send to Claude PTY */}
              {ptySessions.length > 0 && (
                <div className="flex items-center gap-1">
                  <select
                    value={selectedPty}
                    onChange={(e) => setSelectedPty(e.target.value)}
                    style={{
                      fontFamily: monoFont,
                      fontSize: '0.6rem',
                      padding: '4px 8px',
                      borderRadius: '3px 0 0 3px',
                      border: '1px solid color-mix(in srgb, var(--g-accent) 20%, transparent)',
                      borderRight: 'none',
                      background: 'color-mix(in srgb, var(--g-card) 80%, transparent)',
                      color: 'color-mix(in srgb, var(--g-fg) 60%, transparent)',
                      outline: 'none',
                      maxWidth: '140px',
                    }}
                  >
                    {ptySessions.map(s => (
                      <option key={s.id} value={s.id}>{s.label}</option>
                    ))}
                  </select>
                  <button
                    onClick={handleSend}
                    style={{
                      fontFamily: monoFont,
                      fontSize: '0.6rem',
                      letterSpacing: '0.1em',
                      padding: '4px 12px',
                      borderRadius: '0 3px 3px 0',
                      border: '1px solid color-mix(in srgb, var(--g-crimson) 30%, transparent)',
                      background: 'color-mix(in srgb, var(--g-crimson) 10%, transparent)',
                      color: 'color-mix(in srgb, var(--g-crimson) 80%, transparent)',
                      cursor: 'pointer',
                      textTransform: 'uppercase',
                    }}
                  >
                    Send to Claude
                  </button>
                </div>
              )}

              {/* History toggle */}
              {feedbackHistory.length > 0 && (
                <button
                  onClick={() => setShowHistory(!showHistory)}
                  style={{
                    fontFamily: monoFont,
                    fontSize: '0.6rem',
                    padding: '4px 8px',
                    borderRadius: '3px',
                    border: '1px solid color-mix(in srgb, var(--g-muted) 20%, transparent)',
                    background: showHistory
                      ? 'color-mix(in srgb, var(--g-accent) 10%, transparent)'
                      : 'transparent',
                    color: 'color-mix(in srgb, var(--g-muted) 60%, transparent)',
                    cursor: 'pointer',
                  }}
                >
                  History ({feedbackHistory.length})
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* History panel */}
      {showHistory && feedbackHistory.length > 0 && (
        <div
          className="px-4 py-2"
          style={{
            borderTop: '1px solid color-mix(in srgb, var(--g-accent) 8%, transparent)',
            maxHeight: '200px',
            overflow: 'auto',
          }}
        >
          <div
            style={{
              fontFamily: monoFont,
              fontSize: '0.55rem',
              letterSpacing: '0.1em',
              color: 'color-mix(in srgb, var(--g-muted) 50%, transparent)',
              textTransform: 'uppercase',
              marginBottom: '6px',
            }}
          >
            Feedback History
          </div>
          {[...feedbackHistory].reverse().map((entry, i) => (
            <div
              key={i}
              className="flex items-start gap-2 py-1"
              style={{
                borderBottom: '1px solid color-mix(in srgb, var(--g-border) 30%, transparent)',
              }}
            >
              <span style={{
                fontFamily: monoFont,
                fontSize: '0.55rem',
                color: 'color-mix(in srgb, var(--g-muted) 40%, transparent)',
                whiteSpace: 'nowrap',
              }}>
                {new Date(entry.timestamp).toLocaleTimeString()}
              </span>
              <span style={{
                fontFamily: monoFont,
                fontSize: '0.55rem',
                padding: '0 4px',
                borderRadius: '2px',
                background: entry.sentTo === 'claude-pty'
                  ? 'color-mix(in srgb, var(--g-crimson) 10%, transparent)'
                  : 'color-mix(in srgb, var(--g-accent) 10%, transparent)',
                color: entry.sentTo === 'claude-pty'
                  ? 'color-mix(in srgb, var(--g-crimson) 60%, transparent)'
                  : 'color-mix(in srgb, var(--g-accent) 60%, transparent)',
              }}>
                {entry.sentTo === 'claude-pty' ? `PTY:${entry.targetPtyId?.slice(0, 8)}` : 'clipboard'}
              </span>
              <span style={{
                fontFamily: monoFont,
                fontSize: '0.6rem',
                color: 'color-mix(in srgb, var(--g-fg) 50%, transparent)',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
                whiteSpace: 'nowrap',
              }}>
                {entry.promptText.slice(0, 100)}{entry.promptText.length > 100 ? '...' : ''}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
