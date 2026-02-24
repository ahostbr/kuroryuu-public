import { PenTool, FolderOpen, Grid, BookOpen, Boxes, GitBranch, ArrowRightLeft, Code2, Settings2 } from 'lucide-react';
import { useExcalidrawStore } from '../../stores/excalidraw-store';
import { TerminalWorkspace } from '../shared/terminal-workspace';
import type { WorkspaceTool, WorkspaceSkill } from '../shared/terminal-workspace';
import { ExcalidrawTerminal } from './ExcalidrawTerminal';

// Tool pages
import { CanvasPage } from './pages/CanvasPage';
import { FileBrowserPage } from './pages/FileBrowserPage';
import { GalleryPage } from './pages/GalleryPage';

const EXCALIDRAW_SKILLS: WorkspaceSkill[] = [
  { id: 'bootstrap', label: 'DOFIRST', icon: BookOpen, file: 'EXCALIDRAW_BOOTSTRAP.md' },
  { id: 'architecture', label: 'Architecture', icon: Boxes, file: 'architecture.md' },
  { id: 'flowchart', label: 'Flowchart', icon: GitBranch, file: 'flowchart.md' },
  { id: 'sequence', label: 'Sequence', icon: ArrowRightLeft, file: 'sequence.md' },
  { id: 'code-to-diagram', label: 'Code to Diagram', icon: Code2, file: 'code_to_diagram.md' },
  { id: 'management', label: 'Management', icon: Settings2, file: 'diagram_management.md' },
];

const EXCALIDRAW_TOOLS: WorkspaceTool[] = [
  { id: 'canvas', icon: PenTool, label: 'Canvas', page: <CanvasPage /> },
  { id: 'files', icon: FolderOpen, label: 'Files', page: <FileBrowserPage /> },
  { id: 'gallery', icon: Grid, label: 'Gallery', page: <GalleryPage />, bottom: true },
];

export function ExcalidrawWorkspace() {
  const terminalPtyId = useExcalidrawStore((s) => s.terminalPtyId);
  const setSetupComplete = useExcalidrawStore((s) => s.setSetupComplete);

  return (
    <TerminalWorkspace
      title="Excalidraw"
      tools={EXCALIDRAW_TOOLS}
      skills={EXCALIDRAW_SKILLS}
      skillPathPrefix="ai/skills/excalidraw/"
      terminal={<ExcalidrawTerminal />}
      terminalPtyId={terminalPtyId}
      terminalTitle="Excalidraw Agent"
      layoutSettingsKey="ui.excalidrawLayout"
      defaultTool="canvas"
      defaultLayout="splitter"
      defaultSplitRatio={60}
      onSettings={() => setSetupComplete(false)}
    />
  );
}
