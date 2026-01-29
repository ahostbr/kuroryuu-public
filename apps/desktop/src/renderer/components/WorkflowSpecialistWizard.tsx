import { useState, useEffect } from 'react';
import {
  X,
  FilePlus,
  BookOpen,
  PlayCircle,
  CheckCircle,
  ShieldCheck,
  FileText,
  Code,
  Settings,
  Trophy,
  Loader2,
  Workflow
} from 'lucide-react';

interface WorkflowSpecialistInfo {
  id: string;
  name: string;
  file: string;
  workflow: string;
  category: string;
  description: string;
  tool_profile: string;
  icon: string;
  color: string;
  tags: string[];
}

interface WorkflowSpecialistWizardProps {
  isOpen: boolean;
  onClose: () => void;
  onLaunch: (promptPath: string, specialistName: string, profile: string) => void;
  embedded?: boolean;
}

// Map icon names from index.json to Lucide components
const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  'file-plus': FilePlus,
  'book-open': BookOpen,
  'play-circle': PlayCircle,
  'check-circle': CheckCircle,
  'shield-check': ShieldCheck,
  'file-text': FileText,
  'code': Code,
  'settings': Settings,
  'trophy': Trophy,
};

// Tool profile badge colors and labels for workflow specialists
const PROFILE_CONFIG: Record<string, { label: string; color: string; bg: string }> = {
  read_analyze: { label: 'Read & Analyze', color: '#6B7280', bg: '#6B728020' },
  execute_full: { label: 'Execute Full', color: '#10B981', bg: '#10B98120' },
  write_reports: { label: 'Write Reports', color: '#3B82F6', bg: '#3B82F620' },
};

