import { Node, Edge } from '@xyflow/react';
import {
  FileSearch,
  RefreshCw,
  ListChecks,
  Play,
  CheckCircle2,
  Shield,
  FileText,
  ClipboardList,
  Settings,
  CheckSquare,
  ChevronRight,
  FilePlus
} from 'lucide-react';
import { PRDStatus, WorkflowType } from '../../../types/prd';

export interface WorkflowNodeData {
  workflow?: WorkflowType;
  label: string;
  icon: any;
  statusTransition?: string;
  isAvailable: boolean;
  isExecuting: boolean;
  isCompleted: boolean;
  isPrimary: boolean;
  nodeColor: string;
  progress?: number;
  enableAnimations: boolean;
}

export function buildWorkflowGraph(
  currentStatus: PRDStatus,
  executingWorkflow: WorkflowType | null,
  isExecuting: boolean,
  enableAnimations: boolean = true
): { nodes: Node[]; edges: Edge[] } {
  // Node availability logic
  const isAvailable = (workflow: WorkflowType): boolean => {
    switch (workflow) {
      case 'plan-feature':
        return currentStatus === 'draft';
      case 'prime':
        return true; // Always available
      case 'plan':
        return currentStatus === 'in_review';
      case 'execute':
      case 'review':
      case 'validate':
        return ['approved', 'in_progress'].includes(currentStatus);
      case 'execution-report':
      case 'code-review':
      case 'system-review':
      case 'hackathon-complete':
        return currentStatus === 'complete';
      default:
        return false;
    }
  };

  // Primary action (recommended next step)
  const getPrimaryAction = (): WorkflowType | null => {
    switch (currentStatus) {
      case 'draft':
        return 'plan-feature';
      case 'in_review':
        return 'plan';
      case 'in_progress':
        return 'execute';
      default:
        return null;
    }
  };

  const primary = getPrimaryAction();

  // Define nodes
  const nodes: Node[] = [
    {
      id: 'create-plan',
      type: 'workflowNode',
      position: { x: 0, y: 0 }, // Will be set by layout
      data: {
        workflow: 'plan-feature' as WorkflowType,
        label: 'Create Plan',
        icon: FileSearch,
        statusTransition: 'Draft → Review',
        isAvailable: isAvailable('plan-feature'),
        isExecuting: executingWorkflow === 'plan-feature',
        isCompleted: ['in_review', 'approved', 'in_progress', 'complete'].includes(
          currentStatus
        ),
        isPrimary: primary === 'plan-feature',
        nodeColor: 'hsl(var(--primary))',
        enableAnimations
      }
    },
    {
      id: 'load-context',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        workflow: 'prime' as WorkflowType,
        label: 'Load Context',
        icon: RefreshCw,
        isAvailable: true,
        isExecuting: executingWorkflow === 'prime',
        isCompleted: false,
        isPrimary: false,
        nodeColor: '#6366f1',
        enableAnimations
      }
    },
    {
      id: 'break-down',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        workflow: 'plan' as WorkflowType,
        label: 'Break Down Tasks',
        icon: ListChecks,
        statusTransition: 'Review → Approved',
        isAvailable: isAvailable('plan'),
        isExecuting: executingWorkflow === 'plan',
        isCompleted: ['approved', 'in_progress', 'complete'].includes(currentStatus),
        isPrimary: primary === 'plan',
        nodeColor: '#3b82f6',
        enableAnimations
      }
    },
    {
      id: 'execute-step',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        workflow: 'execute' as WorkflowType,
        label: 'Execute Step',
        icon: Play,
        isAvailable: isAvailable('execute'),
        isExecuting: executingWorkflow === 'execute',
        isCompleted: false,
        isPrimary: primary === 'execute',
        nodeColor: '#3b82f6',
        enableAnimations
      }
    },
    {
      id: 'execute-formula',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        workflow: 'execute-formula' as WorkflowType,
        label: 'Execute with Formula',
        icon: ChevronRight,
        isAvailable: ['approved', 'in_progress'].includes(currentStatus),
        isExecuting: false,
        isCompleted: false,
        isPrimary: false,
        nodeColor: '#8b5cf6',
        enableAnimations
      }
    },
    {
      id: 'review-work',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        workflow: 'review' as WorkflowType,
        label: 'Review Work',
        icon: Shield,
        isAvailable: isAvailable('review'),
        isExecuting: executingWorkflow === 'review',
        isCompleted: false,
        isPrimary: false,
        nodeColor: '#3b82f6',
        enableAnimations
      }
    },
    {
      id: 'validate',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        workflow: 'validate' as WorkflowType,
        label: 'Validate & Complete',
        icon: CheckCircle2,
        statusTransition: 'Progress → Complete',
        isAvailable: isAvailable('validate'),
        isExecuting: executingWorkflow === 'validate',
        isCompleted: currentStatus === 'complete',
        isPrimary: false,
        nodeColor: '#22c55e',
        enableAnimations
      }
    },
    // Completion nodes
    {
      id: 'completion-hub',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Feature Complete',
        icon: CheckCircle2,
        isAvailable: false,
        isExecuting: false,
        isCompleted: currentStatus === 'complete',
        isPrimary: false,
        nodeColor: '#16a34a',
        enableAnimations
      }
    },
    {
      id: 'gen-report',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        workflow: 'execution-report' as WorkflowType,
        label: 'Generate Report',
        icon: FileText,
        isAvailable: isAvailable('execution-report'),
        isExecuting: executingWorkflow === 'execution-report',
        isCompleted: false,
        isPrimary: false,
        nodeColor: '#22c55e',
        enableAnimations
      }
    },
    {
      id: 'code-review',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        workflow: 'code-review' as WorkflowType,
        label: 'Code Review',
        icon: Shield,
        isAvailable: isAvailable('code-review'),
        isExecuting: executingWorkflow === 'code-review',
        isCompleted: false,
        isPrimary: false,
        nodeColor: '#22c55e',
        enableAnimations
      }
    },
    {
      id: 'system-review',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        workflow: 'system-review' as WorkflowType,
        label: 'System Review',
        icon: Settings,
        isAvailable: isAvailable('system-review'),
        isExecuting: executingWorkflow === 'system-review',
        isCompleted: false,
        isPrimary: false,
        nodeColor: '#22c55e',
        enableAnimations
      }
    },
    {
      id: 'final-checklist',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        workflow: 'hackathon-complete' as WorkflowType,
        label: 'Final Checklist',
        icon: CheckSquare,
        isAvailable: isAvailable('hackathon-complete'),
        isExecuting: executingWorkflow === 'hackathon-complete',
        isCompleted: false,
        isPrimary: false,
        nodeColor: '#22c55e',
        enableAnimations
      }
    }
  ];

  // Define edges (tree structure)
  const edges: Edge[] = [
    {
      id: 'e1',
      source: 'create-plan',
      target: 'load-context',
      type: 'workflowEdge',
      data: {
        isPrimary: true,
        isActive: currentStatus !== 'draft',
        isCompleted: currentStatus !== 'draft'
      }
    },
    {
      id: 'e2',
      source: 'load-context',
      target: 'break-down',
      type: 'workflowEdge',
      data: {
        isPrimary: true,
        isActive: ['in_review', 'approved', 'in_progress', 'complete'].includes(
          currentStatus
        ),
        isCompleted: ['approved', 'in_progress', 'complete'].includes(currentStatus)
      }
    },
    {
      id: 'e3',
      source: 'break-down',
      target: 'execute-step',
      type: 'workflowEdge',
      data: {
        isPrimary: true,
        isActive: ['approved', 'in_progress', 'complete'].includes(currentStatus),
        isCompleted: ['in_progress', 'complete'].includes(currentStatus)
      }
    },
    {
      id: 'e3b',
      source: 'break-down',
      target: 'execute-formula',
      type: 'workflowEdge',
      data: {
        isPrimary: false,
        isActive: false,
        isCompleted: false
      },
      style: { strokeDasharray: '5,5' } // Dashed for alternate path
    },
    {
      id: 'e4',
      source: 'execute-step',
      target: 'review-work',
      type: 'workflowEdge',
      data: {
        isPrimary: true,
        isActive: currentStatus === 'in_progress'
      }
    },
    {
      id: 'e5',
      source: 'execute-step',
      target: 'validate',
      type: 'workflowEdge',
      data: {
        isPrimary: true,
        isActive: currentStatus === 'in_progress'
      }
    },
    {
      id: 'e6',
      source: 'validate',
      target: 'completion-hub',
      type: 'workflowEdge',
      data: {
        isPrimary: true,
        isActive: currentStatus === 'complete',
        isCompleted: currentStatus === 'complete'
      }
    },
    // Completion branches
    {
      id: 'e7',
      source: 'completion-hub',
      target: 'gen-report',
      type: 'workflowEdge',
      data: { isActive: currentStatus === 'complete' }
    },
    {
      id: 'e8',
      source: 'completion-hub',
      target: 'code-review',
      type: 'workflowEdge',
      data: { isActive: currentStatus === 'complete' }
    },
    {
      id: 'e9',
      source: 'completion-hub',
      target: 'system-review',
      type: 'workflowEdge',
      data: { isActive: currentStatus === 'complete' }
    },
    {
      id: 'e10',
      source: 'completion-hub',
      target: 'final-checklist',
      type: 'workflowEdge',
      data: { isActive: currentStatus === 'complete' }
    }
  ];

  return { nodes, edges };
}

