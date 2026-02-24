import { useState } from 'react';
import {
  X,
  Brain,
  Sparkles,
  Workflow,
  MessageCircleQuestion,
  Trophy,
  ChevronRight
} from 'lucide-react';
import { ThinkerWizard } from './ThinkerWizard';
import { SpecialistWizard } from './SpecialistWizard';
import { WorkflowSpecialistWizard } from './WorkflowSpecialistWizard';

type TabType = 'thinkers' | 'specialists' | 'workflow';

interface AgentWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunchThinker: (basePath: string, personaPath: string, personaName: string) => void;
  onLaunchSpecialist: (promptPath: string, specialistName: string, profile: string) => void;
  onLaunchWorkflowSpecialist: (promptPath: string, specialistName: string, profile: string) => void;
  onLaunchQuizmaster?: (variant?: string) => void;
  defaultTab?: TabType;
}

const TABS: { id: TabType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'thinkers', label: 'Thinkers', icon: Brain },
  { id: 'specialists', label: 'Task Specialists', icon: Sparkles },
  { id: 'workflow', label: 'Workflow PRD', icon: Workflow },
];

type QuizmasterVariant = 'small' | 'full' | 'v4' | 'v5';

const QUIZMASTER_VARIANTS: { id: QuizmasterVariant; label: string; desc: string }[] = [
  { id: 'small', label: 'Quick', desc: '5-8 focused questions' },
  { id: 'full', label: 'Full', desc: '12-20 deep-dive questions' },
  { id: 'v4', label: 'V4', desc: 'Structured with categories' },
  { id: 'v5', label: 'V5', desc: 'Adaptive with follow-ups' },
];

