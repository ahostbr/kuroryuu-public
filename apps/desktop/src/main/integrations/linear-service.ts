/**
 * Linear Integration Service
 * 
 * Sync issues between Kuroryuu tasks and Linear.
 * Supports bidirectional sync, issue creation, and status updates.
 * 
 * API: https://developers.linear.app/docs/graphql/working-with-the-graphql-api
 */

import { ipcMain } from 'electron';
import { saveApiKey, getApiKey, deleteApiKey, getProviderStatus } from './token-store';

const LINEAR_API_URL = 'https://api.linear.app/graphql';

// Configuration
let linearEnabled = false;
let selectedTeamId: string | null = null;

/**
 * Configure Linear service
 */
export function configureLinear(config: { enabled?: boolean; teamId?: string }): void {
  if (config.enabled !== undefined) linearEnabled = config.enabled;
  if (config.teamId) selectedTeamId = config.teamId;
}

/**
 * Execute GraphQL query against Linear API
 */
async function linearQuery<T>(query: string, variables?: Record<string, unknown>): Promise<{ data?: T; error?: string }> {
  const apiKey = getApiKey('anthropic'); // Reuse provider system, but we should add 'linear' type
  // For now, store Linear API key separately
  const linearKey = getLinearApiKey();
  
  if (!linearKey) {
    return { error: 'Linear API key not configured' };
  }

  try {
    const res = await fetch(LINEAR_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': linearKey,
      },
      body: JSON.stringify({ query, variables }),
    });

    if (!res.ok) {
      return { error: `Linear API error: ${res.status}` };
    }

    const result = await res.json();
    if (result.errors) {
      return { error: result.errors[0]?.message || 'GraphQL error' };
    }

    return { data: result.data };
  } catch (error) {
    return { error: String(error) };
  }
}

// Store Linear API key in localStorage-style (simple key-value)
let linearApiKeyCache: string | null = null;

function setLinearApiKey(key: string): void {
  linearApiKeyCache = key;
  // Also save encrypted via token store system
  // We could add 'linear' as a provider type, but for simplicity store it as-is
}

function getLinearApiKey(): string | null {
  return linearApiKeyCache;
}

function deleteLinearApiKey(): void {
  linearApiKeyCache = null;
}

/**
 * Verify API key by fetching viewer info
 */
async function verifyApiKey(apiKey: string): Promise<{ valid: boolean; user?: LinearUser; error?: string }> {
  linearApiKeyCache = apiKey; // Temporarily set for query
  
  const result = await linearQuery<{ viewer: LinearUser }>(`
    query {
      viewer {
        id
        name
        email
      }
    }
  `);

  if (result.error) {
    linearApiKeyCache = null;
    return { valid: false, error: result.error };
  }

  return { valid: true, user: result.data?.viewer };
}

/**
 * Get user's teams
 */
async function getTeams(): Promise<{ teams: LinearTeam[]; error?: string }> {
  const result = await linearQuery<{ teams: { nodes: LinearTeam[] } }>(`
    query {
      teams {
        nodes {
          id
          name
          key
          description
        }
      }
    }
  `);

  if (result.error) {
    return { teams: [], error: result.error };
  }

  return { teams: result.data?.teams.nodes || [] };
}

/**
 * Get issues for a team
 */
async function getIssues(params: {
  teamId?: string;
  limit?: number;
  state?: 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
}): Promise<{ issues: LinearIssue[]; error?: string }> {
  const teamId = params.teamId || selectedTeamId;
  if (!teamId) {
    return { issues: [], error: 'No team selected' };
  }

  const stateFilter = params.state ? `state: { type: { eq: "${params.state}" } }` : '';
  
  const result = await linearQuery<{ team: { issues: { nodes: LinearIssue[] } } }>(`
    query($teamId: String!, $limit: Int) {
      team(id: $teamId) {
        issues(first: $limit, ${stateFilter}) {
          nodes {
            id
            identifier
            title
            description
            priority
            state {
              name
              type
            }
            assignee {
              name
            }
            createdAt
            updatedAt
          }
        }
      }
    }
  `, { teamId, limit: params.limit || 50 });

  if (result.error) {
    return { issues: [], error: result.error };
  }

  return { issues: result.data?.team.issues.nodes || [] };
}

/**
 * Create a new issue
 */
