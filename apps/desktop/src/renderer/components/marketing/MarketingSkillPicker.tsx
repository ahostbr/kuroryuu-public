import { useMarketingStore } from '../../stores/marketing-store';
import { Search, Lightbulb, Target, FileText, Image, Mail, Globe, DollarSign, TrendingUp } from 'lucide-react';

const SKILLS = [
  { id: 'research', label: 'Research', icon: Search, file: 'research.md' },
  { id: 'positioning', label: 'Positioning', icon: Target, file: 'positioning.md' },
  { id: 'copywriting', label: 'Copywriting', icon: FileText, file: 'copywriting.md' },
  { id: 'seo', label: 'SEO', icon: Globe, file: 'seo.md' },
  { id: 'lead-magnet', label: 'Lead Magnet', icon: Mail, file: 'lead-magnet.md' },
  { id: 'ads', label: 'Ads', icon: DollarSign, file: 'ads.md' },
  { id: 'landing-page', label: 'Landing Page', icon: Lightbulb, file: 'landing-page.md' },
  { id: 'keywords', label: 'Keywords', icon: TrendingUp, file: 'keywords.md' },
];

export function MarketingSkillPicker() {
  const terminalPtyId = useMarketingStore((s) => s.terminalPtyId);

  const handleSkillClick = (file: string) => {
    if (!terminalPtyId) return;
    // Send skill reference to terminal
    window.electronAPI.pty.write(terminalPtyId, `/skill @ai/skills/marketing/${file}\n`);
  };

  return (
    <div className="bg-zinc-800 rounded-lg border border-zinc-700 p-3">
      <div className="flex items-center gap-2 mb-2">
        <Lightbulb className="w-4 h-4 text-amber-500" />
        <h3 className="text-sm font-medium text-zinc-100">Marketing Skills</h3>
      </div>
      <div className="flex flex-wrap gap-2">
        {SKILLS.map((skill) => {
          const Icon = skill.icon;
          return (
            <button
              key={skill.id}
              onClick={() => handleSkillClick(skill.file)}
              disabled={!terminalPtyId}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-900 hover:bg-amber-500/20 hover:border-amber-500/50 disabled:opacity-50 disabled:cursor-not-allowed border border-zinc-700 rounded text-sm text-zinc-300 hover:text-amber-500 transition-colors"
            >
              <Icon className="w-3.5 h-3.5" />
              {skill.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
