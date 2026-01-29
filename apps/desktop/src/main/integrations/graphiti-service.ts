/**
 * Graphiti Memory Service
 *
 * Integration with Graphiti knowledge graph for persistent memory.
 * Provides semantic search, episode tracking, and memory management.
 *
 * Default server: http://localhost:8000
 *
 * Graphiti API Endpoints:
 * - GET  /healthcheck
 * - POST /search         { group_ids[], query, max_facts }
 * - POST /get-memory     { group_id, messages[], max_facts }
 * - POST /messages       { group_id, messages[] }
 * - POST /entity-node    { uuid, group_id, name, summary }
 * - GET  /episodes/{group_id}?last_n=N
 * - POST /clear
 */

import { ipcMain, app } from 'electron';
import { randomUUID } from 'crypto';
import { spawn, ChildProcess, execSync } from 'child_process';
import * as path from 'path';
import * as fs from 'fs';
import { getGraphitiServerDir } from '../utils/paths';

// Configuration
let graphitiUrl = 'http://localhost:8000';
let neo4jUrl = 'http://localhost:7474';
let neo4jUser = 'neo4j';
let neo4jPassword = 'password'; // Docker default - override via configureGraphiti()
let graphitiEnabled = false;
const DEFAULT_GROUP_ID = 'kuroryuu';

// Server process tracking
let serverProcess: ChildProcess | null = null;
let launchedWithDocker = false;
let dockerComposeDir: string | null = null;

// Graphiti server directory (path-agnostic)
const GRAPHITI_SERVER_DIR = getGraphitiServerDir();

/**
 * Configure Graphiti service
 */
export function configureGraphiti(config: {
  url?: string;
  enabled?: boolean;
  neo4jUrl?: string;
  neo4jUser?: string;
  neo4jPassword?: string;
}): void {
  if (config.url) graphitiUrl = config.url;
  if (config.enabled !== undefined) graphitiEnabled = config.enabled;
  if (config.neo4jUrl) neo4jUrl = config.neo4jUrl;
  if (config.neo4jUser) neo4jUser = config.neo4jUser;
  if (config.neo4jPassword) neo4jPassword = config.neo4jPassword;
}

/**
 * Check if Graphiti is enabled and reachable
 */
async function checkHealth(): Promise<{ ok: boolean; error?: string }> {
  if (!graphitiEnabled) {
    return { ok: false, error: 'Graphiti is not enabled' };
  }

  try {
    const res = await fetch(`${graphitiUrl}/healthcheck`, {
      method: 'GET',
      signal: AbortSignal.timeout(5000),
    });
    return { ok: res.ok };
  } catch (error) {
    return { ok: false, error: `Cannot reach Graphiti at ${graphitiUrl}` };
  }
}

/**
 * Query the memory graph using Graphiti's /search endpoint
 * Transforms Graphiti's {facts[]} response to {nodes[], edges[]}
 */
