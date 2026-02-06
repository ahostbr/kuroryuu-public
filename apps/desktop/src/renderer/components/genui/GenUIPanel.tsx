/**
 * GenUIPanel - Main orchestrator for the Generative UI standalone window.
 * Routes between 3 states: idle (input) -> loading (analyzing/generating) -> complete (dashboard)
 */
import React, { useState } from 'react';
import { useGenUI } from '../../hooks/useGenUI';
import { useSettingsStore } from '../../stores/settings-store';
import { GenUIInput } from './GenUIInput';
import { GenUILoading } from './GenUILoading';
import { GenUIDashboard } from './GenUIDashboard';
import { GenUISourceView } from './GenUISourceView';

export function GenUIPanel(): React.ReactElement {
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
  } = useGenUI();

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
        <GenUIInput onGenerate={handleGenerate} />
      </div>
    );
  }

  // Loading state — show progress
  if (isLoading) {
    return (
      <div className={rootClass}>
        <GenUILoading
          progress={progress}
          currentStep={currentStep}
          activityLog={activityLog}
          componentCount={components.length}
          onCancel={handleReset}
        />
      </div>
    );
  }

  // Complete state — show dashboard or source
  if (isComplete) {
    if (showSource) {
      return (
        <div className={rootClass}>
          <GenUISourceView
            markdown={lastMarkdown}
            components={components}
            onClose={() => setShowSource(false)}
          />
        </div>
      );
    }

    return (
      <div className={rootClass}>
        <GenUIDashboard
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
      <GenUIInput onGenerate={handleGenerate} />
    </div>
  );
}

export default GenUIPanel;
