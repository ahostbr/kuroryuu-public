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
    />
  );
}
