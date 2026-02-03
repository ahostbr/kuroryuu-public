/**
 * RichCardRenderer - Routes RichCard types to appropriate visualization components
 *
 * Supported card types:
 * - rag-results: RAGResultsCard (k_rag query results)
 * - file-tree: FileTreeCard (k_files results) - TODO
 * - session-state: SessionStateCard (k_session state) - TODO
 * - tool-output: ToolOutputCard (generic tool output) - TODO
 */

import type { RichCard, RAGResultsData, FileTreeData, ToolOutputData } from '../../types/insights';
import { RAGResultsCard } from './cards/RAGResultsCard';
import { FileCode, AlertCircle } from 'lucide-react';

interface RichCardRendererProps {
  card: RichCard;
  collapsed?: boolean;
}

function UnknownCard({ card }: { card: RichCard }) {
  return (
    <div className="border border-border/50 rounded-lg p-3 mt-2 bg-card/30">
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <AlertCircle className="w-4 h-4" />
        <span>Unknown card type: {card.type}</span>
      </div>
    </div>
  );
}

function FileTreeCard({ data }: { data: FileTreeData }) {
  // Placeholder for file tree visualization
  return (
    <div className="border border-border rounded-lg p-3 mt-2 bg-card/50">
      <div className="flex items-center gap-2 text-sm text-foreground mb-2">
        <FileCode className="w-4 h-4 text-primary" />
        <span className="font-medium">Files</span>
        <span className="text-xs text-muted-foreground">({data.files.length})</span>
      </div>
      <div className="space-y-1 text-xs font-mono text-muted-foreground max-h-40 overflow-y-auto">
        {data.files.slice(0, 10).map((file, idx) => (
          <div key={idx} className="flex items-center gap-2">
            <span className={file.type === 'directory' ? 'text-primary' : ''}>
              {file.type === 'directory' ? '📁' : '📄'}
            </span>
            <span className="truncate">{file.path}</span>
          </div>
        ))}
        {data.files.length > 10 && (
          <div className="text-primary">+{data.files.length - 10} more...</div>
        )}
      </div>
    </div>
  );
}

function ToolOutputCard({ data }: { data: ToolOutputData }) {
  // Generic tool output display
  return (
    <div className="border border-border rounded-lg p-3 mt-2 bg-card/50">
      <div className="flex items-center gap-2 text-sm text-foreground mb-2">
        <FileCode className="w-4 h-4 text-muted-foreground" />
        <span className="font-medium">{data.toolName}</span>
      </div>
      <pre className="text-xs font-mono text-muted-foreground overflow-x-auto max-h-40 overflow-y-auto whitespace-pre-wrap">
        {data.output}
      </pre>
    </div>
  );
}

export function RichCardRenderer({ card, collapsed = false }: RichCardRendererProps) {
  switch (card.type) {
    case 'rag-results':
      return <RAGResultsCard data={card.data as RAGResultsData} collapsed={collapsed} />;

    case 'file-tree':
      return <FileTreeCard data={card.data as FileTreeData} />;

    case 'tool-output':
      return <ToolOutputCard data={card.data as ToolOutputData} />;

    case 'session-state':
      // TODO: Implement session state card
      return <UnknownCard card={card} />;

    default:
      return <UnknownCard card={card} />;
  }
}
