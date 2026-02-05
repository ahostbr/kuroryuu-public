/**
 * Findings Panel - Extract actionable findings from teammate output and create team tasks
 *
 * 3-step wizard:
 * 1. Extract: Scan selected teammate's messages for findings using keyword matching
 * 2. Select: User picks which findings to convert to tasks
 * 3. Create: Generate team tasks from selected findings
 */
import { useState, useMemo, useCallback } from 'react';
import { Search, AlertTriangle, CheckCircle2, ChevronRight, Plus, X } from 'lucide-react';
import { useClaudeTeamsStore } from '../../stores/claude-teams-store';
import type { InboxMessage } from '../../types/claude-teams';

type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';
type FindingCategory = 'bug' | 'security' | 'performance' | 'testing' | 'documentation' | 'suggestion';

interface Finding {
  id: string;
  text: string;
  severity: FindingSeverity;
  category: FindingCategory;
  source: string; // agent name
  selected: boolean;
}

type WizardStep = 'extract' | 'select' | 'create';

export interface FindingsPanelProps {
  onClose?: () => void;
}

export function FindingsPanel({ onClose }: FindingsPanelProps) {
  const selectedTeam = useClaudeTeamsStore((s) => s.selectedTeam);
  const createTeam = useClaudeTeamsStore((s) => s.createTeam);

  const [step, setStep] = useState<WizardStep>('extract');
  const [selectedAgent, setSelectedAgent] = useState<string | null>(null);
  const [findings, setFindings] = useState<Finding[]>([]);
  const [createdTasks, setCreatedTasks] = useState<string[]>([]);

  // Get unique agent names
  const agentNames = useMemo(() => {
    if (!selectedTeam) return [];
    return Array.from(new Set(Object.keys(selectedTeam.inboxes))).sort();
  }, [selectedTeam]);

  // Extract findings from messages using keyword matching
  const extractFindings = useCallback((agentName: string) => {
    if (!selectedTeam) return;

    const messages = selectedTeam.inboxes[agentName] || [];
    const extracted: Finding[] = [];

    messages.forEach((msg, idx) => {
      const text = msg.text.toLowerCase();
      const lines = msg.text.split('\n');

      // Scan each line for keywords
      lines.forEach((line, lineIdx) => {
        if (line.trim().length < 10) return; // Skip short lines

        let category: FindingCategory = 'suggestion';
        let severity: FindingSeverity = 'info';

        // Category detection
        if (/(bug|error|crash|fail|broken|issue)/i.test(line)) {
          category = 'bug';
          severity = 'high';
        } else if (/(security|vulnerability|unsafe|exploit|injection|xss)/i.test(line)) {
          category = 'security';
          severity = 'critical';
        } else if (/(slow|performance|optimize|bottleneck|latency)/i.test(line)) {
          category = 'performance';
          severity = 'medium';
        } else if (/(test|coverage|assert|mock|spec)/i.test(line)) {
          category = 'testing';
          severity = 'low';
        } else if (/(document|readme|comment|explain)/i.test(line)) {
          category = 'documentation';
          severity = 'low';
        } else if (/(todo|should|consider|maybe|improve)/i.test(line)) {
          category = 'suggestion';
          severity = 'info';
        } else {
          // Skip lines without actionable keywords
          return;
        }

        // Severity boost based on keywords
        if (/(critical|severe|urgent|dangerous)/i.test(line)) {
          severity = 'critical';
        } else if (/(important|warning|major)/i.test(line)) {
          severity = severity === 'info' ? 'medium' : 'high';
        }

        extracted.push({
          id: `${agentName}-${idx}-${lineIdx}`,
          text: line.trim(),
          severity,
          category,
          source: agentName,
          selected: false,
        });
      });
    });

    setFindings(extracted);
    setStep('select');
  }, [selectedTeam]);

  // Toggle finding selection
  const toggleFinding = useCallback((id: string) => {
    setFindings((prev) =>
      prev.map((f) => (f.id === id ? { ...f, selected: !f.selected } : f))
    );
  }, []);

  // Create tasks from selected findings
  const createTasksFromFindings = useCallback(() => {
    const selected = findings.filter((f) => f.selected);
    const taskSubjects = selected.map((f) => `[${f.category.toUpperCase()}] ${f.text.slice(0, 80)}${f.text.length > 80 ? '...' : ''}`);

    setCreatedTasks(taskSubjects);
    setStep('create');

    // In a real implementation, you would call the store's createTeam or a task creation API
    // For now, we just show the task subjects that would be created
  }, [findings]);

  // Reset wizard
  const reset = useCallback(() => {
    setStep('extract');
    setSelectedAgent(null);
    setFindings([]);
    setCreatedTasks([]);
  }, []);

  if (!selectedTeam) {
    return (
      <div className="flex items-center justify-center h-full text-muted-foreground">
        <div className="text-center">
          <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
          <p>No team selected</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full bg-background">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border bg-secondary/30">
        <div className="flex items-center gap-2">
          <Search className="w-5 h-5 text-primary" />
          <h2 className="font-semibold text-foreground">Findings to Tasks</h2>
        </div>
        <div className="flex items-center gap-2">
          {step !== 'extract' && (
            <button
              onClick={reset}
              className="px-3 py-1.5 text-sm bg-secondary hover:bg-secondary/80 border border-border rounded-md transition-colors"
            >
              Reset
            </button>
          )}
          {onClose && (
            <button
              onClick={onClose}
              className="p-2 hover:bg-secondary rounded-md transition-colors text-muted-foreground hover:text-foreground"
              aria-label="Close"
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* Step Indicator */}
      <div className="flex items-center justify-center gap-2 p-4 bg-secondary/20 border-b border-border">
        <StepIndicator label="Extract" active={step === 'extract'} complete={step !== 'extract'} />
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
        <StepIndicator label="Select" active={step === 'select'} complete={step === 'create'} />
        <ChevronRight className="w-4 h-4 text-muted-foreground" />
        <StepIndicator label="Create" active={step === 'create'} complete={false} />
      </div>

      {/* Step Content */}
      <div className="flex-1 overflow-y-auto">
        {step === 'extract' && (
          <ExtractStep
            agentNames={agentNames}
            selectedAgent={selectedAgent}
            onSelectAgent={setSelectedAgent}
            onExtract={extractFindings}
          />
        )}
        {step === 'select' && (
          <SelectStep
            findings={findings}
            onToggle={toggleFinding}
            onNext={createTasksFromFindings}
          />
        )}
        {step === 'create' && (
          <CreateStep
            taskSubjects={createdTasks}
            onClose={onClose}
            onReset={reset}
          />
        )}
      </div>
    </div>
  );
}

// Step 1: Extract
function ExtractStep({
  agentNames,
  selectedAgent,
  onSelectAgent,
  onExtract,
}: {
  agentNames: string[];
  selectedAgent: string | null;
  onSelectAgent: (agent: string) => void;
  onExtract: (agent: string) => void;
}) {
  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">Select Teammate</h3>
        <p className="text-sm text-muted-foreground mb-4">
          Choose a teammate whose messages you want to scan for findings
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3">
        {agentNames.map((name) => (
          <button
            key={name}
            onClick={() => onSelectAgent(name)}
            className={`
              text-left px-4 py-3 rounded-lg border transition-all
              ${
                selectedAgent === name
                  ? 'bg-primary/10 border-primary text-primary font-medium'
                  : 'bg-secondary/50 border-border hover:bg-secondary hover:border-border/80'
              }
            `}
          >
            {name}
          </button>
        ))}
      </div>

      {selectedAgent && (
        <button
          onClick={() => onExtract(selectedAgent)}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors mt-6"
        >
          Extract Findings
          <ChevronRight className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// Step 2: Select
function SelectStep({
  findings,
  onToggle,
  onNext,
}: {
  findings: Finding[];
  onToggle: (id: string) => void;
  onNext: () => void;
}) {
  const selectedCount = findings.filter((f) => f.selected).length;

  const severityBadgeStyles: Record<FindingSeverity, string> = {
    critical: 'bg-red-500/20 text-red-400',
    high: 'bg-orange-500/20 text-orange-400',
    medium: 'bg-yellow-500/20 text-yellow-400',
    low: 'bg-blue-500/20 text-blue-400',
    info: 'bg-gray-500/20 text-gray-400',
  };

  const categoryStyles: Record<FindingCategory, string> = {
    bug: 'bg-red-500/10 text-red-400 border-red-500/30',
    security: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
    performance: 'bg-orange-500/10 text-orange-400 border-orange-500/30',
    testing: 'bg-green-500/10 text-green-400 border-green-500/30',
    documentation: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    suggestion: 'bg-gray-500/10 text-gray-400 border-gray-500/30',
  };

  return (
    <div className="p-6 space-y-4">
      <div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Select Findings ({selectedCount} selected)
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Choose which findings to convert into team tasks
        </p>
      </div>

      {findings.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          <AlertTriangle className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No findings detected</p>
          <p className="text-xs mt-1">Try selecting a different teammate</p>
        </div>
      ) : (
        <div className="space-y-3">
          {findings.map((finding) => (
            <label
              key={finding.id}
              className={`
                flex items-start gap-3 p-4 rounded-lg border cursor-pointer transition-all
                ${
                  finding.selected
                    ? 'bg-primary/10 border-primary'
                    : 'bg-secondary/50 border-border hover:bg-secondary hover:border-border/80'
                }
              `}
            >
              <input
                type="checkbox"
                checked={finding.selected}
                onChange={() => onToggle(finding.id)}
                className="mt-1 w-4 h-4 rounded border-border"
              />
              <div className="flex-1 space-y-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <span
                    className={`text-xs px-2 py-0.5 rounded font-medium ${severityBadgeStyles[finding.severity]}`}
                  >
                    {finding.severity.toUpperCase()}
                  </span>
                  <span
                    className={`text-xs px-2 py-0.5 rounded border ${categoryStyles[finding.category]}`}
                  >
                    {finding.category}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    from {finding.source}
                  </span>
                </div>
                <p className="text-sm text-foreground leading-relaxed">
                  {finding.text}
                </p>
              </div>
            </label>
          ))}
        </div>
      )}

      {selectedCount > 0 && (
        <button
          onClick={onNext}
          className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors mt-6"
        >
          Create {selectedCount} Task{selectedCount !== 1 ? 's' : ''}
          <Plus className="w-4 h-4" />
        </button>
      )}
    </div>
  );
}

// Step 3: Create
function CreateStep({
  taskSubjects,
  onClose,
  onReset,
}: {
  taskSubjects: string[];
  onClose?: () => void;
  onReset: () => void;
}) {
  return (
    <div className="p-6 space-y-4">
      <div className="text-center py-6">
        <div className="w-16 h-16 mx-auto mb-4 bg-green-500/20 rounded-full flex items-center justify-center">
          <CheckCircle2 className="w-8 h-8 text-green-400" />
        </div>
        <h3 className="text-lg font-semibold text-foreground mb-2">
          Tasks Ready to Create
        </h3>
        <p className="text-sm text-muted-foreground">
          {taskSubjects.length} task{taskSubjects.length !== 1 ? 's' : ''} will be added to the team
        </p>
      </div>

      <div className="space-y-2 max-h-96 overflow-y-auto">
        {taskSubjects.map((subject, idx) => (
          <div
            key={idx}
            className="flex items-start gap-3 p-3 bg-secondary/50 rounded-lg border border-border"
          >
            <span className="text-xs font-medium text-muted-foreground mt-0.5">
              #{idx + 1}
            </span>
            <p className="text-sm text-foreground flex-1">{subject}</p>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mt-6">
        <button
          onClick={onReset}
          className="flex-1 px-4 py-3 bg-secondary hover:bg-secondary/80 text-foreground rounded-lg font-medium transition-colors"
        >
          Extract More
        </button>
        {onClose && (
          <button
            onClick={onClose}
            className="flex-1 px-4 py-3 bg-primary hover:bg-primary/90 text-primary-foreground rounded-lg font-medium transition-colors"
          >
            Done
          </button>
        )}
      </div>

      <p className="text-xs text-center text-muted-foreground mt-4">
        Note: In the full implementation, these tasks would be created via the Gateway API
      </p>
    </div>
  );
}

// Step indicator component
function StepIndicator({
  label,
  active,
  complete,
}: {
  label: string;
  active: boolean;
  complete: boolean;
}) {
  return (
    <div className="flex items-center gap-2">
      <div
        className={`
          w-6 h-6 rounded-full flex items-center justify-center text-xs font-medium transition-colors
          ${
            complete
              ? 'bg-primary text-primary-foreground'
              : active
                ? 'bg-primary/20 text-primary border-2 border-primary'
                : 'bg-secondary text-muted-foreground border-2 border-border'
          }
        `}
      >
        {complete ? '✓' : label.charAt(0)}
      </div>
      <span
        className={`text-sm font-medium ${
          active ? 'text-foreground' : 'text-muted-foreground'
        }`}
      >
        {label}
      </span>
    </div>
  );
}