async function query(params: {
  query: string;
  projectId?: string;
  limit?: number;
}): Promise<GraphitiQueryResult> {
  if (!graphitiEnabled) {
    return { nodes: [], edges: [], error: 'Graphiti is not enabled' };
  }

  try {
    const groupId = params.projectId || DEFAULT_GROUP_ID;
    const res = await fetch(`${graphitiUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_ids: [groupId],
        query: params.query,
        max_facts: params.limit ?? 10,
      }),
    });

    if (!res.ok) {
      return { nodes: [], edges: [], error: `Query failed: ${res.status}` };
    }

    const data = await res.json() as GraphitiSearchResponse;

    // Transform Graphiti facts to nodes
    const nodes: GraphitiNode[] = (data.facts || []).map((fact) => ({
      id: fact.uuid,
      type: 'fact' as const,
      content: fact.fact,
      createdAt: fact.created_at,
      metadata: {
        name: fact.name,
        valid_at: fact.valid_at,
        invalid_at: fact.invalid_at,
        expired_at: fact.expired_at,
      },
    }));

    return { nodes, edges: [] };
  } catch (error) {
    return { nodes: [], edges: [], error: String(error) };
  }
}

/**
 * Add a memory to the graph
 * Uses /messages for episodic content or /entity-node for entities
 */
async function addMemory(params: {
  content: string;
  type: 'fact' | 'event' | 'entity' | 'preference';
  projectId?: string;
  metadata?: Record<string, unknown>;
}): Promise<{ ok: boolean; nodeId?: string; error?: string }> {
  if (!graphitiEnabled) {
    return { ok: false, error: 'Graphiti is not enabled' };
  }

  const groupId = params.projectId || DEFAULT_GROUP_ID;

  try {
    if (params.type === 'entity') {
      // Use /entity-node for entities
      const uuid = randomUUID();
      const res = await fetch(`${graphitiUrl}/entity-node`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          uuid,
          group_id: groupId,
          name: (params.metadata?.name as string) || params.content.slice(0, 50),
          summary: params.content,
        }),
      });

      if (!res.ok) {
        return { ok: false, error: `Add entity failed: ${res.status}` };
      }

      const data = await res.json();
      return { ok: true, nodeId: data.uuid || uuid };
    } else {
      // Use /messages for facts, events, preferences (episodic content)
      const res = await fetch(`${graphitiUrl}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          group_id: groupId,
          messages: [{
            content: params.content,
            role_type: 'assistant',
            role: 'kuroryuu',
            name: params.type,
            source_description: `Kuroryuu ${params.type}`,
          }],
        }),
      });

      if (!res.ok) {
        return { ok: false, error: `Add message failed: ${res.status}` };
      }

      return { ok: true, nodeId: `msg-${Date.now()}` };
    }
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Semantic search across memory using Graphiti's /search endpoint
 */
async function search(params: {
  query: string;
  projectId?: string;
  topK?: number;
  threshold?: number;
}): Promise<GraphitiSearchResult> {
  if (!graphitiEnabled) {
    return { results: [], error: 'Graphiti is not enabled' };
  }

  try {
    const groupId = params.projectId || DEFAULT_GROUP_ID;
    const res = await fetch(`${graphitiUrl}/search`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        group_ids: [groupId],
        query: params.query,
        max_facts: params.topK ?? 10,
      }),
    });

    if (!res.ok) {
      return { results: [], error: `Search failed: ${res.status}` };
    }

    const data = await res.json() as GraphitiSearchResponse;

    // Transform facts to search results
    const results = (data.facts || []).map((fact, index) => ({
      node: {
        id: fact.uuid,
        type: 'fact' as const,
        content: fact.fact,
        createdAt: fact.created_at,
        metadata: { name: fact.name },
      },
      score: 1 - (index * 0.1), // Approximate score based on order
      snippet: fact.fact.slice(0, 200),
    }));

    return { results };
  } catch (error) {
    return { results: [], error: String(error) };
  }
}

/**
 * Get episode history using Graphiti's GET /episodes/{group_id}
 */
async function getEpisodes(params: {
  projectId?: string;
  limit?: number;
  since?: string;
}): Promise<GraphitiEpisodesResult> {
  if (!graphitiEnabled) {
    return { episodes: [], error: 'Graphiti is not enabled' };
  }

  try {
    const groupId = params.projectId || DEFAULT_GROUP_ID;
    const lastN = params.limit ?? 20;

    const res = await fetch(`${graphitiUrl}/episodes/${encodeURIComponent(groupId)}?last_n=${lastN}`, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      return { episodes: [], error: `Episodes failed: ${res.status}` };
    }

    const data = await res.json() as GraphitiEpisodeNode[];

    // Transform Graphiti episodes to our format
    const episodes: GraphitiEpisode[] = (data || []).map((ep) => ({
      id: ep.uuid,
      summary: ep.content || ep.name || '',
      timestamp: ep.created_at,
      nodes: [],
    }));

    return { episodes };
  } catch (error) {
    return { episodes: [], error: String(error) };
  }
}

