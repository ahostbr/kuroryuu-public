import { useState } from 'react';
import {
  X,
  Brain,
  Sparkles,
  Workflow
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
  defaultTab?: TabType;
}

const TABS: { id: TabType; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { id: 'thinkers', label: 'Thinkers', icon: Brain },
  { id: 'specialists', label: 'Task Specialists', icon: Sparkles },
  { id: 'workflow', label: 'Workflow PRD', icon: Workflow },
];

export function AgentWizard({
  isOpen,
  onClose,
  onLaunchThinker,
  onLaunchSpecialist,
  onLaunchWorkflowSpecialist,
  defaultTab = 'thinkers'
}: AgentWizardProps) {
  const [activeTab, setActiveTab] = useState<TabType>(defaultTab);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl w-[800px] max-h-[85vh] overflow-hidden shadow-2xl">
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
        <div className="p-6 overflow-y-auto max-h-[calc(85vh-140px)]">
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
