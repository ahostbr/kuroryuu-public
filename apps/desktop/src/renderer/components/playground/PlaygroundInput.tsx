import React, { useState, useRef, useEffect } from 'react';
import { useSettingsStore } from '../../stores/settings-store';
import { usePlayground } from '../../hooks/usePlayground';
import type { RenderMode, PlaygroundFile } from '../../types/genui';

interface PlaygroundInputProps {
  onGenerate: (markdown: string, layoutOverride?: string) => void;
}

const SAMPLE_DOCUMENTS = {
  tutorial: `# Getting Started with React Hooks

## Step 1: Understanding useState

\`\`\`javascript
const [count, setCount] = useState(0);
\`\`\`

### Key Points
- Hooks replace class components
- useState returns [value, setter]
- Effects run after render

## Step 2: useEffect

UseEffect handles side effects...

| Hook | Purpose |
|------|--------|
| useState | State management |
| useEffect | Side effects |
| useCallback | Memoize callbacks |`,

  research: `# AI Market Analysis 2025

## Executive Summary

The AI market is projected to reach **$196B** by 2025, with a **23% CAGR**.

## Key Findings

- GPT-4 adoption: **78%** of enterprises
- Open source LLMs grew **340%**
- AI spending: **$45B** quarterly

## Methodology

We analyzed 500+ companies across 12 sectors...

### Data Sources
- Gartner Magic Quadrant
- McKinsey Global Survey
- Stack Overflow Developer Survey 2025`,

  api: `# REST API Reference

## Authentication

All requests require a Bearer token.

\`\`\`bash
curl -H "Authorization: Bearer sk-xxx" https://api.example.com/v1/users
\`\`\`

## Endpoints

### GET /v1/users

List all users.

| Parameter | Type | Required |
|-----------|------|----------|
| page | int | No |
| limit | int | No |

### POST /v1/users

Create a new user.

\`\`\`json
{ "name": "John", "email": "john@example.com" }
\`\`\``
};

const LAYOUT_OPTIONS = [
  { value: '', label: '\u25C8 Auto-detect', desc: 'AI selects optimal layout' },
  { value: 'instructional_layout', label: '\u2318 Instructional', desc: 'Tutorials, step-by-step' },
  { value: 'data_layout', label: '\u25A0 Data', desc: 'Statistics, research' },
  { value: 'news_layout', label: '\u25B6 News', desc: 'Articles, stories' },
  { value: 'list_layout', label: '\u2261 List', desc: 'Resources, checklists' },
  { value: 'summary_layout', label: '\u25C6 Summary', desc: 'Quick references' },
  { value: 'reference_layout', label: '\u2630 Reference', desc: 'API docs, specs' },
  { value: 'media_layout', label: '\u25CB Media', desc: 'Visual content' }
];

const SAMPLE_BUTTONS = [
  { key: 'tutorial', label: 'Tutorial', icon: '\u2318', color: 'rgba(59,130,246,0.6)' },
  { key: 'research', label: 'Research Paper', icon: '\u25A0', color: 'color-mix(in srgb, var(--g-accent) 60%, transparent)' },
  { key: 'api', label: 'API Docs', icon: '\u25B6', color: 'rgba(34,197,94,0.6)' },
] as const;

