/**
 * PRD (Product Requirements Document) Types
 *
 * Follows the pattern established by ideation.ts
 */

export type PRDScope = 'feature' | 'epic' | 'task';
export type PRDStatus = 'draft' | 'in_review' | 'approved' | 'in_progress' | 'complete';

/**
 * Workflow types for PRD execution
 */
export type WorkflowType =
  | 'generate-prd'  // First step - create a new PRD
  | 'plan-feature'
  | 'prime'
  | 'plan'
  | 'execute'
  | 'execute-formula'
  | 'review'
  | 'validate'
  | 'execution-report'
  | 'code-review'
  | 'system-review'
  | 'hackathon-complete';

/**
 * Product Requirements Document
 */
export interface PRD {
  id: string;
  title: string;
  scope: PRDScope;
  status: PRDStatus;
  content: string; // Full markdown content
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  metadata?: {
    author?: string;
    stakeholders?: string[];
    estimated_effort?: string;
    tags?: string[];
  };
}

/**
 * Configuration for generating a new PRD
 */
export interface PRDConfig {
  title: string;
  description: string;
  scope: PRDScope;
  includeTechSpec: boolean;
  includeAcceptance: boolean;
  model?: string; // LLM model to use (default: mistralai/devstral-small-2-2512)
}

/**
 * PRD session summary for session list
 */
export interface PRDSession {
  id: string;
  name: string;
  description: string;
  prd_count: number;
  created_at: string;
  updated_at: string;
}

/**
 * Saved PRD session with full data
 */
export interface SavedPRDSession {
  id: string;
  name: string;
  description: string;
  prds: PRD[];
  created_at: string;
  updated_at: string;
}

/**
 * API Request for PRD generation
 */
export interface PRDGenerateRequest {
  title: string;
  description: string;
  scope: PRDScope;
  include_tech_spec: boolean;
  include_acceptance: boolean;
  model?: string;
}

/**
 * API Response for PRD generation
 */
export interface PRDResponse {
  ok: boolean;
  data?: PRD;
  error?: string;

  // Task creation fallback (when LMStudio unavailable)
  task_created?: boolean;
  task_id?: string;
  message?: string;
}

/**
 * API Response for listing PRDs
 */
export interface PRDListResponse {
  ok: boolean;
  data?: PRD[];
  error?: string;
}

/**
 * API Response for session operations
 */
export interface PRDSessionResponse {
  ok: boolean;
  data?: PRDSession;
  error?: string;
}
