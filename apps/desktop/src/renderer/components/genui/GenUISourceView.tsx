import React, { useState } from 'react';
import { A2UIComponent } from '../../types/genui';

interface GenUISourceViewProps {
  markdown: string;
  components: A2UIComponent[];
  onClose: () => void;
}

export const GenUISourceView: React.FC<GenUISourceViewProps> = ({
  markdown,
  components,
  onClose
}) => {
  const [activeTab, setActiveTab] = useState<'markdown' | 'components'>('markdown');
  const [copySuccess, setCopySuccess] = useState<string | null>(null);

  const handleCopy = async (content: string, label: string) => {
    try {
      await navigator.clipboard.writeText(content);
      setCopySuccess(label);
      setTimeout(() => setCopySuccess(null), 2000);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  const componentJson = JSON.stringify(components, null, 2);

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header with tabs and close button */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-border bg-card">
        <div className="flex items-center gap-1">
          <button
            onClick={() => setActiveTab('markdown')}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              activeTab === 'markdown'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            Markdown Source
          </button>
          <button
            onClick={() => setActiveTab('components')}
            className={`px-3 py-1.5 text-sm font-medium rounded transition-colors ${
              activeTab === 'components'
                ? 'bg-primary/10 text-primary'
                : 'text-muted-foreground hover:text-foreground hover:bg-muted/50'
            }`}
          >
            Component Data
          </button>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() =>
              handleCopy(activeTab === 'markdown' ? markdown : componentJson, activeTab)
            }
            className="px-3 py-1.5 text-sm font-medium rounded bg-muted text-foreground hover:bg-muted/80 transition-colors relative"
          >
            {copySuccess === activeTab ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={onClose}
            className="px-3 py-1.5 text-sm font-medium rounded bg-muted text-foreground hover:bg-muted/80 transition-colors"
          >
            Close
          </button>
        </div>
      </div>

      {/* Content area */}
      <div className="flex-1 overflow-hidden p-4">
        <div className="h-full rounded-lg border border-border bg-card/50 overflow-hidden">
          {activeTab === 'markdown' ? (
            <pre className="h-full overflow-auto p-4 text-sm font-mono text-foreground bg-black/20">
              <code>{markdown}</code>
            </pre>
          ) : (
            <pre className="h-full overflow-auto p-4 text-sm font-mono text-foreground bg-black/20">
              <code>{componentJson}</code>
            </pre>
          )}
        </div>
      </div>
    </div>
  );
};