export function AgentWizard({
  isOpen,
  onClose,
  onLaunchThinker,
  onLaunchSpecialist,
  onLaunchWorkflowSpecialist,
  onLaunchQuizmaster,
  defaultTab = 'thinkers'
}: AgentWizardProps) {
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);
  const [quizExpanded, setQuizExpanded] = useState(false);
  const [quizVariant, setQuizVariant] = useState<QuizmasterVariant>('small');

  const handleQuizmasterLaunch = (variant: QuizmasterVariant) => {
    if (onLaunchQuizmaster) {
      onLaunchQuizmaster(variant);
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl w-[800px] max-h-[85vh] overflow-hidden shadow-2xl flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Brain className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Agent Launcher</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Quizmaster Hero Section - The Star of the Show */}
        {onLaunchQuizmaster && (
          <div className="px-6 py-4 border-b border-border bg-gradient-to-r from-[#c9a227]/5 to-transparent">
            <style>{`
              @keyframes quizHeroGlow {
                0%, 100% { box-shadow: 0 0 20px rgba(201, 162, 39, 0.2); }
                50% { box-shadow: 0 0 30px rgba(201, 162, 39, 0.4); }
              }
              @keyframes quizHeroShimmer {
                0% { background-position: -200% center; }
                100% { background-position: 200% center; }
              }
            `}</style>
            <div
              className="relative rounded-xl border-2 border-[#c9a227]/40 bg-gradient-to-r from-[#c9a227]/10 via-[#c9a227]/5 to-transparent overflow-hidden transition-all duration-300"
              style={{ animation: 'quizHeroGlow 3s ease-in-out infinite' }}
            >
              {/* Header button — toggles variant picker */}
              <button
                onClick={() => setQuizExpanded(!quizExpanded)}
                className="group relative w-full p-4 hover:from-[#c9a227]/15 transition-all duration-300"
              >
                {/* Shimmer overlay */}
                <div
                  className="absolute inset-0 pointer-events-none opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{
                    background: 'linear-gradient(90deg, transparent, rgba(201, 162, 39, 0.1), transparent)',
                    backgroundSize: '200% 100%',
                    animation: 'quizHeroShimmer 2s linear infinite',
                  }}
                />

                <div className="relative flex items-center gap-4">
                  {/* Icon with glow */}
                  <div className="relative">
                    <div className="w-14 h-14 rounded-xl bg-gradient-to-br from-[#c9a227]/30 to-[#c9a227]/10 flex items-center justify-center border border-[#c9a227]/30">
                      <MessageCircleQuestion className="w-7 h-7 text-[#c9a227]" />
                    </div>
                    {/* Badge */}
                    <div className="absolute -top-2 -right-2 px-1.5 py-0.5 rounded bg-[#c9a227] text-[8px] font-bold text-black uppercase tracking-wider">
                      Start
                    </div>
                  </div>

                  {/* Text */}
                  <div className="flex-1 text-left">
                    <div className="flex items-center gap-2 mb-0.5">
                      <span className="text-base font-semibold text-[#c9a227]">The Ultimate Quizzer</span>
                      <div className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-[#c9a227]/20 border border-[#c9a227]/30">
                        <Trophy className="w-3 h-3 text-[#c9a227]" />
                        <span className="text-[9px] font-bold text-[#c9a227] uppercase">Secret Weapon</span>
                      </div>
                    </div>
                    <p className="text-sm text-zinc-400">
                      Requirements extraction before planning. Ask questions first, build perfectly after.
                    </p>
                  </div>

                  {/* Arrow — rotates when expanded */}
                  <ChevronRight className={`w-5 h-5 text-[#c9a227]/50 group-hover:text-[#c9a227] transition-all duration-200 ${quizExpanded ? 'rotate-90' : ''}`} />
                </div>
              </button>

              {/* Variant picker — slides open */}
              {quizExpanded && (
                <div className="px-4 pb-4 pt-1 border-t border-[#c9a227]/20">
                  <p className="text-[10px] text-muted-foreground uppercase tracking-wider mb-2">Select variant</p>
                  <div className="grid grid-cols-4 gap-2">
                    {QUIZMASTER_VARIANTS.map((v) => (
                      <button
                        key={v.id}
                        onClick={() => setQuizVariant(v.id)}
                        className={`p-2 rounded-lg border text-left transition-all ${
                          quizVariant === v.id
                            ? 'border-[#c9a227] bg-[#c9a227]/15 text-[#c9a227]'
                            : 'border-border bg-card/50 text-muted-foreground hover:border-[#c9a227]/40 hover:text-foreground'
                        }`}
                      >
                        <div className="text-xs font-semibold">{v.label}</div>
                        <div className="text-[10px] opacity-70">{v.desc}</div>
                      </button>
                    ))}
                  </div>
                  <button
                    onClick={() => handleQuizmasterLaunch(quizVariant)}
                    className="mt-3 w-full py-2 rounded-lg bg-[#c9a227] text-black text-sm font-semibold hover:bg-[#c9a227]/80 transition-colors"
                  >
                    Launch {QUIZMASTER_VARIANTS.find(v => v.id === quizVariant)?.label} Quizzer
                  </button>
                </div>
              )}
            </div>

            {/* Divider with text */}
            <div className="flex items-center gap-3 mt-4">
              <div className="flex-1 h-px bg-border" />
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">or explore specialized agents</span>
              <div className="flex-1 h-px bg-border" />
            </div>
          </div>
        )}

        {/* Tab Navigation */}
        <div className="flex border-b border-border bg-secondary/30">
          {TABS.map((tab) => {
            const IconComponent = tab.icon;
            const isActive = activeTab === tab.id;

            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`
                  flex items-center gap-2 px-6 py-3 text-sm font-medium transition-all duration-200
                  ${isActive
                    ? 'text-primary border-b-2 border-primary bg-card/50'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary/50'
                  }
                `}
              >
                <IconComponent className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Tab Content */}
        <div className="p-6 overflow-y-auto flex-1 min-h-0">
          {activeTab === 'thinkers' && (
            <ThinkerWizard
              isOpen={true}
              onClose={onClose}
              onLaunch={onLaunchThinker}
              embedded={true}
            />
          )}

          {activeTab === 'specialists' && (
            <SpecialistWizard
              isOpen={true}
              onClose={onClose}
              onLaunch={onLaunchSpecialist}
              embedded={true}
            />
          )}

          {activeTab === 'workflow' && (
            <WorkflowSpecialistWizard
              isOpen={true}
              onClose={onClose}
              onLaunch={onLaunchWorkflowSpecialist}
              embedded={true}
            />
          )}
        </div>
      </div>
    </div>
  );
}
