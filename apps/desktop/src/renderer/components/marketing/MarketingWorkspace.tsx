import { useState } from 'react';
import {
  Search,
  Globe,
  Image as ImageIcon,
  Mic,
  Music,
  FolderOpen,
  MonitorPlay,
  Target,
  FileText,
  Mail,
  DollarSign,
  TrendingUp,
  Lightbulb,
  BookOpen,
  Download,
  Loader2,
} from 'lucide-react';
import { useMarketingStore } from '../../stores/marketing-store';
import { TerminalWorkspace } from '../shared/terminal-workspace';
import type { WorkspaceTool, WorkspaceSkill } from '../shared/terminal-workspace';
import { MarketingTerminal } from './MarketingTerminal';
import { useMarketingEvents } from '../../hooks/useMarketingEvents';

// Tool pages
import { ResearchPage } from './pages/ResearchPage';
import { ScraperPage } from './pages/ScraperPage';
import { ImageGenPage } from './pages/ImageGenPage';
import { VoiceoverPage } from './pages/VoiceoverPage';
import { MusicGenPage } from './pages/MusicGenPage';
import { GalleryPage } from './pages/GalleryPage';
import { StudioPage } from './pages/StudioPage';

const MARKETING_TOOLS: WorkspaceTool[] = [
  { id: 'research', icon: Search, label: 'Research', page: <ResearchPage /> },
  { id: 'scraper', icon: Globe, label: 'Web Scraper', page: <ScraperPage /> },
  { id: 'image-gen', icon: ImageIcon, label: 'Image Generation', page: <ImageGenPage /> },
  { id: 'voiceover', icon: Mic, label: 'Voiceover', page: <VoiceoverPage /> },
  { id: 'music-gen', icon: Music, label: 'Music Generation', page: <MusicGenPage /> },
  { id: 'studio', icon: MonitorPlay, label: 'Studio', page: <StudioPage /> },
  { id: 'gallery', icon: FolderOpen, label: 'Gallery', page: <GalleryPage />, bottom: true },
];

const MARKETING_SKILLS: WorkspaceSkill[] = [
  { id: 'dofirst', label: 'DOFIRST', icon: BookOpen, file: 'MARKETING_BOOTSTRAP.md' },
  { id: 'positioning', label: 'Positioning', icon: Target, file: 'positioning.md' },
  { id: 'copywriting', label: 'Copywriting', icon: FileText, file: 'copywriting.md' },
  { id: 'seo-content', label: 'SEO Content', icon: Globe, file: 'seo_content.md' },
  { id: 'lead-magnet', label: 'Lead Magnet', icon: Mail, file: 'lead_magnet.md' },
  { id: 'ad-creative', label: 'Ad Creative', icon: DollarSign, file: 'ad_creative.md' },
  { id: 'landing-page', label: 'Landing Page', icon: Lightbulb, file: 'landing_page.md' },
  { id: 'keyword-research', label: 'Keyword Research', icon: TrendingUp, file: 'keyword_research.md' },
  { id: 'research', label: 'Research', icon: Search, file: 'research.md' },
  { id: 'web-scraper', label: 'Web Scraper', icon: Globe, file: 'web_scraper.md' },
  { id: 'image-gen-skill', label: 'Image Gen', icon: ImageIcon, file: 'image_gen.md' },
  { id: 'voiceover-skill', label: 'Voiceover', icon: Mic, file: 'voiceover.md' },
  { id: 'music-gen-skill', label: 'Music Gen', icon: Music, file: 'music_gen.md' },
  { id: 'remotion-studio', label: 'Remotion Studio', icon: MonitorPlay, file: 'remotion_studio.md' },
];

export function MarketingWorkspace() {
  const terminalPtyId = useMarketingStore((s) => s.terminalPtyId);
  const setSetupComplete = useMarketingStore((s) => s.setSetupComplete);
  useMarketingEvents();

  const [updating, setUpdating] = useState(false);
  const [updateMsg, setUpdateMsg] = useState<string | null>(null);

  const handleCheckUpdates = async () => {
    setUpdating(true);
    setUpdateMsg(null);
    try {
      const result = await window.electronAPI.marketing.pullUpdates();
      if (result.ok && result.results) {
        const updatedCount = result.results.filter((r) => r.updated).length;
        const failedCount = result.results.filter((r) => !r.ok).length;
        if (failedCount > 0) {
          setUpdateMsg(`${failedCount} tool(s) failed to update`);
        } else if (updatedCount > 0) {
          setUpdateMsg(`${updatedCount} tool(s) updated`);
        } else {
          setUpdateMsg('Already up to date');
        }
      } else {
        setUpdateMsg('Update failed');
      }
    } catch {
      setUpdateMsg('Update failed — check network');
    } finally {
      setUpdating(false);
      setTimeout(() => setUpdateMsg(null), 5000);
    }
  };

  return (
    <TerminalWorkspace
      title="Marketing"
      tools={MARKETING_TOOLS}
      skills={MARKETING_SKILLS}
      skillPathPrefix="ai/skills/marketing/"
      terminal={<MarketingTerminal />}
      terminalPtyId={terminalPtyId}
      terminalTitle="Marketing Terminal"
      layoutSettingsKey="ui.marketingLayout"
      defaultTool="research"
      defaultLayout="window"
      onSettings={() => setSetupComplete(false)}
      headerExtra={
        <div className="flex items-center gap-2">
          {updateMsg && <span className="text-xs text-zinc-400">{updateMsg}</span>}
          <button
            onClick={handleCheckUpdates}
            disabled={updating}
            className="flex items-center gap-1.5 px-3 py-1 text-xs rounded border border-zinc-700 hover:border-zinc-500 text-zinc-300 disabled:opacity-50"
          >
            {updating ? <Loader2 size={14} className="animate-spin" /> : <Download size={14} />}
            Check for Updates
          </button>
        </div>
      }
    />
  );
}
