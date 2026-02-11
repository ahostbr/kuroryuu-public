import { useMarketingStore } from '../../stores/marketing-store';
import { Lightbulb, Target, FileText, Mail, Globe, DollarSign, TrendingUp } from 'lucide-react';

// File names must match actual files in ai/skills/marketing/
const SKILLS = [
  { id: 'positioning', label: 'Positioning', icon: Target, file: 'positioning.md' },
  { id: 'copywriting', label: 'Copywriting', icon: FileText, file: 'copywriting.md' },
  { id: 'seo-content', label: 'SEO Content', icon: Globe, file: 'seo_content.md' },
  { id: 'lead-magnet', label: 'Lead Magnet', icon: Mail, file: 'lead_magnet.md' },
  { id: 'ad-creative', label: 'Ad Creative', icon: DollarSign, file: 'ad_creative.md' },
  { id: 'landing-page', label: 'Landing Page', icon: Lightbulb, file: 'landing_page.md' },
  { id: 'keyword-research', label: 'Keyword Research', icon: TrendingUp, file: 'keyword_research.md' },
];

export function MarketingSkillPicker() {
  const terminalPtyId = useMarketingStore((s) => s.terminalPtyId);

  const handleSkillClick = (file: string) => {
    if (!terminalPtyId) return;
    // Send file reference to Claude Code CLI — @filepath loads the skill as context
    window.electronAPI.pty.write(terminalPtyId, `/skill @ai/skills/marketing/${file}\n`);
  };

  return (
    <div className="h-full flex flex-col">
      <div className="flex items-center gap-2 px-3 py-2 border-b border-zinc-700">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <span className="text-xs font-medium text-zinc-300">Skills</span>
      </div>
      <div className="flex-1 overflow-y-auto p-2 flex flex-col gap-1">
        {SKILLS.map((skill) => {
          const Icon = skill.icon;
          return (
            <button
              key={skill.id}
              onClick={() => handleSkillClick(skill.file)}
              disabled={!terminalPtyId}
              className="flex items-center gap-2 w-full px-3 py-2 rounded text-sm text-zinc-300 hover:bg-amber-500/20 hover:text-amber-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-left"
            >
              <Icon className="w-4 h-4 flex-shrink-0" />
              {skill.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
