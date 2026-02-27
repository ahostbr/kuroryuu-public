import {
  Search,
  Globe,
  PenTool,
  FolderOpen,
  BookOpen,
} from 'lucide-react';
import { useLiteNotionStore } from '../../stores/litenotion-store';
import { TerminalWorkspace } from '../shared/terminal-workspace';
import type { WorkspaceTool, WorkspaceSkill } from '../shared/terminal-workspace';
import { LiteNotionTerminal } from './LiteNotionTerminal';

// Tool pages
import { ResearchPage } from './pages/ResearchPage';
import { ScraperPage } from './pages/ScraperPage';
import { BrowserPage } from './pages/BrowserPage';
import { MockupsPage } from './pages/MockupsPage';
import { GalleryPage } from './pages/GalleryPage';

const LITENOTION_TOOLS: WorkspaceTool[] = [
  { id: 'research', icon: Search, label: 'Research', page: <ResearchPage /> },
  { id: 'scraper', icon: Globe, label: 'Web Scraper', page: <ScraperPage /> },
  { id: 'browser', icon: Globe, label: 'Browser', page: <BrowserPage /> },
  { id: 'mockups', icon: PenTool, label: 'Mockups', page: <MockupsPage /> },
  { id: 'gallery', icon: FolderOpen, label: 'Gallery', page: <GalleryPage />, bottom: true },
];

const LITENOTION_SKILLS: WorkspaceSkill[] = [
  { id: 'research', label: 'Research', icon: Search, file: 'research.md' },
  { id: 'web-scraper', label: 'Web Scraper', icon: Globe, file: 'web_scraper.md' },
  { id: 'excalidraw', label: 'Excalidraw', icon: PenTool, file: 'excalidraw.md' },
  { id: 'bootstrap', label: 'Bootstrap', icon: BookOpen, file: 'LITENOTION_BOOTSTRAP.md' },
];

export function LiteNotionWorkspace() {
  const terminalPtyId = useLiteNotionStore((s) => s.terminalPtyId);

  return (
    <TerminalWorkspace
      title="LiteNotion"
      tools={LITENOTION_TOOLS}
      skills={LITENOTION_SKILLS}
      skillPathPrefix="ai/skills/litenotion/"
      terminal={<LiteNotionTerminal />}
      terminalPtyId={terminalPtyId}
      terminalTitle="LiteNotion Terminal"
      layoutSettingsKey="ui.litenotionLayout"
      defaultTool="research"
      defaultLayout="splitter"
      defaultSplitRatio={55}
    />
  );
}