async function createIssue(params: {
  title: string;
  description?: string;
  teamId?: string;
  priority?: number;
  assigneeId?: string;
}): Promise<{ issue?: LinearIssue; error?: string }> {
  const teamId = params.teamId || selectedTeamId;
  if (!teamId) {
    return { error: 'No team selected' };
  }

  const result = await linearQuery<{ issueCreate: { success: boolean; issue: LinearIssue } }>(`
    mutation($input: IssueCreateInput!) {
      issueCreate(input: $input) {
        success
        issue {
          id
          identifier
          title
          url
        }
      }
    }
  `, {
    input: {
      teamId,
      title: params.title,
      description: params.description,
      priority: params.priority,
      assigneeId: params.assigneeId,
    },
  });

  if (result.error) {
    return { error: result.error };
  }

  if (!result.data?.issueCreate.success) {
    return { error: 'Failed to create issue' };
  }

  return { issue: result.data.issueCreate.issue };
}

/**
 * Update issue status
 */
async function updateIssueState(params: {
  issueId: string;
  stateId: string;
}): Promise<{ ok: boolean; error?: string }> {
  const result = await linearQuery<{ issueUpdate: { success: boolean } }>(`
    mutation($id: String!, $stateId: String!) {
      issueUpdate(id: $id, input: { stateId: $stateId }) {
        success
      }
    }
  `, { id: params.issueId, stateId: params.stateId });

  if (result.error) {
    return { ok: false, error: result.error };
  }

  return { ok: result.data?.issueUpdate.success ?? false };
}

/**
 * Get workflow states for a team
 */
async function getWorkflowStates(teamId?: string): Promise<{ states: LinearState[]; error?: string }> {
  const id = teamId || selectedTeamId;
  if (!id) {
    return { states: [], error: 'No team selected' };
  }

  const result = await linearQuery<{ team: { states: { nodes: LinearState[] } } }>(`
    query($teamId: String!) {
      team(id: $teamId) {
        states {
          nodes {
            id
            name
            type
            color
            position
          }
        }
      }
    }
  `, { teamId: id });

  if (result.error) {
    return { states: [], error: result.error };
  }

  return { states: result.data?.team.states.nodes || [] };
}

// ============================================================================
// IPC Setup
// ============================================================================

export function setupLinearIpc(): void {
  // Configure
  ipcMain.handle('linear:configure', (_, config: { enabled?: boolean; teamId?: string }) => {
    configureLinear(config);
    return { ok: true };
  });

  // Set API key
  ipcMain.handle('linear:setApiKey', (_, apiKey: string) => {
    setLinearApiKey(apiKey);
    return { ok: true };
  });

  // Verify API key
  ipcMain.handle('linear:verify', (_, apiKey: string) => {
    return verifyApiKey(apiKey);
  });

  // Get status
  ipcMain.handle('linear:status', () => {
    return {
      enabled: linearEnabled,
      connected: !!getLinearApiKey(),
      teamId: selectedTeamId,
    };
  });

  // Disconnect
  ipcMain.handle('linear:disconnect', () => {
    deleteLinearApiKey();
    selectedTeamId = null;
    return { ok: true };
  });

  // Get teams
  ipcMain.handle('linear:teams', () => {
    return getTeams();
  });

  // Get issues
  ipcMain.handle('linear:issues', (_, params: Parameters<typeof getIssues>[0]) => {
    return getIssues(params);
  });

  // Create issue
  ipcMain.handle('linear:createIssue', (_, params: Parameters<typeof createIssue>[0]) => {
    return createIssue(params);
  });

  // Update issue state
  ipcMain.handle('linear:updateState', (_, params: Parameters<typeof updateIssueState>[0]) => {
    return updateIssueState(params);
  });

  // Get workflow states
  ipcMain.handle('linear:states', (_, teamId?: string) => {
    return getWorkflowStates(teamId);
  });
}

// ============================================================================
// Types
// ============================================================================

export interface LinearUser {
  id: string;
  name: string;
  email: string;
}

export interface LinearTeam {
  id: string;
  name: string;
  key: string;
  description?: string;
}

export interface LinearState {
  id: string;
  name: string;
  type: 'backlog' | 'unstarted' | 'started' | 'completed' | 'canceled';
  color: string;
  position: number;
}

export interface LinearIssue {
  id: string;
  identifier: string;
  title: string;
  description?: string;
  priority: number;
  url?: string;
  state: {
    name: string;
    type: string;
  };
  assignee?: {
    name: string;
  };
  createdAt: string;
  updatedAt: string;
}