/**
 * Build a starter workflow graph when no PRD is selected.
 * Shows "Generate PRD" as the primary entry point with grayed-out preview nodes.
 */
export function buildStarterWorkflowGraph(
  enableAnimations: boolean = true
): { nodes: Node[]; edges: Edge[] } {
  const nodes: Node[] = [
    {
      id: 'generate-prd',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        workflow: 'generate-prd' as WorkflowType,
        label: 'Generate PRD',
        icon: FilePlus,
        statusTransition: '→ Draft',
        isAvailable: true,
        isExecuting: false,
        isCompleted: false,
        isPrimary: true,
        nodeColor: '#3b82f6',
        enableAnimations
      }
    },
    {
      id: 'create-plan-preview',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Create Plan',
        icon: FileSearch,
        isAvailable: false,
        isExecuting: false,
        isCompleted: false,
        isPrimary: false,
        nodeColor: 'hsl(var(--muted))',
        enableAnimations: false
      }
    },
    {
      id: 'load-context-preview',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Load Context',
        icon: RefreshCw,
        isAvailable: false,
        isExecuting: false,
        isCompleted: false,
        isPrimary: false,
        nodeColor: 'hsl(var(--muted))',
        enableAnimations: false
      }
    },
    {
      id: 'break-down-preview',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Break Down Tasks',
        icon: ListChecks,
        isAvailable: false,
        isExecuting: false,
        isCompleted: false,
        isPrimary: false,
        nodeColor: 'hsl(var(--muted))',
        enableAnimations: false
      }
    },
    {
      id: 'execute-preview',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Execute Step',
        icon: Play,
        isAvailable: false,
        isExecuting: false,
        isCompleted: false,
        isPrimary: false,
        nodeColor: 'hsl(var(--muted))',
        enableAnimations: false
      }
    },
    {
      id: 'validate-preview',
      type: 'workflowNode',
      position: { x: 0, y: 0 },
      data: {
        label: 'Validate & Complete',
        icon: CheckCircle2,
        isAvailable: false,
        isExecuting: false,
        isCompleted: false,
        isPrimary: false,
        nodeColor: 'hsl(var(--muted))',
        enableAnimations: false
      }
    }
  ];

  const edges: Edge[] = [
    {
      id: 'e-start-1',
      source: 'generate-prd',
      target: 'create-plan-preview',
      type: 'workflowEdge',
      data: { isPrimary: false, isActive: false }
    },
    {
      id: 'e-start-2',
      source: 'create-plan-preview',
      target: 'load-context-preview',
      type: 'workflowEdge',
      data: { isPrimary: false, isActive: false }
    },
    {
      id: 'e-start-3',
      source: 'load-context-preview',
      target: 'break-down-preview',
      type: 'workflowEdge',
      data: { isPrimary: false, isActive: false }
    },
    {
      id: 'e-start-4',
      source: 'break-down-preview',
      target: 'execute-preview',
      type: 'workflowEdge',
      data: { isPrimary: false, isActive: false }
    },
    {
      id: 'e-start-5',
      source: 'execute-preview',
      target: 'validate-preview',
      type: 'workflowEdge',
      data: { isPrimary: false, isActive: false }
    }
  ];

  return { nodes, edges };
}

