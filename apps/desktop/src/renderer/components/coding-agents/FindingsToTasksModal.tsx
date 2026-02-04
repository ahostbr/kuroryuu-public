import React, { useState, useMemo } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  ArrowRight,
  ArrowLeft,
  Check,
  AlertTriangle,
  AlertCircle,
  Info,
  Bug,
  Shield,
  Zap,
  Code2,
  ClipboardList,
  CheckSquare,
  Square
} from 'lucide-react';
// Task import removed - now using gateway endpoint for task creation
import { Finding, FindingSeverity, FindingCategory } from '../../types/finding';
import {
  extractFindings,
  findingSeverityToPriority,
  findingCategoryToTaskCategory,
  buildTaskDescription
} from '../../utils/findings-parser';
import { toast } from '../ui/toast';
import { ThemedFrame } from '../ui/ThemedFrame';
import { useIsThemedStyle } from '../../hooks/useTheme';

interface FindingsToTasksModalProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  logs: string;
  onTasksCreated?: (count: number) => void;
}

type WizardStep = 'extract' | 'select' | 'create';

const STEPS: WizardStep[] = ['extract', 'select', 'create'];

const severityConfig: Record<FindingSeverity, { icon: React.ElementType; color: string; bg: string }> = {
  critical: { icon: AlertCircle, color: 'text-red-400', bg: 'bg-red-500/20 border-red-500/30' },
  high: { icon: AlertTriangle, color: 'text-orange-400', bg: 'bg-orange-500/20 border-orange-500/30' },
  medium: { icon: AlertTriangle, color: 'text-yellow-400', bg: 'bg-yellow-500/20 border-yellow-500/30' },
  low: { icon: Info, color: 'text-blue-400', bg: 'bg-blue-500/20 border-blue-500/30' },
  info: { icon: Info, color: 'text-gray-400', bg: 'bg-gray-500/20 border-gray-500/30' }
};

const categoryConfig: Record<FindingCategory, { icon: React.ElementType; label: string }> = {
  bug: { icon: Bug, label: 'Bug' },
  security: { icon: Shield, label: 'Security' },
  performance: { icon: Zap, label: 'Performance' },
  memory_leak: { icon: AlertCircle, label: 'Memory Leak' },
  code_quality: { icon: Code2, label: 'Code Quality' },
  refactoring: { icon: Code2, label: 'Refactoring' },
  testing: { icon: CheckSquare, label: 'Testing' },
  documentation: { icon: ClipboardList, label: 'Docs' }
};

