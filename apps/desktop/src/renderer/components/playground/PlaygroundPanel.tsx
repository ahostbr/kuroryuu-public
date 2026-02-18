/**
 * PlaygroundPanel - Main orchestrator for the Claude Playground standalone window.
 * Routes between states: idle (input) -> loading (analyzing/generating) -> complete (dashboard | playground)
 * Two render modes:
 *   - components: Markdown -> Gateway SSE -> A2UI React components -> zone layout
 *   - playground: Claude-generated HTML -> sandboxed iframe -> prompt output -> feedback
 */
import React, { useState } from 'react';
import { usePlayground } from '../../hooks/usePlayground';
import { useSettingsStore } from '../../stores/settings-store';
import { PlaygroundInput } from './PlaygroundInput';
import { PlaygroundLoading } from './PlaygroundLoading';
import { PlaygroundDashboard } from './PlaygroundDashboard';
import { PlaygroundSourceView } from './PlaygroundSourceView';
import { PlaygroundViewer } from './PlaygroundViewer';
import { FeedbackBar } from './FeedbackBar';

export function PlaygroundPanel(): React.ReactElement {
  const imperialMode = useSettingsStore((s) => s.appSettings.genuiImperialMode);

  const {
    status,
    progress,
    currentStep,
    documentTitle,
    documentType,
    layoutType,
    components,
    componentsByZone,
    activityLog,
    errorMessage,
    generateDashboard,
    reset,
    isIdle,
    isLoading,
    isComplete,
    isError,
    // Playground mode
    renderMode,
    playgroundHTML,
    playgroundFileName,
    promptOutput,
    feedbackHistory,
    capturePromptOutput,
    sendFeedback,
    addFeedbackEntry,
  } = usePlayground();

  const [showSource, setShowSource] = useState(false);
  const [lastMarkdown, setLastMarkdown] = useState('');

  const handleGenerate = (markdown: string, layoutOverride?: string) => {
    setLastMarkdown(markdown);
    setShowSource(false);
    generateDashboard(markdown, layoutOverride);
  };

  const handleReset = () => {
    setShowSource(false);
    setLastMarkdown('');
    reset();
  };

  const handleRegenerate = () => {
    if (lastMarkdown) {
      setShowSource(false);
      generateDashboard(lastMarkdown);
    }
  };

  const handleCopyFeedback = () => {
    if (promptOutput) {
      addFeedbackEntry({
        timestamp: new Date().toISOString(),
        promptText: promptOutput,
        sentTo: 'clipboard',
      });
    }
  };

  const rootClass = `genui-root h-screen w-screen${imperialMode ? ' genui-imperial' : ''}`;

  // Error state — show error with retry
  if (isError) {
    return (
      <div className={rootClass}>
        <div className="h-full w-full flex flex-col items-center justify-center bg-background text-foreground p-8">
          <div className="max-w-lg text-center space-y-4">
            <div className="text-4xl mb-4">!!!</div>
            <h2 className="text-xl font-bold text-destructive">Generation Failed</h2>
            <p className="text-muted-foreground">{errorMessage || 'An unknown error occurred.'}</p>
            <div className="flex gap-3 justify-center mt-6">
              {lastMarkdown && (
                <button
                  onClick={handleRegenerate}
                  className="px-4 py-2 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors"
                >
                  Retry
                </button>
              )}
              <button
                onClick={handleReset}
                className="px-4 py-2 bg-secondary text-secondary-foreground rounded-md hover:bg-secondary/80 transition-colors"
              >
                Start Over
              </button>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Idle state — show input
  if (isIdle) {
    return (
      <div className={rootClass}>
        <PlaygroundInput onGenerate={handleGenerate} />
      </div>
    );
  }

  // Loading state — show progress
  if (isLoading) {
    return (
      <div className={rootClass}>
        <PlaygroundLoading
          progress={progress}
          currentStep={currentStep}
          activityLog={activityLog}
          componentCount={components.length}
          onCancel={handleReset}
        />
      </div>
    );
  }

  // Complete state — show dashboard, source, or playground iframe
  if (isComplete) {
    // Playground mode: sandboxed iframe + feedback bar
    if (renderMode === 'playground' && playgroundHTML) {
      return (
        <div className={`${rootClass} flex flex-col`}>
          <PlaygroundViewer
            html={playgroundHTML}
            fileName={playgroundFileName || undefined}
            onPromptCapture={capturePromptOutput}
          />
          <FeedbackBar
            promptOutput={promptOutput}
            feedbackHistory={feedbackHistory}
            onSend={sendFeedback}
            onCopy={handleCopyFeedback}
          />
          {/* Back button overlay */}
          <button
            onClick={handleReset}
            className="absolute top-2 right-2 z-50"
            style={{
              fontFamily: "ui-monospace, 'Share Tech Mono', monospace",
              fontSize: '0.6rem',
              letterSpacing: '0.1em',
              padding: '4px 10px',
              borderRadius: '3px',
              border: '1px solid color-mix(in srgb, var(--g-accent) 20%, transparent)',
              background: 'color-mix(in srgb, var(--g-card) 90%, transparent)',
              color: 'color-mix(in srgb, var(--g-accent) 60%, transparent)',
              cursor: 'pointer',
              textTransform: 'uppercase',
            }}
          >
            {'\u2190'} Back
          </button>
        </div>
      );
    }

    if (showSource) {
      return (
        <div className={rootClass}>
          <PlaygroundSourceView
            markdown={lastMarkdown}
            components={components}
            onClose={() => setShowSource(false)}
          />
        </div>
      );
    }

    return (
      <div className={rootClass}>
        <PlaygroundDashboard
          documentTitle={documentTitle}
          documentType={documentType}
          layoutType={layoutType}
          componentsByZone={componentsByZone}
          onRegenerate={handleRegenerate}
          onToggleSource={() => setShowSource(true)}
          onReset={handleReset}
        />
      </div>
    );
  }

  // Fallback
  return (
    <div className={rootClass}>
      <PlaygroundInput onGenerate={handleGenerate} />
    </div>
  );
}

export default PlaygroundPanel;