/**
 * Clear all memory using Graphiti's POST /clear
 */
async function clearMemory(params: {
  projectId: string;
  confirm?: boolean;
}): Promise<{ ok: boolean; cleared?: number; error?: string }> {
  if (!graphitiEnabled) {
    return { ok: false, error: 'Graphiti is not enabled' };
  }

  if (!params.confirm) {
    return { ok: false, error: 'Must confirm=true to clear memory' };
  }

  try {
    // Note: Graphiti's /clear clears ALL data, not per-project
    // For project-specific clearing, use DELETE /group/{group_id}
    const groupId = params.projectId || DEFAULT_GROUP_ID;

    const res = await fetch(`${graphitiUrl}/group/${encodeURIComponent(groupId)}`, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!res.ok) {
      return { ok: false, error: `Clear failed: ${res.status}` };
    }

    return { ok: true };
  } catch (error) {
    return { ok: false, error: String(error) };
  }
}

/**
 * Get entity nodes directly from Neo4j
 * Queries Neo4j for Entity nodes in the specified group
 */
async function getEntities(params: {
  projectId?: string;
  limit?: number;
}): Promise<GraphitiQueryResult> {
  if (!graphitiEnabled) {
    return { nodes: [], edges: [], error: 'Graphiti is not enabled' };
  }

  try {
    const groupId = params.projectId || DEFAULT_GROUP_ID;
    const limit = params.limit ?? 50;

    // Query Neo4j directly for Entity nodes
    const cypher = `
      MATCH (n:Entity)
      WHERE n.group_id = $group_id
      RETURN n.uuid AS id, n.name AS name, n.summary AS summary, n.created_at AS created_at
      ORDER BY n.created_at DESC
      LIMIT $limit
    `;

    const res = await fetch(`${neo4jUrl}/db/neo4j/tx/commit`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Basic ' + Buffer.from(`${neo4jUser}:${neo4jPassword}`).toString('base64'),
      },
      body: JSON.stringify({
        statements: [{
          statement: cypher,
          parameters: { group_id: groupId, limit },
        }],
      }),
    });

    if (!res.ok) {
      return { nodes: [], edges: [], error: `Neo4j query failed: ${res.status}` };
    }

    const data = await res.json() as Neo4jResponse;

    if (data.errors && data.errors.length > 0) {
      return { nodes: [], edges: [], error: data.errors[0].message };
    }

    // Transform Neo4j results to nodes
    const nodes: GraphitiNode[] = [];
    const results = data.results?.[0];
    if (results?.data) {
      for (const row of results.data) {
        const [id, name, summary, created_at] = row.row as string[];
        nodes.push({
          id: id || `entity-${nodes.length}`,
          type: 'entity',
          content: summary || name || 'Unnamed entity',
          createdAt: created_at || new Date().toISOString(),
          metadata: { name },
        });
      }
    }

    return { nodes, edges: [] };
  } catch (error) {
    return { nodes: [], edges: [], error: String(error) };
  }
}

// Neo4j response type
interface Neo4jResponse {
  results?: Array<{
    columns: string[];
    data: Array<{
      row: unknown[];
      meta: unknown[];
    }>;
  }>;
  errors?: Array<{
    code: string;
    message: string;
  }>;
}

/**
 * Launch Graphiti server via docker-compose in SASgraphiti-server
 */
