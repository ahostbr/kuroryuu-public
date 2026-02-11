/**
 * GitHub Workflow type definitions
 */

export type PRState = 'open' | 'closed' | 'merged';
export type ReviewVerdict = 'PASS' | 'PASS_WITH_CHANGES' | 'NEEDS_WORK';

export interface TaskPR {
  number: number;
  url: string;
  state: PRState;
  title?: string;
  review_status?: ReviewVerdict;
  review_file?: string;
}

export interface PRInfo {
  number: number;
  url: string;
  state: string;
  title: string;
  body: string;
  head: string;
  base: string;
  created_at: string;
  merged: boolean;
  mergeable: boolean | null;
}

export interface PRReviewResult {
  verdict: ReviewVerdict;
  summary: string;
  issues: PRReviewIssue[];
  must_fix: string[];
  should_fix: string[];
}

export interface PRReviewIssue {
  severity: 'critical' | 'warning' | 'info';
  description: string;
  file?: string;
  suggestion?: string;
}

export interface WorkflowConfig {
  enabled: boolean;
  autoCreateWorktree: boolean;
  autoCreatePR: boolean;
  requireReviewBeforeMerge: boolean;
  defaultBaseBranch: string;
  branchPrefix: string;
  autoDeleteBranchAfterMerge: boolean;
}

export interface TaskWorkflowMeta {
  worktree_id?: string;
  branch_name?: string;
  pr?: TaskPR;
}