export function PlaygroundInput({ onGenerate }: PlaygroundInputProps) {
  const [markdown, setMarkdown] = useState('');
  const [layoutOverride, setLayoutOverride] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const imperialMode = useSettingsStore((s) => s.appSettings.genuiImperialMode);
  const toggleMode = useSettingsStore((s) => s.setGenUIImperialMode);

  const { renderMode, setRenderMode, playgroundFiles, refreshPlaygroundFiles, loadPlaygroundHTML } = usePlayground();

  useEffect(() => {
    refreshPlaygroundFiles();
  }, []);

  const handleGenerate = () => {
    if (!markdown.trim()) return;
    onGenerate(markdown, layoutOverride || undefined);
  };

  const loadSample = (sample: string) => {
    setMarkdown(sample);
    textareaRef.current?.focus();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.md')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        setMarkdown(text);
      };
      reader.readAsText(file);
    }
  };

  const charCount = markdown.length;
  const wordCount = markdown.trim() ? markdown.trim().split(/\s+/).length : 0;

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-8 py-12" style={{ background: 'var(--g-bg)' }}>
      {/* Scanline overlay */}
      <div className="genui-scanlines" />

      <div className="w-full max-w-4xl space-y-6 relative z-10">

        {/* Imperial Header */}
        <div className="text-center space-y-3 mb-10">
          {/* Decorative top line */}
          <div className="flex items-center justify-center gap-4 mb-4">
            <div style={{ width: '60px', height: '1px', background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--g-accent) 40%, transparent))' }} />
            <span style={{
              fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
              fontSize: '0.6rem',
              letterSpacing: '0.3em',
              color: 'color-mix(in srgb, var(--g-accent) 40%, transparent)',
              textTransform: 'uppercase',
            }}>
              {imperialMode ? '\u25C8 Kuroryuu Playground Engine \u25C8' : 'Playground Engine'}
            </span>
            <div style={{ width: '60px', height: '1px', background: 'linear-gradient(90deg, color-mix(in srgb, var(--g-accent) 40%, transparent), transparent)' }} />
          </div>

          <h1
            style={{
              fontSize: '2.5rem',
              fontWeight: 700,
              letterSpacing: '0.05em',
              background: 'linear-gradient(135deg, color-mix(in srgb, var(--g-accent) 95%, transparent) 0%, color-mix(in srgb, var(--g-accent) 90%, transparent) 40%, color-mix(in srgb, var(--g-accent) 70%, transparent) 100%)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
              textShadow: 'none',
              fontFamily: imperialMode ? "Georgia, 'Times New Roman', serif" : "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
            }}
          >
            Claude Playground
          </h1>
          <p style={{
            fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
            fontSize: '0.75rem',
            letterSpacing: '0.15em',
            color: 'color-mix(in srgb, var(--g-accent) 45%, transparent)',
            textTransform: 'uppercase',
          }}>
            {imperialMode ? 'Transform Markdown into Imperial Dashboards' : 'Transform Markdown into Interactive Dashboards'}
          </p>

          {/* Theme toggle button */}
          <div className="flex justify-center mt-2">
            <button
              onClick={() => toggleMode(!imperialMode)}
              style={{
                fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                fontSize: '0.55rem',
                letterSpacing: '0.1em',
                padding: '3px 10px',
                borderRadius: '3px',
                border: '1px solid color-mix(in srgb, var(--g-accent) 20%, transparent)',
                background: 'color-mix(in srgb, var(--g-accent) 5%, transparent)',
                color: 'color-mix(in srgb, var(--g-accent) 60%, transparent)',
                cursor: 'pointer',
                textTransform: 'uppercase' as const,
              }}
            >
              {imperialMode ? '\u25C8 Imperial' : '\u25C7 Themed'}
            </button>
          </div>
        </div>

        {/* Mode Toggle */}
        <div className="flex justify-center gap-1"
          style={{
            padding: '3px',
            borderRadius: '4px',
            background: 'color-mix(in srgb, var(--g-card) 60%, transparent)',
            border: '1px solid color-mix(in srgb, var(--g-accent) 8%, transparent)',
            display: 'inline-flex',
            margin: '0 auto',
          }}
        >
          {([
            { mode: 'components' as RenderMode, label: 'Component Mode', icon: '\u25A0' },
            { mode: 'playground' as RenderMode, label: 'Playground Mode', icon: '\u25B6' },
          ]).map(({ mode, label, icon }) => (
            <button
              key={mode}
              onClick={() => {
                setRenderMode(mode);
                if (mode === 'playground') refreshPlaygroundFiles();
              }}
              style={{
                fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                fontSize: '0.6rem',
                letterSpacing: '0.1em',
                padding: '5px 16px',
                borderRadius: '3px',
                border: 'none',
                background: renderMode === mode
                  ? 'color-mix(in srgb, var(--g-accent) 15%, transparent)'
                  : 'transparent',
                color: renderMode === mode
                  ? 'color-mix(in srgb, var(--g-accent) 80%, transparent)'
                  : 'color-mix(in srgb, var(--g-muted) 50%, transparent)',
                cursor: 'pointer',
                textTransform: 'uppercase',
                transition: 'all 0.2s ease',
              }}
            >
              {icon} {label}
            </button>
          ))}
        </div>

        {/* Playground Mode: File picker */}
        {renderMode === 'playground' && (
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <span style={{
                fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                fontSize: '0.6rem',
                letterSpacing: '0.15em',
                color: 'color-mix(in srgb, var(--g-accent) 40%, transparent)',
                textTransform: 'uppercase',
              }}>
                Load Playground
              </span>
              <div style={{ flex: 1, height: '1px', background: 'color-mix(in srgb, var(--g-accent) 6%, transparent)' }} />
              <button
                onClick={() => refreshPlaygroundFiles()}
                style={{
                  fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                  fontSize: '0.55rem',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  border: '1px solid color-mix(in srgb, var(--g-accent) 15%, transparent)',
                  background: 'transparent',
                  color: 'color-mix(in srgb, var(--g-accent) 40%, transparent)',
                  cursor: 'pointer',
                }}
              >
                Refresh
              </button>
            </div>

            {playgroundFiles.length === 0 ? (
              <div
                className="text-center py-8 rounded"
                style={{
                  border: '1px dashed color-mix(in srgb, var(--g-accent) 15%, transparent)',
                  background: 'color-mix(in srgb, var(--g-card) 50%, transparent)',
                }}
              >
                <div style={{
                  fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                  fontSize: '0.7rem',
                  color: 'color-mix(in srgb, var(--g-muted) 50%, transparent)',
                  marginBottom: '8px',
                }}>
                  No playground files found
                </div>
                <div style={{
                  fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                  fontSize: '0.6rem',
                  color: 'color-mix(in srgb, var(--g-muted) 30%, transparent)',
                }}>
                  Ask Claude to create one with /k-playground or /playground
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                {playgroundFiles.map((file) => (
                  <button
                    key={file.path}
                    onClick={() => loadPlaygroundHTML(file.path)}
                    className="w-full flex items-center justify-between px-4 py-3 rounded transition-all duration-200"
                    style={{
                      background: 'color-mix(in srgb, var(--g-card) 80%, transparent)',
                      border: '1px solid color-mix(in srgb, var(--g-accent) 8%, transparent)',
                      cursor: 'pointer',
                      textAlign: 'left',
                    }}
                    onMouseEnter={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--g-accent) 25%, transparent)';
                      (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--g-accent) 4%, transparent)';
                    }}
                    onMouseLeave={(e) => {
                      (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--g-accent) 8%, transparent)';
                      (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--g-card) 80%, transparent)';
                    }}
                  >
                    <div className="flex items-center gap-3">
                      <span style={{ color: 'color-mix(in srgb, var(--g-accent) 50%, transparent)', fontSize: '1rem' }}>{'\u25B6'}</span>
                      <div>
                        <div style={{
                          fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                          fontSize: '0.7rem',
                          color: 'color-mix(in srgb, var(--g-fg) 80%, transparent)',
                        }}>
                          {file.name}
                        </div>
                        <div style={{
                          fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                          fontSize: '0.55rem',
                          color: 'color-mix(in srgb, var(--g-muted) 40%, transparent)',
                        }}>
                          {(file.size / 1024).toFixed(1)} KB
                        </div>
                      </div>
                    </div>
                    <span style={{
                      fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                      fontSize: '0.55rem',
                      color: 'color-mix(in srgb, var(--g-muted) 30%, transparent)',
                    }}>
                      {new Date(file.mtime).toLocaleDateString()}
                    </span>
                  </button>
                ))}
              </div>
            )}

            {/* Bottom decorative line */}
            <div className="flex items-center justify-center pt-4">
              <div style={{ width: '120px', height: '1px', background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--g-accent) 15%, transparent), transparent)' }} />
            </div>
          </div>
        )}

        {/* Component Mode: Markdown input (existing) */}
        {renderMode === 'components' && (<>

        {/* Textarea — Terminal-Style */}
        <div
          className={`relative rounded-md overflow-hidden transition-all duration-300`}
          style={{
            border: isDragging
              ? '1px solid color-mix(in srgb, var(--g-accent) 50%, transparent)'
              : '1px solid color-mix(in srgb, var(--g-accent) 10%, transparent)',
            boxShadow: isDragging
              ? '0 0 20px color-mix(in srgb, var(--g-accent) 10%, transparent), inset 0 0 30px color-mix(in srgb, var(--g-accent) 3%, transparent)'
              : 'inset 0 0 30px color-mix(in srgb, var(--g-bg) 30%, transparent)',
          }}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          {/* Terminal header bar */}
          <div
            className="flex items-center justify-between px-4 py-2"
            style={{
              background: 'color-mix(in srgb, var(--g-card) 90%, transparent)',
              borderBottom: '1px solid color-mix(in srgb, var(--g-accent) 8%, transparent)',
            }}
          >
            <div className="flex items-center gap-2">
              <span style={{ color: 'color-mix(in srgb, var(--g-crimson) 60%, transparent)', fontSize: '0.5rem' }}>{'\u25CF'}</span>
              <span style={{ color: 'color-mix(in srgb, var(--g-accent) 40%, transparent)', fontSize: '0.5rem' }}>{'\u25CF'}</span>
              <span style={{ color: 'color-mix(in srgb, var(--g-muted) 30%, transparent)', fontSize: '0.5rem' }}>{'\u25CF'}</span>
              <span style={{
                fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                fontSize: '0.6rem',
                color: 'color-mix(in srgb, var(--g-accent) 35%, transparent)',
                marginLeft: '8px',
                letterSpacing: '0.1em',
              }}>
                markdown_input.md
              </span>
            </div>
            <div style={{
              fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
              fontSize: '0.55rem',
              color: 'color-mix(in srgb, var(--g-muted) 40%, transparent)',
              letterSpacing: '0.05em',
            }}>
              {wordCount > 0 ? `${wordCount} words \u00B7 ${charCount} chars` : 'empty'}
            </div>
          </div>

          <textarea
            ref={textareaRef}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder={'// Paste markdown content here\n// or drag & drop a .md file...\n//\n// \u25C8 Supports headers, code blocks, tables\n// \u25C8 Lists, links, and emphasis\n// \u25C8 The richer the content, the better the dashboard'}
            style={{
              width: '100%',
              height: '360px',
              padding: '16px',
              fontFamily: "ui-monospace, 'Share Tech Mono', 'Cascadia Code', monospace",
              fontSize: '0.8rem',
              lineHeight: '1.6',
              color: 'color-mix(in srgb, var(--g-fg) 80%, transparent)',
              background: 'color-mix(in srgb, var(--g-bg) 95%, transparent)',
              border: 'none',
              outline: 'none',
              resize: 'none',
              caretColor: 'color-mix(in srgb, var(--g-accent) 80%, transparent)',
            }}
          />

          {/* Drag overlay */}
          {isDragging && (
            <div
              className="absolute inset-0 flex flex-col items-center justify-center gap-3"
              style={{ background: 'color-mix(in srgb, var(--g-bg) 92%, transparent)' }}
            >
              <div style={{
                width: '60px',
                height: '60px',
                borderRadius: '50%',
                border: '2px solid color-mix(in srgb, var(--g-accent) 30%, transparent)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                animation: 'genuiGlowPulse 2s ease-in-out infinite',
              }}>
                <span style={{ fontSize: '1.5rem', color: 'color-mix(in srgb, var(--g-accent) 60%, transparent)' }}>{'\u2193'}</span>
              </div>
              <span style={{
                fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                fontSize: '0.7rem',
                letterSpacing: '0.2em',
                color: 'color-mix(in srgb, var(--g-accent) 60%, transparent)',
                textTransform: 'uppercase',
              }}>
                Drop .md file to load
              </span>
            </div>
          )}
        </div>

        {/* Sample Documents — Terminal Buttons */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span style={{
              fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
              fontSize: '0.6rem',
              letterSpacing: '0.15em',
              color: 'color-mix(in srgb, var(--g-accent) 40%, transparent)',
              textTransform: 'uppercase',
            }}>
              Templates
            </span>
            <div style={{ flex: 1, height: '1px', background: 'color-mix(in srgb, var(--g-accent) 6%, transparent)' }} />
          </div>

          <div className="flex gap-3">
            {SAMPLE_BUTTONS.map((btn) => (
              <button
                key={btn.key}
                onClick={() => loadSample(SAMPLE_DOCUMENTS[btn.key])}
                className="group flex items-center gap-2 px-4 py-2.5 rounded transition-all duration-300"
                style={{
                  background: 'color-mix(in srgb, var(--g-card) 80%, transparent)',
                  border: '1px solid color-mix(in srgb, var(--g-accent) 8%, transparent)',
                  cursor: 'pointer',
                }}
                onMouseEnter={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--g-accent) 25%, transparent)';
                  (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--g-accent) 4%, transparent)';
                }}
                onMouseLeave={(e) => {
                  (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--g-accent) 8%, transparent)';
                  (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--g-card) 80%, transparent)';
                }}
              >
                <span style={{ color: btn.color, fontSize: '0.7rem' }}>{btn.icon}</span>
                <span style={{
                  fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                  fontSize: '0.65rem',
                  letterSpacing: '0.1em',
                  color: 'color-mix(in srgb, var(--g-fg) 60%, transparent)',
                  textTransform: 'uppercase',
                }}>
                  {btn.label}
                </span>
              </button>
            ))}
          </div>
        </div>

        {/* Layout Override — Imperial Select */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span style={{
              fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
              fontSize: '0.6rem',
              letterSpacing: '0.15em',
              color: 'color-mix(in srgb, var(--g-accent) 40%, transparent)',
              textTransform: 'uppercase',
            }}>
              Layout Override
            </span>
            <div style={{ flex: 1, height: '1px', background: 'color-mix(in srgb, var(--g-accent) 6%, transparent)' }} />
          </div>

          <select
            id="layout-override"
            value={layoutOverride}
            onChange={(e) => setLayoutOverride(e.target.value)}
            style={{
              width: '100%',
              padding: '10px 16px',
              fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
              fontSize: '0.7rem',
              letterSpacing: '0.05em',
              color: 'color-mix(in srgb, var(--g-fg) 70%, transparent)',
              background: 'color-mix(in srgb, var(--g-card) 80%, transparent)',
              border: '1px solid color-mix(in srgb, var(--g-accent) 10%, transparent)',
              borderRadius: '4px',
              outline: 'none',
              cursor: 'pointer',
              appearance: 'none',
              backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M0 0l5 6 5-6z' fill='rgba(201,169,98,0.3)'/%3E%3C/svg%3E")`,
              backgroundRepeat: 'no-repeat',
              backgroundPosition: 'right 12px center',
            }}
          >
            {LAYOUT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label} — {option.desc}
              </option>
            ))}
          </select>
        </div>

        {/* Generate Button — Imperial */}
        <button
          onClick={handleGenerate}
          disabled={!markdown.trim()}
          className="group relative w-full overflow-hidden rounded transition-all duration-500"
          style={{
            padding: '14px 24px',
            background: markdown.trim()
              ? 'linear-gradient(135deg, color-mix(in srgb, var(--g-crimson) 60%, transparent) 0%, color-mix(in srgb, var(--g-crimson) 30%, transparent) 50%, color-mix(in srgb, var(--g-accent) 15%, transparent) 100%)'
              : 'color-mix(in srgb, var(--g-card) 60%, transparent)',
            border: markdown.trim()
              ? '1px solid color-mix(in srgb, var(--g-accent) 25%, transparent)'
              : '1px solid color-mix(in srgb, var(--g-muted) 15%, transparent)',
            cursor: markdown.trim() ? 'pointer' : 'not-allowed',
            opacity: markdown.trim() ? 1 : 0.4,
          }}
          onMouseEnter={(e) => {
            if (markdown.trim()) {
              (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--g-accent) 50%, transparent)';
              (e.currentTarget as HTMLElement).style.boxShadow = '0 0 30px color-mix(in srgb, var(--g-crimson) 20%, transparent), 0 0 60px color-mix(in srgb, var(--g-accent) 5%, transparent)';
            }
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = markdown.trim() ? 'color-mix(in srgb, var(--g-accent) 25%, transparent)' : 'color-mix(in srgb, var(--g-muted) 15%, transparent)';
            (e.currentTarget as HTMLElement).style.boxShadow = 'none';
          }}
        >
          <div className="flex items-center justify-center gap-3">
            <span style={{
              fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
              fontSize: '0.7rem',
              letterSpacing: '0.3em',
              color: markdown.trim() ? 'color-mix(in srgb, var(--g-accent) 85%, transparent)' : 'color-mix(in srgb, var(--g-muted) 40%, transparent)',
              textTransform: 'uppercase',
              fontWeight: 600,
            }}>
              {'\u25C8'} Generate Dashboard {'\u25C8'}
            </span>
          </div>

          {/* Animated bottom glow line */}
          {markdown.trim() && (
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: '10%',
                right: '10%',
                height: '1px',
                background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--g-accent) 40%, transparent), transparent)',
                animation: 'genuiGlowPulse 3s ease-in-out infinite',
              }}
            />
          )}
        </button>

        {/* Bottom decorative line */}
        <div className="flex items-center justify-center pt-4">
          <div style={{ width: '120px', height: '1px', background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--g-accent) 15%, transparent), transparent)' }} />
        </div>

        </>)}
      </div>
    </div>
  );
}
