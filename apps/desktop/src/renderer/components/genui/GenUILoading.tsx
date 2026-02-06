import React, { useEffect, useRef } from 'react';
import { ActivityLogEntry } from '../../types/genui';

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
    <div className="flex flex-col items-center justify-center min-h-screen px-8 py-12" style={{ background: 'rgba(13,13,15,1)' }}>
      {/* Scanline overlay */}
      <div className="genui-scanlines" />

      <div className="w-full max-w-4xl space-y-8 relative z-10">

        {/* Imperial Header */}
        <div className="text-center space-y-3">
          <div className="flex items-center justify-center gap-4 mb-2">
            <div style={{ width: '40px', height: '1px', background: 'linear-gradient(90deg, transparent, rgba(201,169,98,0.3))' }} />
            <span style={{
              fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
              fontSize: '0.55rem',
              letterSpacing: '0.3em',
              color: 'rgba(201,169,98,0.35)',
              textTransform: 'uppercase',
            }}>
              Pipeline Active
            </span>
            <div style={{ width: '40px', height: '1px', background: 'linear-gradient(90deg, rgba(201,169,98,0.3), transparent)' }} />
          </div>

          <h2 style={{
            fontSize: '1.8rem',
            fontWeight: 700,
            letterSpacing: '0.08em',
            color: 'rgba(250,250,250,0.9)',
            fontFamily: "Georgia, 'Times New Roman', serif",
          }}>
            Forging Dashboard
          </h2>
          <p style={{
            fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
            fontSize: '0.65rem',
            letterSpacing: '0.15em',
            color: 'rgba(122,117,109,0.5)',
            textTransform: 'uppercase',
          }}>
            The imperial engine is processing your content
          </p>
        </div>

        {/* Progress Bar — Imperial */}
        <div className="space-y-2">
          <div className="flex justify-between" style={{
            fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
            fontSize: '0.6rem',
            letterSpacing: '0.1em',
            color: 'rgba(201,169,98,0.45)',
            textTransform: 'uppercase',
          }}>
            <span>Progress</span>
            <span style={{ color: 'rgba(201,169,98,0.7)', fontWeight: 600 }}>{Math.round(progress)}%</span>
          </div>

          <div
            className="relative overflow-hidden rounded-sm"
            style={{
              height: '6px',
              background: 'rgba(17,17,19,0.8)',
              border: '1px solid rgba(201,169,98,0.08)',
            }}
          >
            {/* Progress fill */}
            <div
              className="h-full transition-all duration-700 ease-out relative"
              style={{
                width: `${progress}%`,
                background: 'linear-gradient(90deg, rgba(139,38,53,0.8) 0%, rgba(201,169,98,0.6) 70%, rgba(201,169,98,0.9) 100%)',
                boxShadow: '0 0 12px rgba(201,169,98,0.3)',
              }}
            >
              {/* Leading glow edge */}
              <div style={{
                position: 'absolute',
                right: 0,
                top: '-2px',
                bottom: '-2px',
                width: '4px',
                background: 'rgba(201,169,98,0.9)',
                boxShadow: '0 0 8px rgba(201,169,98,0.6), 0 0 16px rgba(201,169,98,0.3)',
                borderRadius: '2px',
              }} />
            </div>
          </div>
        </div>

        {/* Step Indicators — Terminal Pipeline */}
        <div
          className="rounded-md overflow-hidden"
          style={{
            background: 'rgba(17,17,19,0.6)',
            border: '1px solid rgba(201,169,98,0.06)',
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
                      ? 'rgba(201,169,98,0.03)'
                      : isCompleted
                        ? 'rgba(139,38,53,0.03)'
                        : 'transparent',
                    borderRight: index < STEPS.length - 1 ? '1px solid rgba(201,169,98,0.06)' : 'none',
                  }}
                >
                  {/* Step number */}
                  <div
                    className="flex items-center justify-center rounded-sm mb-3 transition-all duration-500"
                    style={{
                      width: '40px',
                      height: '40px',
                      background: isCompleted
                        ? 'rgba(139,38,53,0.25)'
                        : isCurrent
                          ? 'rgba(201,169,98,0.08)'
                          : 'rgba(17,17,19,0.5)',
                      border: isCompleted
                        ? '1px solid rgba(139,38,53,0.4)'
                        : isCurrent
                          ? '1px solid rgba(201,169,98,0.2)'
                          : '1px solid rgba(122,117,109,0.1)',
                      boxShadow: isCurrent
                        ? '0 0 15px rgba(201,169,98,0.1)'
                        : isCompleted
                          ? '0 0 10px rgba(139,38,53,0.15)'
                          : 'none',
                    }}
                  >
                    {isCompleted ? (
                      <span style={{ color: 'rgba(201,169,98,0.8)', fontSize: '0.9rem' }}>{'\u2713'}</span>
                    ) : isCurrent ? (
                      <span style={{
                        color: 'rgba(201,169,98,0.7)',
                        fontSize: '0.8rem',
                        animation: 'genuiGlowPulse 2s ease-in-out infinite',
                      }}>
                        {step.icon}
                      </span>
                    ) : (
                      <span style={{ color: 'rgba(122,117,109,0.3)', fontSize: '0.8rem' }}>
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
                      ? 'rgba(201,169,98,0.65)'
                      : isCurrent
                        ? 'rgba(250,250,250,0.8)'
                        : 'rgba(122,117,109,0.35)',
                    fontWeight: isCurrent ? 600 : 400,
                  }}>
                    {step.label}
                  </span>

                  {/* Step name */}
                  <span style={{
                    fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                    fontSize: '0.5rem',
                    color: 'rgba(122,117,109,0.3)',
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
                      background: 'linear-gradient(90deg, transparent, rgba(201,169,98,0.5), transparent)',
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
            background: 'rgba(17,17,19,0.6)',
            border: '1px solid rgba(201,169,98,0.08)',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{
            fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
            fontSize: '0.55rem',
            letterSpacing: '0.2em',
            color: 'rgba(201,169,98,0.4)',
            textTransform: 'uppercase',
            marginBottom: '8px',
          }}>
            Components Forged
          </div>
          <div style={{
            fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
            fontSize: '2.5rem',
            fontWeight: 700,
            color: 'rgba(250,250,250,0.95)',
            lineHeight: 1,
            textShadow: '0 0 20px rgba(201,169,98,0.15)',
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
            background: 'linear-gradient(90deg, transparent, rgba(201,169,98,0.3), transparent)',
          }} />
        </div>

        {/* Activity Log — Terminal Output */}
        <div className="space-y-3">
          <div className="flex items-center gap-3">
            <span style={{
              fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
              fontSize: '0.6rem',
              letterSpacing: '0.15em',
              color: 'rgba(201,169,98,0.4)',
              textTransform: 'uppercase',
            }}>
              System Log
            </span>
            <div style={{ flex: 1, height: '1px', background: 'rgba(201,169,98,0.06)' }} />
            <span style={{
              fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
              fontSize: '0.5rem',
              color: 'rgba(122,117,109,0.3)',
            }}>
              {activityLog.length} entries
            </span>
          </div>

          <div
            className="overflow-y-auto rounded-md"
            style={{
              height: '240px',
              background: 'rgba(10,10,12,0.9)',
              border: '1px solid rgba(201,169,98,0.06)',
              padding: '12px 16px',
              scrollbarWidth: 'thin',
              scrollbarColor: 'rgba(201,169,98,0.15) transparent',
            }}
          >
            {activityLog.length === 0 ? (
              <div className="flex items-center gap-2" style={{ animation: 'genuiGlowPulse 2s ease-in-out infinite' }}>
                <span style={{
                  fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                  fontSize: '0.7rem',
                  color: 'rgba(201,169,98,0.3)',
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
                    borderBottom: '1px solid rgba(201,169,98,0.02)',
                  }}
                >
                  <span style={{
                    fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                    fontSize: '0.6rem',
                    color: 'rgba(122,117,109,0.35)',
                    whiteSpace: 'nowrap',
                  }}>
                    {new Date(entry.timestamp).toLocaleTimeString('en-US', { hour12: false })}
                  </span>
                  <span style={{
                    fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                    fontSize: '0.6rem',
                    color: entry.step === 'Component Generation'
                      ? 'rgba(201,169,98,0.6)'
                      : entry.step === 'Content Analysis'
                        ? 'rgba(59,130,246,0.6)'
                        : 'rgba(139,38,53,0.6)',
                    whiteSpace: 'nowrap',
                    fontWeight: 600,
                  }}>
                    [{entry.step}]
                  </span>
                  <span style={{
                    fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
                    fontSize: '0.6rem',
                    color: 'rgba(250,250,250,0.6)',
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
            color: 'rgba(139,38,53,0.6)',
            background: 'rgba(17,17,19,0.6)',
            border: '1px solid rgba(139,38,53,0.15)',
            cursor: 'pointer',
          }}
          onMouseEnter={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(139,38,53,0.4)';
            (e.currentTarget as HTMLElement).style.color = 'rgba(231,76,94,0.8)';
            (e.currentTarget as HTMLElement).style.background = 'rgba(139,38,53,0.08)';
          }}
          onMouseLeave={(e) => {
            (e.currentTarget as HTMLElement).style.borderColor = 'rgba(139,38,53,0.15)';
            (e.currentTarget as HTMLElement).style.color = 'rgba(139,38,53,0.6)';
            (e.currentTarget as HTMLElement).style.background = 'rgba(17,17,19,0.6)';
          }}
        >
          {'\u2716'} Abort Pipeline
        </button>
      </div>
    </div>
  );
}
