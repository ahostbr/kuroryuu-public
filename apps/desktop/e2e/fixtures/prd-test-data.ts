/**
 * Test data fixtures for PRD Workflow E2E tests
 */

export type PRDStatus = 'draft' | 'in_review' | 'approved' | 'in_progress' | 'complete' | 'archived';
export type PRDScope = 'feature' | 'bugfix' | 'refactor' | 'research' | 'other';

export interface PRD {
  id: string;
  title: string;
  scope: PRDScope;
  status: PRDStatus;
  content: string;
  created_at: string;
  updated_at: string;
  is_archived: boolean;
  metadata?: {
    author?: string;
    tags?: string[];
  };
}

export function createTestPRD(overrides: Partial<PRD> = {}): PRD {
  const now = new Date().toISOString();
  const id = `test-prd-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  return {
    id,
    title: 'Test PRD: User Authentication Feature',
    scope: 'feature',
    status: 'draft',
    content: `## Overview
Implement user authentication with OAuth2.

## Acceptance Criteria
- Users can sign in with Google
- Session persists across browser refresh
- Logout functionality works correctly

## Technical Notes
- Use NextAuth.js for OAuth handling
- Store sessions in PostgreSQL`,
    created_at: now,
    updated_at: now,
    is_archived: false,
    metadata: {
      author: 'E2E Test',
      tags: ['auth', 'security', 'test'],
    },
    ...overrides,
  };
}

// Pre-built PRDs for each status
export const TEST_PRDS = {
  draft: createTestPRD({
    status: 'draft',
    title: 'Test PRD: Draft Feature'
  }),
  inReview: createTestPRD({
    status: 'in_review',
    title: 'Test PRD: In Review Feature'
  }),
  approved: createTestPRD({
    status: 'approved',
    title: 'Test PRD: Approved Feature'
  }),
  inProgress: createTestPRD({
    status: 'in_progress',
    title: 'Test PRD: In Progress Feature'
  }),
  complete: createTestPRD({
    status: 'complete',
    title: 'Test PRD: Complete Feature'
  }),
};

// Status transition scenarios for parametrized tests
export const STATUS_TRANSITION_SCENARIOS = [
  {
    workflow: 'plan-feature',
    fromStatus: 'draft' as PRDStatus,
    toStatus: 'in_review' as PRDStatus,
    description: 'Plan Feature: draft → in_review'
  },
  {
    workflow: 'plan',
    fromStatus: 'in_review' as PRDStatus,
    toStatus: 'approved' as PRDStatus,
    description: 'Plan: in_review → approved'
  },
  {
    workflow: 'execute',
    fromStatus: 'approved' as PRDStatus,
    toStatus: 'in_progress' as PRDStatus,
    description: 'Execute: approved → in_progress'
  },
  {
    workflow: 'validate',
    fromStatus: 'in_progress' as PRDStatus,
    toStatus: 'complete' as PRDStatus,
    description: 'Validate: in_progress → complete'
  },
] as const;

// Workflow metadata for testing
export const WORKFLOW_METADATA = {
  'plan-feature': {
    label: 'Create Plan',
    requiredStatus: ['draft'],
    isPlanningNode: true,
  },
  'plan': {
    label: 'Refine Plan',
    requiredStatus: ['in_review'],
    isPlanningNode: true,
  },
  'prime': {
    label: 'Prime Context',
    requiredStatus: ['approved'],
    isPlanningNode: false,
  },
  'execute': {
    label: 'Execute',
    requiredStatus: ['approved', 'in_progress'],
    isPlanningNode: false,
  },
  'review': {
    label: 'Code Review',
    requiredStatus: ['in_progress'],
    isPlanningNode: false,
  },
  'validate': {
    label: 'Validate',
    requiredStatus: ['in_progress'],
    isPlanningNode: false,
  },
} as const;
