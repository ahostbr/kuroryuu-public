import React, { useEffect, useRef } from 'react';
import { ActivityLogEntry } from '../../types/genui';
import { useSettingsStore } from '../../stores/settings-store';

interface GenUILoadingProps {
  progress: number;
  currentStep: string;
  activityLog: ActivityLogEntry[];
  componentCount: number;
  onCancel: () => void;
}

const STEPS = [
  { key: 'Content Analysis', icon: '\u25A0', label: 'ANALYZE' },
  { key: 'Layout Selection', icon: '\u25C6', label: 'LAYOUT' },
  { key: 'Component Generation', icon: '\u25C8', label: 'GENERATE' }
];

export function GenUILoading({
  progress,
  currentStep,
  activityLog,
  componentCount,
  onCancel
}: GenUILoadingProps) {
  const imperialMode = useSettingsStore((s) => s.appSettings.genuiImperialMode);
  const logEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activityLog]);

  const getStepStatus = (stepKey: string) => {
    const stepIndex = STEPS.findIndex((s) => s.key === stepKey);
    const currentIndex = STEPS.findIndex((s) => s.key === currentStep);

    if (stepIndex < currentIndex) return 'completed';
    if (stepIndex === currentIndex) return 'current';
    return 'pending';
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-8 py-12" style={{ background: 'var(--g-bg)' }}>
      {/* Scanline overlay */}
      <div className="genui-scanlines" />

      <div className="w-full max-w-4xl space-y-8 relative z-10">

        {/* Imperial Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-4 mb-2">
            <div style={{ width: '40px', height: '1px', background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--g-accent) 30%, transparent))' }} />
            <span style={{
              fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
              fontSize: '0.55rem',
              letterSpacing: '0.3em',
              color: 'color-mix(in srgb, var(--g-accent) 35%, transparent)',
              textTransform: 'uppercase',
            }}>
              Pipeline Active
            </span>
            <div style={{ width: '40px', height: '1px', background: 'linear-gradient(90deg, color-mix(in srgb, var(--g-accent) 30%, transparent), transparent)' }} />
          </div>

          <h2 style={{
            fontSize: '1.8rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'color-mix(in srgb, var(--g-fg) 90%, transparent)',
            fontFamily: imperialMode ? "Georgia, 'Times New Roman', serif" : "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif",
          }}>
            {imperialMode ? 'Forging Dashboard' : 'Creating Dashboard'}
          </h2>
          <p style={{
            fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
            fontSize: '0.65rem',
            letterSpacing: '0.15em',
            color: 'color-mix(in srgb, var(--g-muted) 50%, transparent)',
            textTransform: 'uppercase',
          }}>
            {imperialMode ? 'The imperial engine is processing your content' : 'Processing your content...'}
          </p>
        </div>

        {/* Progress Bar — Imperial */}
        <div className="space-y-2">
          <div className="flex justify-between" style={{
            fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
            fontSize: '0.6rem',
            letterSpacing: '0.1em',
            color: 'color-mix(in srgb, var(--g-accent) 45%, transparent)',
            textTransform: 'uppercase',
          }}>
            <span>Progress</span>
            <span style={{ color: 'color-mix(in srgb, var(--g-accent) 70%, transparent)', fontWeight: 600 }}>{Math.round(progress)}%</span>
          </div>

          <div
            className="relative overflow-hidden rounded-sm"
            style={{
              height: '6px',
              background: 'color-mix(in srgb, var(--g-card) 80%, transparent)',
              border: '1px solid color-mix(in srgb, var(--g-accent) 8%, transparent)',
            }}
          >
            {/* Progress fill */}
            <div
              className="h-full transition-all duration-700 ease-out relative"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, color-mix(in srgb, var(--g-crimson) 80%, transparent) 0%, color-mix(in srgb, var(--g-accent) 60%, transparent) 70%, color-mix(in srgb, var(--g-accent) 90%, transparent) 100%)',
                boxShadow: '0 0 12px color-mix(in srgb, var(--g-accent) 30%, transparent)',
              }}
            >
              {/* Leading glow edge */}
              <div style={{
                position: 'absolute',
                right: 0,
                top: '-2px',
                bottom: '-2px',
                width: '4px',
                background: 'color-mix(in srgb, var(--g-accent) 90%, transparent)',
                boxShadow: '0 0 8px color-mix(in srgb, var(--g-accent) 60%, transparent), 0 0 16px color-mix(in srgb, var(--g-accent) 30%, transparent)',
                borderRadius: '2px',
              }} />
            </div>
          </div>
        </div>

        {/* Step Indicators — Terminal Pipeline */}
        <div
          className="rounded-md overflow-hidden"
          style={{
            background: 'color-mix(in srgb, var(--g-card) 60%, transparent)',
            border: '1px solid color-mix(in srgb, var(--g-accent) 6%, transparent)',
          }}
        >
          <div className="grid grid-cols-3">
            {STEPS.map((step, index) => {
              const status = getStepStatus(step.key);
              const isCompleted = status === 'completed';
              const isCurrent = status === 'current';

              return (
                <div
                  key={step.key}
                  className="relative flex flex-col items-center py-5 px-3 transition-all duration-500"
                  style={{
                    background: isCurrent
                      ? 'color-mix(in srgb, var(--g-accent) 3%, transparent)'
                      : isCompleted
                        ? 'color-mix(in srgb, var(--g-crimson) 3%, transparent)'
                        : 'transparent',
                    borderRight: index < STEPS.length - 1 ? '1px solid color-mix(in srgb, var(--g-accent) 6%, transparent)' : 'none',
                  }}
                >
                  {/* Step number */}
                  <div
                    className="flex items-center justify-center rounded-sm mb-3 transition-all duration-500"
                    style={{
                      width: '40px',
                      height: '40px',
                      background: isCompleted
                        ? 'color-mix(in srgb, var(--g-crimson) 25%, transparent)'
                        : isCurrent
                          ? 'color-mix(in srgb, var(--g-accent) 8%, transparent)'
                          : 'color-mix(in srgb, var(--g-card) 50%, transparent)',
                      border: isCompleted
                        ? '1px solid color-mix(in srgb, var(--g-crimson) 40%, transparent)'
                        : isCurrent
                          ? '1px solid color-mix(in srgb, var(--g-accent) 20%, transparent)'
                          : '1px solid color-mix(in srgb, var(--g-muted) 10%, transparent)',
                      boxShadow: isCurrent
                        ? '0 0 15px color-mix(in srgb, var(--g-accent) 10%, transparent)'
                        : isCompleted
                          ? '0 0 10px color-mix(in srgb, var(--g-crimson) 15%, transparent)'
                          : 'none',
                    }}
                  >
                    {isCompleted ? (
                      <span style={{ color: 'color-mix(in srgb, var(--g-accent) 80%, transparent)', fontSize: '0.9rem' }}>{'\u2713'}</span>
                    ) : isCurrent ? (
                      <span style={{
                        color: 'color-mix(in srgb, var(--g-accent) 70%, transparent)',
                        fontSize: '0.8rem',
                        animation: 'genuiGlowPulse 2s ease-in-out infinite',
                      }}>
                        {step.icon}
                      </span>
                    ) : (
                      <span style={{ color: 'color-mix(in srgb, var(--g-muted) 30%, transparent)', fontSize: '0.8rem' }}>
                        {step.icon}
                      </span>
                    )}
                  </div>

                  {/* Label */}
                  <span style={{
                    fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                    fontSize: '0.6rem',
                    letterSpacing: '0.2em',
                    textTransform: 'uppercase',
                    color: isCompleted
                      ? 'color-mix(in srgb, var(--g-accent) 65%, transparent)'
                      : isCurrent
                        ? 'color-mix(in srgb, var(--g-fg) 80%, transparent)'
                        : 'color-mix(in srgb, var(--g-muted) 35%, transparent)',
                    fontWeight: isCurrent ? 600 : 400,
                  }}>
                    {step.label}
                  </span>

                  {/* Step name */}
                  <span style={{
                    fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                    fontSize: '0.5rem',
                    color: 'color-mix(in srgb, var(--g-muted) 30%, transparent)',
                    marginTop: '4px',
                  }}>
                    {step.key}
                  </span>

                  {/* Active indicator line at bottom */}
                  {isCurrent && (
                    <div style={{
                      position: 'absolute',
                      bottom: 0,
                      left: '20%',
                      right: '20%',
                      height: '2px',
                      background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--g-accent) 50%, transparent), transparent)',
                      animation: 'genuiGlowPulse 2s ease-in-out infinite',
                    }} />
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* Component Count — Imperial Metric */}
        <div
          className="text-center py-5 rounded-md"
          style={{
            background: 'color-mix(in srgb, var(--g-card) 60%, transparent)',
            border: '1px solid color-mix(in srgb, var(--g-accent) 8%, transparent)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{
            fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
            fontSize: '0.55rem',
            letterSpacing: '0.2em',
            color: 'color-mix(in srgb, var(--g-accent) 40%, transparent)',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            {imperialMode ? 'Components Forged' : 'Components Created'}
          </div>
          <div style={{
            fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
            fontSize: '2.5rem',
            fontWeight: 700,
            color: 'color-mix(in srgb, var(--g-fg) 95%, transparent)',
            lineHeight: 1,
            textShadow: '0 0 20px color-mix(in srgb, var(--g-accent) 15%, transparent)',
          }}>
            {componentCount}
          </div>

          {/* Bottom gold line */}
          <div style={{
            position: 'absolute',
            bottom: 0,
            left: '30%',
            right: '30%',
            height: '1px',
            background: 'linear-gradient(90deg, transparent, color-mix(in srgb, var(--g-accent) 30%, transparent), transparent)',
          }} />
        </div>

        {/* Activity Log — Terminal Output */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span style={{
              fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
              fontSize: '0.6rem',
              letterSpacing: '0.15em',
              color: 'color-mix(in srgb, var(--g-accent) 40%, transparent)',
              textTransform: 'uppercase',
            }}>
              System Log
            </span>
            <div style={{ flex: 1, height: '1px', background: 'color-mix(in srgb, var(--g-accent) 6%, transparent)' }} />
            <span style={{
              fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
              fontSize: '0.5rem',
              color: 'color-mix(in srgb, var(--g-muted) 30%, transparent)',
            }}>
              {activityLog.length} entries
            </span>
          </div>

          <div
            className="overflow-y-auto rounded-md"
            style={{
              height: '240px',
              background: 'color-mix(in srgb, var(--g-bg) 90%, transparent)',
              border: '1px solid color-mix(in srgb, var(--g-accent) 6%, transparent)',
              padding: '12px 16px',
              scrollbarWidth: 'thin',
              scrollbarColor: 'color-mix(in srgb, var(--g-accent) 15%, transparent) transparent',
            }}
          >
            {activityLog.length === 0 ? (
              <div className="flex items-center gap-2" style={{ animation: 'genuiGlowPulse 2s ease-in-out infinite' }}>
                <span style={{
                  fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                  fontSize: '0.7rem',
                  color: 'color-mix(in srgb, var(--g-accent) 30%, transparent)',
                }}>
                  {'\u25B6'} Awaiting pipeline output...
                </span>
              </div>
            ) : (
              activityLog.map((entry, index) => (
                <div
                  key={index}
                  className="flex gap-3 py-1 genui-reveal"
                  style={{
                    animationDelay: `${index * 0.05}s`,
                    borderBottom: '1px solid color-mix(in srgb, var(--g-accent) 2%, transparent)',
                  }}
                >
                  <span style={{
                    fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                    fontSize: '0.6rem',
                    color: 'color-mix(in srgb, var(--g-muted) 35%, transparent)',
                    whiteSpace: 'nowrap',
                  }}>
                    {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                  </span>
                  <span style={{
                    fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                    fontSize: '0.6rem',
                    color: entry.step === 'Component Generation'
                      ? 'color-mix(in srgb, var(--g-accent) 60%, transparent)'
                      : entry.step === 'Content Analysis'
                        ? 'rgba(59,130,246,0.6)'
                        : 'color-mix(in srgb, var(--g-crimson) 60%, transparent)',
                    whiteSpace: 'nowrap',
                    fontWeight: 600,
                  }}>
                    [{entry.step}]
                  </span>
                  <span style={{
                    fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                    fontSize: '0.6rem',
                    color: 'color-mix(in srgb, var(--g-fg) 60%, transparent)',
                  }}>
                    {entry.message}
                  </span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Cancel Button — Terminal Style */}
        <button
          onClick={onCancel}
          className="w-full py-3 rounded transition-all duration-300"
          style={{
            fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
            fontSize: '0.65rem',
            letterSpacing: '0.2em',
            textTransform: 'uppercase',
            color: 'color-mix(in srgb, var(--g-crimson) 60%, transparent)',
            background: 'color-mix(in srgb, var(--g-card) 60%, transparent)',
            border: '1px solid color-mix(in srgb, var(--g-crimson) 15%, transparent)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--g-crimson) 40%, transparent)';
            (e.currentTarget as HTMLElement).style.color = 'rgba(231,76,94,0.8)';
            (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--g-crimson) 8%, transparent)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--g-crimson) 15%, transparent)';
            (e.currentTarget as HTMLElement).style.color = 'color-mix(in srgb, var(--g-crimson) 60%, transparent)';
            (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--g-card) 60%, transparent)';
          }}
        >
          {'\u2716'} Abort Pipeline
        </button>
      </div>
    </div>
  );
}