async function launchServer(): Promise<{ success: boolean; error?: string; pid?: number; method?: string }> {
  // Check if docker-compose.yml exists
  const composePath = path.join(GRAPHITI_SERVER_DIR, 'docker-compose.yml');

  if (!fs.existsSync(composePath)) {
    return {
      success: false,
      error: `Graphiti server not found at ${GRAPHITI_SERVER_DIR}. Clone the repo first.`,
    };
  }

  // Check if already running via docker
  try {
    const psResult = execSync('docker-compose ps -q', {
      cwd: GRAPHITI_SERVER_DIR,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (psResult.trim()) {
      console.log('[Graphiti] Containers already running');
      launchedWithDocker = true;
      dockerComposeDir = GRAPHITI_SERVER_DIR;
      return { success: true, method: 'docker-compose (already running)' };
    }
  } catch {
    // Not running, continue to start
  }

  console.log(`[Graphiti] Starting docker-compose in ${GRAPHITI_SERVER_DIR}`);

  return new Promise((resolve) => {
    serverProcess = spawn('docker-compose', ['up', '-d'], {
      cwd: GRAPHITI_SERVER_DIR,
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: process.platform === 'win32',
    });

    let stdout = '';
    let stderr = '';

    serverProcess.stdout?.on('data', (data) => {
      stdout += data.toString();
      console.log(`[Graphiti] ${data.toString().trim()}`);
    });

    serverProcess.stderr?.on('data', (data) => {
      stderr += data.toString();
      console.log(`[Graphiti] ${data.toString().trim()}`);
    });

    serverProcess.on('close', (code) => {
      if (code === 0) {
        launchedWithDocker = true;
        dockerComposeDir = GRAPHITI_SERVER_DIR;
        console.log('[Graphiti] docker-compose started successfully');
        resolve({ success: true, method: 'docker-compose (SASgraphiti-server)' });
      } else {
        console.error(`[Graphiti] docker-compose failed with code ${code}`);
        resolve({
          success: false,
          error: `docker-compose failed (code ${code}). Check if Docker Desktop is running and .env file exists with OPENAI_API_KEY.`,
        });
      }
    });

    serverProcess.on('error', (err) => {
      console.error('[Graphiti] Failed to start docker-compose:', err);
      resolve({
        success: false,
        error: `Failed to run docker-compose: ${err.message}. Is Docker installed?`,
      });
    });

    // Timeout after 30 seconds
    setTimeout(() => {
      if (serverProcess && serverProcess.exitCode === null) {
        // Still running, assume success (docker-compose up -d returns quickly)
        launchedWithDocker = true;
        dockerComposeDir = GRAPHITI_SERVER_DIR;
        resolve({ success: true, method: 'docker-compose (SASgraphiti-server)' });
      }
    }, 30000);
  });
}

/**
 * Stop the Graphiti server (docker-compose down)
 */
async function stopServer(): Promise<{ success: boolean; error?: string }> {
  if (launchedWithDocker && dockerComposeDir) {
    console.log(`[Graphiti] Stopping docker-compose in ${dockerComposeDir}`);

    return new Promise((resolve) => {
      const stopProcess = spawn('docker-compose', ['down'], {
        cwd: dockerComposeDir!,
        stdio: ['ignore', 'pipe', 'pipe'],
        shell: process.platform === 'win32',
      });

      stopProcess.on('close', (code) => {
        if (code === 0) {
          console.log('[Graphiti] docker-compose stopped successfully');
          launchedWithDocker = false;
          dockerComposeDir = null;
          serverProcess = null;
          resolve({ success: true });
        } else {
          console.error(`[Graphiti] docker-compose down failed with code ${code}`);
          resolve({ success: false, error: `docker-compose down failed (code ${code})` });
        }
      });

      stopProcess.on('error', (err) => {
        console.error('[Graphiti] Failed to stop docker-compose:', err);
        resolve({ success: false, error: err.message });
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        resolve({ success: true }); // Assume it worked
      }, 30000);
    });
  }

  // Kill process if not docker
  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }

  return { success: true };
}

/**
 * Cleanup function - call on app quit to stop docker containers
 */
export async function cleanupGraphiti(): Promise<void> {
  if (launchedWithDocker && dockerComposeDir) {
    console.log('[Graphiti] Cleaning up docker containers on app quit...');
    try {
      execSync('docker-compose down', {
        cwd: dockerComposeDir,
        stdio: 'ignore',
      });
      console.log('[Graphiti] Docker containers stopped');
    } catch (err) {
      console.error('[Graphiti] Failed to stop docker containers:', err);
    }
  }

  if (serverProcess && !serverProcess.killed) {
    serverProcess.kill('SIGTERM');
    serverProcess = null;
  }

  launchedWithDocker = false;
  dockerComposeDir = null;
}

/**
 * Check if server process is running
 */
function isServerRunning(): boolean {
  if (launchedWithDocker && dockerComposeDir) {
    try {
      const result = execSync('docker-compose ps -q', {
        cwd: dockerComposeDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      return result.trim().length > 0;
    } catch {
      return false;
    }
  }
  return serverProcess !== null && !serverProcess.killed && serverProcess.exitCode === null;
}

// ============================================================================
// IPC Setup
// ============================================================================

export function setupGraphitiIpc(): void {
  // Configure service
  ipcMain.handle('graphiti:configure', (_, config: { url?: string; enabled?: boolean }) => {
    configureGraphiti(config);
    return { ok: true };
  });

  // Health check
  ipcMain.handle('graphiti:health', () => {
    return checkHealth();
  });

  // Get status
  ipcMain.handle('graphiti:status', () => {
    return { enabled: graphitiEnabled, url: graphitiUrl };
  });

  // Query memory graph
  ipcMain.handle('graphiti:query', (_, params: Parameters<typeof query>[0]) => {
    return query(params);
  });

  // Add memory node
  ipcMain.handle('graphiti:add', (_, params: Parameters<typeof addMemory>[0]) => {
    return addMemory(params);
  });

  // Semantic search
  ipcMain.handle('graphiti:search', (_, params: Parameters<typeof search>[0]) => {
    return search(params);
  });

  // Get episodes
  ipcMain.handle('graphiti:episodes', (_, params: Parameters<typeof getEpisodes>[0]) => {
    return getEpisodes(params);
  });

  // Clear memory
  ipcMain.handle('graphiti:clear', (_, params: Parameters<typeof clearMemory>[0]) => {
    return clearMemory(params);
  });

  // Get entities directly from Neo4j
  ipcMain.handle('graphiti:entities', (_, params: Parameters<typeof getEntities>[0]) => {
    return getEntities(params);
  });

  // Launch Graphiti server
  ipcMain.handle('graphiti:launchServer', () => {
    return launchServer();
  });

  // Stop Graphiti server
  ipcMain.handle('graphiti:stopServer', () => {
    return stopServer();
  });

  // Check if server process is running
  ipcMain.handle('graphiti:isServerRunning', () => {
    return { running: isServerRunning() };
  });
}

// ============================================================================
// Types
// ============================================================================

export interface GraphitiNode {
  id: string;
  type: 'fact' | 'event' | 'entity' | 'preference';
  content: string;
  createdAt: string;
  metadata?: Record<string, unknown>;
}

export interface GraphitiEdge {
  source: string;
  target: string;
  relationship: string;
  weight?: number;
}

export interface GraphitiQueryResult {
  nodes: GraphitiNode[];
  edges: GraphitiEdge[];
  error?: string;
}

export interface GraphitiSearchResult {
  results: Array<{
    node: GraphitiNode;
    score: number;
    snippet?: string;
  }>;
  error?: string;
}

export interface GraphitiEpisode {
  id: string;
  summary: string;
  timestamp: string;
  nodes: string[];
}

export interface GraphitiEpisodesResult {
  episodes: GraphitiEpisode[];
  error?: string;
}

// Graphiti server response types
interface GraphitiFact {
  uuid: string;
  name: string;
  fact: string;
  valid_at: string | null;
  invalid_at: string | null;
  created_at: string;
  expired_at: string | null;
}

interface GraphitiSearchResponse {
  facts: GraphitiFact[];
}

interface GraphitiEpisodeNode {
  uuid: string;
  name?: string;
  content?: string;
  created_at: string;
}
