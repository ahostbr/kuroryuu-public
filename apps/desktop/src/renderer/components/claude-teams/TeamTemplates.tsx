/**
 * Team Templates - Preset team configurations for quick setup
 *
 * Provides built-in templates for common team patterns:
 * - Code Review Team
 * - Feature Dev Team
 * - Research Team
 * - Debug Team
 */
import { useState } from 'react';
import { Layout, Code, Search, Bug, Users, ChevronRight } from 'lucide-react';

export interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  icon: React.ElementType;
  teammateCount: number;
  teammates: {
    name: string;
    prompt: string;
    model?: string;
    color?: string;
    planModeRequired?: boolean;
  }[];
}

const BUILT_IN_TEMPLATES: TeamTemplate[] = [
  {
    id: 'code-review',
    name: 'Code Review Team',
    description: 'Three specialized reviewers focusing on security, performance, and testing aspects of code changes.',
    icon: Code,
    teammateCount: 3,
    teammates: [
      {
        name: 'security-reviewer',
        prompt: 'You are a security-focused code reviewer. Analyze code for security vulnerabilities, unsafe patterns, input validation issues, authentication/authorization flaws, and potential exploits. Provide actionable security recommendations.',
        model: 'claude-sonnet-4-5-20250929',
        color: 'red',
      },
      {
        name: 'performance-reviewer',
        prompt: 'You are a performance-focused code reviewer. Analyze code for performance bottlenecks, inefficient algorithms, memory leaks, unnecessary computations, and optimization opportunities. Suggest performance improvements with measurable impact.',
        model: 'claude-sonnet-4-5-20250929',
        color: 'orange',
      },
      {
        name: 'test-reviewer',
        prompt: 'You are a testing-focused code reviewer. Analyze code for test coverage gaps, edge cases, missing assertions, brittle tests, and testing best practices. Recommend test improvements and new test cases.',
        model: 'claude-sonnet-4-5-20250929',
        color: 'green',
      },
    ],
  },
  {
    id: 'feature-dev',
    name: 'Feature Dev Team',
    description: 'Full feature development team with architect, implementers, and reviewer for building complex features.',
    icon: Layout,
    teammateCount: 4,
    teammates: [
      {
        name: 'architect',
        prompt: 'You are the feature architect. Design high-level architecture, define interfaces, plan data models, identify technical risks, and create implementation roadmaps. Always work in plan mode before implementation.',
        model: 'claude-opus-4-6',
        color: 'purple',
        planModeRequired: true,
      },
      {
        name: 'implementer-1',
        prompt: 'You are a backend implementer. Focus on server-side logic, API endpoints, database operations, business logic, and backend services. Write clean, maintainable, well-tested code.',
        model: 'claude-sonnet-4-5-20250929',
        color: 'blue',
      },
      {
        name: 'implementer-2',
        prompt: 'You are a frontend implementer. Focus on UI components, state management, user interactions, accessibility, and frontend integration. Write clean, maintainable, well-tested code.',
        model: 'claude-sonnet-4-5-20250929',
        color: 'cyan',
      },
      {
        name: 'reviewer',
        prompt: 'You are the code reviewer. Review all implementations for correctness, consistency, best practices, edge cases, and integration issues. Ensure code quality and alignment with architecture.',
        model: 'claude-sonnet-4-5-20250929',
        color: 'green',
      },
    ],
  },
  {
    id: 'research',
    name: 'Research Team',
    description: 'Three researchers with different perspectives for thorough investigation and analysis.',
    icon: Search,
    teammateCount: 3,
    teammates: [
      {
        name: 'researcher-breadth',
        prompt: 'You are a breadth-first researcher. Cast a wide net, explore multiple approaches, gather diverse sources, identify patterns across domains, and provide comprehensive overviews. Think laterally and make unexpected connections.',
        model: 'claude-sonnet-4-5-20250929',
        color: 'blue',
      },
      {
        name: 'researcher-depth',
        prompt: 'You are a depth-first researcher. Dive deep into specific topics, analyze primary sources, trace historical context, understand nuances, and provide detailed technical analysis. Be thorough and precise.',
        model: 'claude-sonnet-4-5-20250929',
        color: 'purple',
      },
      {
        name: 'researcher-critical',
        prompt: 'You are a critical researcher. Question assumptions, identify biases, evaluate evidence quality, spot logical flaws, and challenge conclusions. Play devil\'s advocate and ensure rigor.',
        model: 'claude-sonnet-4-5-20250929',
        color: 'red',
      },
    ],
  },
  {
    id: 'debug',
    name: 'Debug Team',
    description: 'Three investigators with competing hypotheses to systematically narrow down bugs.',
    icon: Bug,
    teammateCount: 3,
    teammates: [
      {
        name: 'investigator-data',
        prompt: 'You are a data-focused debugger. Analyze logs, traces, error messages, stack traces, and runtime data. Form hypotheses based on observable evidence. Propose targeted experiments to test your theories.',
        model: 'claude-sonnet-4-5-20250929',
        color: 'orange',
      },
      {
        name: 'investigator-code',
        prompt: 'You are a code-focused debugger. Analyze code paths, control flow, state mutations, and function interactions. Identify suspicious patterns and potential logic errors. Propose code-level hypotheses and verification steps.',
        model: 'claude-sonnet-4-5-20250929',
        color: 'blue',
      },
      {
        name: 'investigator-system',
        prompt: 'You are a system-focused debugger. Consider environment, dependencies, configuration, timing, concurrency, and external factors. Identify system-level issues and integration problems. Propose environmental hypotheses.',
        model: 'claude-sonnet-4-5-20250929',
        color: 'purple',
      },
    ],
  },
];