/**
 * Workflow Node Metadata for detail panel display
 */
export interface WorkflowNodeMeta {
  workflow: WorkflowType;
  label: string;
  icon: any;
  description: string;
  statusTransition?: string;
  requiredStatus: PRDStatus[];
  executionTime?: string;
}

export const WORKFLOW_NODE_META: Record<string, WorkflowNodeMeta> = {
  'generate-prd': {
    workflow: 'generate-prd',
    label: 'Generate PRD',
    icon: FilePlus,
    description: 'Create a new Product Requirements Document using AI to analyze your codebase and generate specifications.',
    requiredStatus: [],  // Always available (no PRD needed)
  },
  'plan-feature': {
    workflow: 'plan-feature',
    label: 'Create Plan',
    icon: FileSearch,
    description: 'Analyze the PRD and create a detailed implementation plan with step-by-step tasks. This generates a structured breakdown of work items.',
    statusTransition: 'Draft → In Review',
    requiredStatus: ['draft'],
    executionTime: '2-5 minutes',
  },
  'prime': {
    workflow: 'prime',
    label: 'Load Context',
    icon: RefreshCw,
    description: 'Load codebase context including symbols, routes, and dependencies to inform the workflow. Refreshes understanding of the project structure.',
    requiredStatus: ['draft', 'in_review', 'approved', 'in_progress', 'complete'],
    executionTime: '1-2 minutes',
  },
  'plan': {
    workflow: 'plan',
    label: 'Break Down Tasks',
    icon: ListChecks,
    description: 'Break down the feature into granular, executable tasks with clear acceptance criteria and dependencies.',
    statusTransition: 'In Review → Approved',
    requiredStatus: ['in_review'],
    executionTime: '3-5 minutes',
  },
  'execute': {
    workflow: 'execute',
    label: 'Execute Step',
    icon: Play,
    description: 'Execute the next implementation step from the plan. Generates code changes, tests, and documentation updates.',
    requiredStatus: ['approved', 'in_progress'],
    executionTime: '5-15 minutes',
  },
  'execute-formula': {
    workflow: 'execute-formula',
    label: 'Execute with Formula',
    icon: ChevronRight,
    description: 'Run the PRD-First formula which orchestrates the complete implementation workflow with variable pre-filling.',
    requiredStatus: ['approved', 'in_progress'],
  },
  'review': {
    workflow: 'review',
    label: 'Review Work',
    icon: Shield,
    description: 'Review completed work against acceptance criteria. Check for quality, correctness, and adherence to requirements.',
    requiredStatus: ['approved', 'in_progress'],
    executionTime: '3-5 minutes',
  },
  'validate': {
    workflow: 'validate',
    label: 'Validate & Complete',
    icon: CheckCircle2,
    description: 'Final validation of the implementation. Verify all acceptance criteria are met and mark the feature as complete.',
    statusTransition: 'In Progress → Complete',
    requiredStatus: ['approved', 'in_progress'],
    executionTime: '2-3 minutes',
  },
  'execution-report': {
    workflow: 'execution-report',
    label: 'Generate Report',
    icon: FileText,
    description: 'Generate a comprehensive execution report documenting changes made, decisions taken, and lessons learned.',
    requiredStatus: ['complete'],
    executionTime: '2-3 minutes',
  },
  'code-review': {
    workflow: 'code-review',
    label: 'Code Review',
    icon: Shield,
    description: 'Perform automated code review checking for bugs, security issues, performance problems, and code quality.',
    requiredStatus: ['complete'],
    executionTime: '3-5 minutes',
  },
  'system-review': {
    workflow: 'system-review',
    label: 'System Review',
    icon: Settings,
    description: 'Review system-wide impacts including architecture, integrations, and operational considerations.',
    requiredStatus: ['complete'],
    executionTime: '3-5 minutes',
  },
  'hackathon-complete': {
    workflow: 'hackathon-complete',
    label: 'Final Checklist',
    icon: CheckSquare,
    description: 'Run through the final checklist to ensure everything is properly documented, tested, and ready for deployment.',
    requiredStatus: ['complete'],
    executionTime: '2-3 minutes',
  },
};

export function getWorkflowNodeMeta(workflow: WorkflowType | null): WorkflowNodeMeta | null {
  if (!workflow) return null;
  return WORKFLOW_NODE_META[workflow] || null;
}
