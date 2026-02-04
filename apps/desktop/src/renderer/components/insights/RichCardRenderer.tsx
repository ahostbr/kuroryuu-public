/**
 * RichCardRenderer - Routes RichCard types to appropriate visualization components
 *
 * Supported card types (18 total):
 * - rag-results: RAGResultsCard (k_rag query results)
 * - file-tree: FileTreeCard (k_files results)
 * - symbol-map: SymbolMapCard (k_repo_intel results)
 * - terminal: TerminalCard (k_pty results)
 * - checkpoint: CheckpointCard (k_checkpoint results)
 * - session: SessionCard (k_session results)
 * - inbox: InboxCard (k_inbox results)
 * - memory: MemoryCard (k_memory results)
 * - collective: CollectiveCard (k_collective results)
 * - bash: BashCard (k_bash results)
 * - process: ProcessCard (k_process results)
 * - capture: CaptureCard (k_capture results)
 * - thinker: ThinkerCard (k_thinker_channel results)
 * - hooks: HooksCard (k_hooks/k_session results)
 * - pccontrol: PCControlCard (k_pccontrol results)
 * - tool-search: ToolSearchCard (k_MCPTOOLSEARCH results)
 * - help: HelpCard (k_help results)
 * - graphiti: GraphitiCard (k_graphiti_migrate results)
 * - tool-output: ToolOutputCard (generic tool output)
 */

import type {
  RichCard,
  RAGResultsData,
  FileTreeData,
  SymbolMapData,
  TerminalData,
  CheckpointData,
  SessionData,
  InboxData,
  MemoryData,
  CollectiveData,
  BashData,
  ProcessData,
  CaptureData,
  ThinkerData,
  HooksData,
  PCControlData,
  ToolSearchData,
  HelpData,
  GraphitiData,
  ToolOutputData,
} from '../../types/insights';
import { RAGResultsCard } from './cards/RAGResultsCard';
import { FileTreeCard } from './cards/FileTreeCard';
import { SymbolMapCard } from './cards/SymbolMapCard';
import { TerminalCard } from './cards/TerminalCard';
import { CheckpointCard } from './cards/CheckpointCard';
import { SessionCard } from './cards/SessionCard';
import { InboxCard } from './cards/InboxCard';
import { MemoryCard } from './cards/MemoryCard';
import { CollectiveCard } from './cards/CollectiveCard';
import { BashCard } from './cards/BashCard';
import { ProcessCard } from './cards/ProcessCard';
import { CaptureCard } from './cards/CaptureCard';
import { ThinkerCard } from './cards/ThinkerCard';
import { HooksCard } from './cards/HooksCard';
import { PCControlCard } from './cards/PCControlCard';
import { ToolSearchCard } from './cards/ToolSearchCard';
import { HelpCard } from './cards/HelpCard';
import { GraphitiCard } from './cards/GraphitiCard';
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
      return <FileTreeCard data={card.data as FileTreeData} collapsed={collapsed} />;

    case 'symbol-map':
      return <SymbolMapCard data={card.data as SymbolMapData} collapsed={collapsed} />;

    case 'terminal':
      return <TerminalCard data={card.data as TerminalData} collapsed={collapsed} />;

    case 'checkpoint':
      return <CheckpointCard data={card.data as CheckpointData} collapsed={collapsed} />;

    case 'session':
    case 'session-state':  // Legacy alias
      return <SessionCard data={card.data as SessionData} collapsed={collapsed} />;

    case 'inbox':
      return <InboxCard data={card.data as InboxData} collapsed={collapsed} />;

    case 'memory':
      return <MemoryCard data={card.data as MemoryData} collapsed={collapsed} />;

    case 'collective':
      return <CollectiveCard data={card.data as CollectiveData} collapsed={collapsed} />;

    case 'bash':
      return <BashCard data={card.data as BashData} collapsed={collapsed} />;

    case 'process':
      return <ProcessCard data={card.data as ProcessData} collapsed={collapsed} />;

    case 'capture':
      return <CaptureCard data={card.data as CaptureData} collapsed={collapsed} />;

    case 'thinker':
      return <ThinkerCard data={card.data as ThinkerData} collapsed={collapsed} />;

    case 'hooks':
      return <HooksCard data={card.data as HooksData} collapsed={collapsed} />;

    case 'pccontrol':
      return <PCControlCard data={card.data as PCControlData} collapsed={collapsed} />;

    case 'tool-search':
      return <ToolSearchCard data={card.data as ToolSearchData} collapsed={collapsed} />;

    case 'help':
      return <HelpCard data={card.data as HelpData} collapsed={collapsed} />;

    case 'graphiti':
      return <GraphitiCard data={card.data as GraphitiData} collapsed={collapsed} />;

    case 'tool-output':
      return <ToolOutputCard data={card.data as ToolOutputData} />;

    default:
      return <UnknownCard card={card} />;
  }
}