export interface TeamTemplatesProps {
  onSelectTemplate: (template: TeamTemplate) => void;
  onClose?: () => void;
}

export function TeamTemplates({ onSelectTemplate, onClose }: TeamTemplatesProps) {
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const handleSelect = (template: TeamTemplate) => {
    setSelectedId(template.id);
    onSelectTemplate(template);
  };

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h2 className="text-lg font-semibold text-foreground">Team Templates</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a pre-configured team to get started quickly
          </p>
        </div>
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

      {/* Template Grid */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-5xl mx-auto">
          {BUILT_IN_TEMPLATES.map((template) => {
            const Icon = template.icon;
            const isSelected = selectedId === template.id;

            return (
              <div
                key={template.id}
                className={`
                  bg-secondary/50 rounded-lg p-5 border transition-all cursor-pointer
                  hover:bg-secondary hover:border-primary/50
                  ${isSelected ? 'border-primary bg-secondary' : 'border-border'}
                `}
                onClick={() => handleSelect(template)}
              >
                {/* Template Header */}
                <div className="flex items-start gap-3 mb-3">
                  <div className="p-2 rounded-md bg-primary/10 text-primary">
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1">
                    <h3 className="font-semibold text-foreground">{template.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-flex items-center gap-1 text-xs bg-primary/20 text-primary px-2 py-0.5 rounded-full">
                        <Users className="w-3 h-3" />
                        {template.teammateCount} teammates
                      </span>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <p className="text-sm text-muted-foreground mb-4 leading-relaxed">
                  {template.description}
                </p>

                {/* Teammate List */}
                <div className="space-y-2 mb-4">
                  {template.teammates.map((teammate, idx) => (
                    <div
                      key={idx}
                      className="flex items-center gap-2 text-xs text-muted-foreground"
                    >
                      <div
                        className="w-2 h-2 rounded-full"
                        style={{
                          backgroundColor: teammate.color || '#888',
                        }}
                      />
                      <span className="font-medium text-foreground">{teammate.name}</span>
                      {teammate.planModeRequired && (
                        <span className="text-xs bg-blue-500/20 text-blue-400 px-1.5 py-0.5 rounded">
                          plan mode
                        </span>
                      )}
                    </div>
                  ))}
                </div>

                {/* Use Button */}
                <button
                  className={`
                    w-full flex items-center justify-center gap-2 px-4 py-2 rounded-md
                    font-medium text-sm transition-colors
                    ${
                      isSelected
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                    }
                  `}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSelect(template);
                  }}
                >
                  {isSelected ? (
                    <>
                      Selected
                      <ChevronRight className="w-4 h-4" />
                    </>
                  ) : (
                    <>
                      Use Template
                      <ChevronRight className="w-4 h-4" />
                    </>
                  )}
                </button>
              </div>
            );
          })}
        </div>
      </div>

      {/* Footer */}
      <div className="p-4 border-t border-border bg-secondary/30">
        <p className="text-xs text-muted-foreground text-center">
          Templates provide starting configurations. You can customize teammates and settings after creation.
        </p>
      </div>
    </div>
  );
}