function SeverityBadge({ severity }: { severity: FindingSeverity }) {
  const config = severityConfig[severity];
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border ${config.bg} ${config.color}`}>
      <Icon className="w-3 h-3" />
      {severity}
    </span>
  );
}

function CategoryBadge({ category }: { category: FindingCategory }) {
  const config = categoryConfig[category];
  const Icon = config.icon;

  return (
    <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs font-medium border border-border bg-secondary/50 text-muted-foreground">
      <Icon className="w-3 h-3" />
      {config.label}
    </span>
  );
}

export function FindingsToTasksModal({
  isOpen,
  onClose,
  sessionId,
  logs,
  onTasksCreated
}: FindingsToTasksModalProps) {
  const [step, setStep] = useState<WizardStep>('extract');
  const [findings, setFindings] = useState<Finding[]>([]);
  const [isCreating, setIsCreating] = useState(false);

  const { isKuroryuu } = useIsThemedStyle();

  // Extract findings on modal open
  const extractionResult = useMemo(() => {
    if (!logs || !isOpen) return null;
    return extractFindings(logs, sessionId);
  }, [logs, sessionId, isOpen]);

  // Initialize findings when extraction completes
  React.useEffect(() => {
    if (extractionResult && step === 'extract') {
      setFindings(extractionResult.findings);
    }
  }, [extractionResult, step]);

  const selectedCount = findings.filter(f => f.selected).length;

  const handleNext = () => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex < STEPS.length - 1) {
      setStep(STEPS[currentIndex + 1]);
    }
  };

  const handleBack = () => {
    const currentIndex = STEPS.indexOf(step);
    if (currentIndex > 0) {
      setStep(STEPS[currentIndex - 1]);
    }
  };

  const toggleFinding = (id: string) => {
    setFindings(prev =>
      prev.map(f => (f.id === id ? { ...f, selected: !f.selected } : f))
    );
  };

  const selectAll = () => {
    setFindings(prev => prev.map(f => ({ ...f, selected: true })));
  };

  const selectNone = () => {
    setFindings(prev => prev.map(f => ({ ...f, selected: false })));
  };

  const selectBySeverity = (severity: FindingSeverity) => {
    setFindings(prev =>
      prev.map(f => ({ ...f, selected: f.severity === severity }))
    );
  };

  const handleCreateTasks = async () => {
    const selected = findings.filter(f => f.selected);
    if (selected.length === 0) {
      toast.error('No findings selected');
      return;
    }

    setIsCreating(true);
    let successCount = 0;

    for (let i = 0; i < selected.length; i++) {
      const finding = selected[i];

      try {
        // Route through gateway - single integration point for task creation
        const result = await window.electronAPI.tasks.createViaGateway({
          title: finding.title,
          description: buildTaskDescription(finding, sessionId),
          status: 'backlog',
          priority: findingSeverityToPriority(finding.severity),
          tags: [finding.category, `from:${sessionId.slice(0, 8)}`],
          from_session_id: sessionId,
        });

        if (result.ok) {
          successCount++;
        } else {
          console.error(`Failed to create task: ${result.error}`);
        }
      } catch (error) {
        console.error(`Failed to create task for finding ${finding.id}:`, error);
      }
    }

    setIsCreating(false);

    if (successCount > 0) {
      toast.success(`Created ${successCount} task${successCount > 1 ? 's' : ''} from findings`);
      onTasksCreated?.(successCount);
      handleClose();
    } else {
      toast.error('Failed to create tasks');
    }
  };

  const handleClose = () => {
    setStep('extract');
    setFindings([]);
    onClose();
  };

  const canProceed = () => {
    if (step === 'extract') return findings.length > 0;
    if (step === 'select') return selectedCount > 0;
    return true;
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={open => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 animate-in fade-in duration-200" />
        <Dialog.Content className="fixed top-[50%] left-[50%] translate-x-[-50%] translate-y-[-50%] z-50 focus:outline-none">
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="lg"
            className="w-[90vw] max-w-3xl overflow-hidden flex flex-col animate-in zoom-in-95 duration-200"
            contentClassName="flex-1 flex flex-col min-h-0"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border bg-card">
              <div>
                <Dialog.Title className="text-lg font-bold text-foreground">
                  Convert Findings to Tasks
                </Dialog.Title>
                <div className="flex items-center gap-2 mt-1">
                  {STEPS.map((s, i) => (
                    <div
                      key={s}
                      className={`h-1.5 w-8 rounded-full transition-colors ${
                        STEPS.indexOf(step) >= i ? 'bg-primary' : 'bg-secondary'
                      }`}
                    />
                  ))}
                  <span className="text-xs text-muted-foreground uppercase font-medium ml-2">
                    Step {STEPS.indexOf(step) + 1} of {STEPS.length}
                  </span>
                </div>
              </div>
              <Dialog.Close asChild>
                <button className="p-2 text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>

            {/* Content */}
            <div className="p-6 h-[450px] overflow-y-auto">
              {/* Step 1: Extract */}
              {step === 'extract' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="text-sm text-muted-foreground mb-4">
                    Analyzing session logs for actionable findings...
                  </div>

                  {extractionResult && (
                    <>
                      {/* Summary Stats */}
                      <div className="grid grid-cols-2 gap-4 mb-6">
                        <div className="bg-background rounded-lg p-4 border border-border">
                          <div className="text-2xl font-bold text-foreground">
                            {extractionResult.metadata.totalFound}
                          </div>
                          <div className="text-sm text-muted-foreground">
                            Findings Extracted
                          </div>
                        </div>
                        <div className="bg-background rounded-lg p-4 border border-border">
                          <div className="flex flex-wrap gap-2">
                            {Object.entries(extractionResult.metadata.bySeverity)
                              .filter(([, count]) => count > 0)
                              .map(([sev, count]) => (
                                <span key={sev} className="text-sm">
                                  <SeverityBadge severity={sev as FindingSeverity} />
                                  <span className="ml-1 text-muted-foreground">
                                    {count}
                                  </span>
                                </span>
                              ))}
                          </div>
                          <div className="text-sm text-muted-foreground mt-2">
                            By Severity
                          </div>
                        </div>
                      </div>

                      {/* Preview List */}
                      {findings.length > 0 ? (
                        <div className="space-y-2">
                          <div className="text-sm font-medium text-muted-foreground mb-2">
                            Preview ({findings.length} items)
                          </div>
                          {findings.slice(0, 5).map(finding => (
                            <div
                              key={finding.id}
                              className="p-3 bg-background rounded border border-border"
                            >
                              <div className="flex items-start gap-2">
                                <SeverityBadge severity={finding.severity} />
                                <CategoryBadge category={finding.category} />
                              </div>
                              <div className="font-medium text-foreground mt-2">
                                {finding.title}
                              </div>
                              <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                                {finding.description}
                              </div>
                            </div>
                          ))}
                          {findings.length > 5 && (
                            <div className="text-sm text-muted-foreground text-center py-2">
                              +{findings.length - 5} more findings...
                            </div>
                          )}
                        </div>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <AlertCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                          <div>No actionable findings detected in the logs.</div>
                          <div className="text-sm mt-1">
                            This session may not contain structured review output.
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Step 2: Select */}
              {step === 'select' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-right-4 duration-300">
                  {/* Bulk Actions */}
                  <div className="flex items-center gap-2 mb-4">
                    <button
                      onClick={selectAll}
                      className="px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 rounded transition-colors"
                    >
                      Select All
                    </button>
                    <button
                      onClick={selectNone}
                      className="px-3 py-1.5 text-xs bg-secondary hover:bg-secondary/80 rounded transition-colors"
                    >
                      Select None
                    </button>
                    <button
                      onClick={() => selectBySeverity('critical')}
                      className="px-3 py-1.5 text-xs bg-red-500/20 hover:bg-red-500/30 text-red-400 rounded transition-colors"
                    >
                      Critical Only
                    </button>
                    <button
                      onClick={() => selectBySeverity('high')}
                      className="px-3 py-1.5 text-xs bg-orange-500/20 hover:bg-orange-500/30 text-orange-400 rounded transition-colors"
                    >
                      High Only
                    </button>
                    <div className="ml-auto text-sm text-muted-foreground">
                      {selectedCount} / {findings.length} selected
                    </div>
                  </div>

                  {/* Findings List */}
                  <div className="space-y-2 max-h-[350px] overflow-y-auto">
                    {findings.map(finding => (
                      <div
                        key={finding.id}
                        onClick={() => toggleFinding(finding.id)}
                        className={`p-3 bg-background rounded border cursor-pointer transition-colors ${
                          finding.selected
                            ? 'border-primary/50 bg-primary/5'
                            : 'border-border hover:border-border/80'
                        }`}
                      >
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5">
                            {finding.selected ? (
                              <CheckSquare className="w-5 h-5 text-primary" />
                            ) : (
                              <Square className="w-5 h-5 text-muted-foreground" />
                            )}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 mb-1">
                              <SeverityBadge severity={finding.severity} />
                              <CategoryBadge category={finding.category} />
                              {finding.location && (
                                <span className="text-xs text-muted-foreground font-mono">
                                  {finding.location}
                                  {finding.lineNumbers && `:${finding.lineNumbers}`}
                                </span>
                              )}
                            </div>
                            <div className="font-medium text-foreground">
                              {finding.title}
                            </div>
                            <div className="text-sm text-muted-foreground mt-1 line-clamp-2">
                              {finding.description}
                            </div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Step 3: Create */}
              {step === 'create' && (
                <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                  <div className="bg-background rounded-lg p-4 border border-border">
                    <h3 className="text-sm font-medium text-muted-foreground uppercase mb-4">
                      Tasks to Create
                    </h3>
                    <div className="text-3xl font-bold text-foreground mb-2">
                      {selectedCount} Task{selectedCount !== 1 ? 's' : ''}
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {['critical', 'high', 'medium', 'low', 'info'].map(sev => {
                        const count = findings.filter(
                          f => f.selected && f.severity === sev
                        ).length;
                        if (count === 0) return null;
                        return (
                          <span key={sev}>
                            <SeverityBadge severity={sev as FindingSeverity} />
                            <span className="ml-1 text-muted-foreground text-sm">
                              {count}
                            </span>
                          </span>
                        );
                      })}
                    </div>
                  </div>

                  {/* Selected Items Preview */}
                  <div className="max-h-[250px] overflow-y-auto space-y-2">
                    {findings
                      .filter(f => f.selected)
                      .map(finding => (
                        <div
                          key={finding.id}
                          className="p-3 bg-background rounded border border-border"
                        >
                          <div className="flex items-start gap-2">
                            <Check className="w-4 h-4 text-primary mt-0.5" />
                            <div className="flex-1">
                              <div className="flex items-center gap-2">
                                <span className="font-medium text-foreground">
                                  {finding.title}
                                </span>
                                <span
                                  className={`text-xs px-1.5 py-0.5 rounded ${
                                    findingSeverityToPriority(finding.severity) ===
                                    'high'
                                      ? 'bg-red-500/20 text-red-400'
                                      : findingSeverityToPriority(
                                          finding.severity
                                        ) === 'medium'
                                      ? 'bg-yellow-500/20 text-yellow-400'
                                      : 'bg-blue-500/20 text-blue-400'
                                  }`}
                                >
                                  {findingSeverityToPriority(finding.severity)} priority
                                </span>
                              </div>
                              <div className="text-xs text-muted-foreground mt-1">
                                Category: {findingCategoryToTaskCategory(finding.category)}
                              </div>
                            </div>
                          </div>
                        </div>
                      ))}
                  </div>

                  <div className="flex items-center gap-2 text-sm text-muted-foreground bg-card p-3 rounded border border-border">
                    <ClipboardList className="w-4 h-4 text-primary" />
                    Tasks will be added to Backlog and saved to ai/todo.md
                  </div>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="p-4 border-t border-border bg-card flex justify-between">
              <button
                disabled={step === 'extract'}
                onClick={handleBack}
                className="px-4 py-2 text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <div className="flex items-center gap-2">
                  <ArrowLeft className="w-4 h-4" />
                  Back
                </div>
              </button>

              {step !== 'create' ? (
                <button
                  disabled={!canProceed()}
                  onClick={handleNext}
                  className="px-4 py-2 bg-foreground hover:bg-white text-background rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <div className="flex items-center gap-2">
                    Next
                    <ArrowRight className="w-4 h-4" />
                  </div>
                </button>
              ) : (
                <button
                  disabled={isCreating || selectedCount === 0}
                  onClick={handleCreateTasks}
                  className="px-4 py-2 bg-primary hover:bg-primary/90 text-black rounded font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {isCreating ? (
                      <>Creating...</>
                    ) : (
                      <>
                        Create {selectedCount} Task{selectedCount !== 1 ? 's' : ''}
                        <Check className="w-4 h-4" />
                      </>
                    )}
                  </div>
                </button>
              )}
            </div>
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