export function WorkflowSpecialistWizard({ isOpen, onClose, onLaunch, embedded = false }: WorkflowSpecialistWizardProps) {
  const [specialists, setSpecialists] = useState<WorkflowSpecialistInfo[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [launching, setLaunching] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load specialists on mount
  useEffect(() => {
    if (!isOpen) return;

    setLoading(true);
    setError(null);

    window.electronAPI.workflowSpecialist.listVariants()
      .then((result: { ok: boolean; specialists?: WorkflowSpecialistInfo[]; error?: string }) => {
        if (result.ok && result.specialists) {
          setSpecialists(result.specialists);
        } else {
          setError(result.error || 'Failed to load workflow specialists');
        }
      })
      .catch((err: Error) => {
        setError(err.message);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [isOpen]);

  const handleLaunch = async () => {
    if (!selectedId) return;

    const specialist = specialists.find(s => s.id === selectedId);
    if (!specialist) return;

    setLaunching(true);

    try {
      const result = await window.electronAPI.workflowSpecialist.getPromptPath(selectedId);
      if (result.ok && result.promptPath) {
        onLaunch(result.promptPath, specialist.name, specialist.tool_profile);
        onClose();
      } else {
        setError(result.error || 'Failed to get prompt path');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Launch failed');
    } finally {
      setLaunching(false);
    }
  };

  if (!isOpen) return null;

  const selectedSpecialist = specialists.find(s => s.id === selectedId);

  // Content shared between embedded and modal modes
  const content = (
    <>
      {/* Content */}
      <div className={embedded ? "space-y-4" : "p-6 overflow-y-auto max-h-[calc(80vh-140px)]"}>
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="w-8 h-8 text-primary animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-12">
            <p className="text-red-400 mb-4">{error}</p>
            <button
              onClick={() => window.location.reload()}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              Reload
            </button>
          </div>
        ) : (
          <>
            <p className="text-sm text-muted-foreground mb-4">
              Select a PRD workflow specialist for guided feature development stages.
            </p>

            {/* Specialist Grid */}
            <div className="grid grid-cols-2 gap-3">
              {specialists.map((specialist) => {
                const IconComponent = ICON_MAP[specialist.icon] || Workflow;
                const profileConfig = PROFILE_CONFIG[specialist.tool_profile] || PROFILE_CONFIG.read_analyze;
                const isSelected = selectedId === specialist.id;

                return (
                  <button
                    key={specialist.id}
                    onClick={() => setSelectedId(specialist.id)}
                    className={`
                      p-3 rounded-lg border text-left transition-all duration-200
                      ${isSelected
                        ? 'border-primary bg-secondary/80 ring-1 ring-primary/30'
                        : 'border-border bg-secondary/50 hover:border-muted-foreground hover:bg-secondary'
                      }
                    `}
                  >
                    <div className="flex items-start gap-3">
                      <div
                        className="p-2 rounded-lg"
                        style={{ backgroundColor: `${specialist.color}20` }}
                      >
                        <span style={{ color: specialist.color }}>
                          <IconComponent className="w-5 h-5" />
                        </span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium text-foreground truncate text-sm">
                            {specialist.name}
                          </h3>
                          <span
                            className="px-1.5 py-0.5 rounded text-xs font-medium"
                            style={{
                              color: profileConfig.color,
                              backgroundColor: profileConfig.bg
                            }}
                          >
                            {profileConfig.label}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          <span className="text-primary/70">{specialist.workflow}</span>
                          {' · '}
                          <span className="capitalize">{specialist.category}</span>
                        </p>
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2">
                          {specialist.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* Footer - only shown in embedded mode, modal has its own footer */}
      {embedded && (
        <div className="flex items-center justify-between pt-4 border-t border-border mt-4">
          <div className="text-sm text-muted-foreground">
            {selectedSpecialist ? (
              <span>
                Selected: <span className="text-primary font-medium">{selectedSpecialist.name}</span>
              </span>
            ) : (
              'Select a workflow specialist'
            )}
          </div>
          <button
            onClick={handleLaunch}
            disabled={!selectedId || launching}
            className={`
              px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200
              ${selectedId && !launching
                ? 'bg-primary text-black hover:bg-yellow-300'
                : 'bg-muted text-muted-foreground cursor-not-allowed'
              }
            `}
          >
            {launching ? (
              <span className="flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" />
                Launching...
              </span>
            ) : (
              'Launch Specialist'
            )}
          </button>
        </div>
      )}
    </>
  );

  // Embedded mode: return content directly without modal wrapper
  if (embedded) {
    return content;
  }

  // Modal mode: wrap content in modal
  return (
    <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50 backdrop-blur-sm">
      <div className="bg-card border border-border rounded-xl w-[700px] max-h-[80vh] overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <Workflow className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold text-foreground">Launch Workflow Specialist</h2>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto max-h-[calc(80vh-140px)]">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : error ? (
            <div className="text-center py-12">
              <p className="text-red-400 mb-4">{error}</p>
              <button
                onClick={() => window.location.reload()}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Reload
              </button>
            </div>
          ) : (
            <>
              <p className="text-sm text-muted-foreground mb-6">
                Select a PRD workflow specialist for guided feature development stages.
              </p>

              {/* Specialist Grid */}
              <div className="grid grid-cols-2 gap-4">
                {specialists.map((specialist) => {
                  const IconComponent = ICON_MAP[specialist.icon] || Workflow;
                  const profileConfig = PROFILE_CONFIG[specialist.tool_profile] || PROFILE_CONFIG.read_analyze;
                  const isSelected = selectedId === specialist.id;

                  return (
                    <button
                      key={specialist.id}
                      onClick={() => setSelectedId(specialist.id)}
                      className={`
                        p-4 rounded-lg border text-left transition-all duration-200
                        ${isSelected
                          ? 'border-primary bg-secondary/80 ring-1 ring-primary/30'
                          : 'border-border bg-secondary/50 hover:border-muted-foreground hover:bg-secondary'
                        }
                      `}
                    >
                      <div className="flex items-start gap-3">
                        <div
                          className="p-2 rounded-lg"
                          style={{ backgroundColor: `${specialist.color}20` }}
                        >
                          <span style={{ color: specialist.color }}>
                            <IconComponent className="w-5 h-5" />
                          </span>
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="font-medium text-foreground truncate">
                              {specialist.name}
                            </h3>
                            <span
                              className="px-2 py-0.5 rounded text-xs font-medium"
                              style={{
                                color: profileConfig.color,
                                backgroundColor: profileConfig.bg
                              }}
                            >
                              {profileConfig.label}
                            </span>
                          </div>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            <span className="text-primary/70">{specialist.workflow}</span>
                            {' · '}
                            <span className="capitalize">{specialist.category}</span>
                          </p>
                          <p className="text-sm text-muted-foreground mt-2 line-clamp-2">
                            {specialist.description}
                          </p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-border bg-card/50">
          <div className="text-sm text-muted-foreground">
            {selectedSpecialist ? (
              <span>
                Selected: <span className="text-primary font-medium">{selectedSpecialist.name}</span>
              </span>
            ) : (
              'Select a workflow specialist to continue'
            )}
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleLaunch}
              disabled={!selectedId || launching}
              className={`
                px-5 py-2 rounded-lg text-sm font-medium transition-all duration-200
                ${selectedId && !launching
                  ? 'bg-primary text-black hover:bg-yellow-300'
                  : 'bg-muted text-muted-foreground cursor-not-allowed'
                }
              `}
            >
              {launching ? (
                <span className="flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Launching...
                </span>
              ) : (
                'Launch Specialist'
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
