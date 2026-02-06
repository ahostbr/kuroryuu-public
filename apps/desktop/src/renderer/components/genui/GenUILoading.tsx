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
  { key: 'Content Analysis', icon: '📄' },
  { key: 'Layout Selection', icon: '🎨' },
  { key: 'Component Generation', icon: '⚙️' }
];

export function GenUILoading({
  progress,
  currentStep,
  activityLog,
  componentCount,
  onCancel
}: GenUILoadingProps) {
  const logEndRef = useRef<HTMLDivElement>(null);

  // Auto-scroll activity log to bottom
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
    <div className="flex flex-col items-center justify-center min-h-screen px-8 py-12 bg-background">
      <div className="w-full max-w-4xl space-y-8">
        {/* Header */}
        <div className="text-center space-y-2">
          <h2 className="text-3xl font-bold text-foreground">Generating Dashboard</h2>
          <p className="text-muted-foreground">Please wait while we build your interface...</p>
        </div>

        {/* Progress Bar */}
        <div className="space-y-2">
          <div className="flex justify-between text-sm text-muted-foreground">
            <span>Progress</span>
            <span>{Math.round(progress)}%</span>
          </div>
          <div className="w-full h-3 bg-card border border-border rounded-full overflow-hidden">
            <div
              className="h-full bg-gradient-to-r from-primary to-yellow-600 transition-all duration-500 ease-out progress-glow"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>

        {/* Step Indicators */}
        <div className="flex justify-between items-center">
          {STEPS.map((step, index) => {
            const status = getStepStatus(step.key);
            return (
              <div key={step.key} className="flex flex-col items-center space-y-2 flex-1">
                {/* Step Icon */}
                <div
                  className={`w-16 h-16 flex items-center justify-center rounded-full border-2 transition-all ${
                    status === 'completed'
                      ? 'bg-primary border-primary text-white'
                      : status === 'current'
                        ? 'bg-card border-primary text-primary animate-pulse'
                        : 'bg-card border-border text-muted-foreground'
                  }`}
                >
                  {status === 'completed' ? (
                    <span className="text-2xl">✓</span>
                  ) : status === 'current' ? (
                    <span className="text-2xl animate-spin">◌</span>
                  ) : (
                    <span className="text-2xl">{step.icon}</span>
                  )}
                </div>

                {/* Step Label */}
                <p
                  className={`text-sm font-medium ${
                    status === 'completed' || status === 'current'
                      ? 'text-foreground'
                      : 'text-muted-foreground'
                  }`}
                >
                  {step.key}
                </p>

                {/* Connector Line */}
                {index < STEPS.length - 1 && (
                  <div className="absolute w-1/3 h-0.5 top-8 left-1/2 transform -translate-x-1/2" style={{ left: `${(index + 0.5) * 33.33}%` }}>
                    <div
                      className={`h-full transition-colors ${
                        getStepStatus(STEPS[index + 1].key) === 'completed'
                          ? 'bg-primary'
                          : 'bg-border'
                      }`}
                    />
                  </div>
                )}
              </div>
            );
          })}
        </div>

        {/* Component Count */}
        <div className="text-center p-4 bg-card border border-border rounded-lg">
          <p className="text-sm text-muted-foreground">Components Generated</p>
          <p className="text-3xl font-bold text-primary">{componentCount}</p>
        </div>

        {/* Activity Log */}
        <div className="space-y-2">
          <h3 className="text-lg font-semibold text-foreground">Activity Log</h3>
          <div className="h-64 overflow-y-auto bg-card border border-border rounded-lg p-4 space-y-2 scrollbar-thin scrollbar-thumb-border scrollbar-track-transparent">
            {activityLog.length === 0 ? (
              <p className="text-sm text-muted-foreground italic">Waiting for activity...</p>
            ) : (
              activityLog.map((entry, index) => (
                <div key={index} className="flex gap-3 text-sm animate-fadeIn">
                  <span className="text-muted-foreground shrink-0 font-mono">
                    {new Date(entry.timestamp).toLocaleTimeString()}
                  </span>
                  <span className="text-primary font-medium shrink-0">[{entry.step}]</span>
                  <span className="text-foreground">{entry.message}</span>
                </div>
              ))
            )}
            <div ref={logEndRef} />
          </div>
        </div>

        {/* Cancel Button */}
        <button
          onClick={onCancel}
          className="w-full px-6 py-3 text-lg font-semibold bg-secondary text-foreground border border-border rounded-lg hover:bg-secondary/80 transition-colors"
        >
          Cancel
        </button>
      </div>

      {/* CSS Animations */}
      <style>{`
        @keyframes fadeIn {
          from {
            opacity: 0;
            transform: translateY(-4px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        .animate-fadeIn {
          animation: fadeIn 0.3s ease-out;
        }

        @keyframes glow {
          0%, 100% {
            box-shadow: 0 0 10px rgba(220, 38, 38, 0.3);
          }
          50% {
            box-shadow: 0 0 20px rgba(220, 38, 38, 0.6);
          }
        }

        .progress-glow {
          animation: glow 2s ease-in-out infinite;
        }

        .scrollbar-thin {
          scrollbar-width: thin;
        }

        .scrollbar-thumb-border::-webkit-scrollbar-thumb {
          background-color: hsl(var(--border));
          border-radius: 4px;
        }

        .scrollbar-track-transparent::-webkit-scrollbar-track {
          background-color: transparent;
        }

        .scrollbar-thin::-webkit-scrollbar {
          width: 6px;
        }
      `}</style>
    </div>
  );
}
