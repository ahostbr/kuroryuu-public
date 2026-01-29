/**
 * MCP_CORE Client
 * 
 * Client wrapper for Kuroryuu's MCP_CORE service (port 8100)
 * Provides access to inbox, checkpoint, and rag tools
 */

interface McpResult<T = unknown> {
  ok: boolean;
  data?: T;
  error?: string;
}

interface InboxMessage {
  id: string;
  from: string;
  to: string;
  subject: string;
  body: string;
  timestamp: number;
  status: 'new' | 'claimed' | 'done';
  claimedBy?: string;
}

interface Checkpoint {
  id: string;
  sessionId: string;
  summary: string;
  timestamp: number;
  context?: Record<string, unknown>;
}

interface RagResult {
  score: number;
  content: string;
  source: string;
  metadata?: Record<string, unknown>;
}

/**
 * Check if MCP_CORE is healthy
 */
export async function checkMcpHealth(): Promise<boolean> {
  try {
    const result = await window.electronAPI.mcp.health();
    return result.ok;
  } catch {
    return false;
  }
}

/**
 * List available MCP tools
 */
export async function listMcpTools(): Promise<string[]> {
  try {
    const result = await window.electronAPI.mcp.tools();
    if (result.tools && Array.isArray(result.tools)) {
      return (result.tools as Array<{ name?: string }>).map((t) => t.name || 'unknown');
    }
    return [];
  } catch {
    return [];
  }
}

// ============ INBOX TOOLS ============

/**
 * Send a message to the inbox
 */
export async function inboxSend(
  to: string,
  subject: string,
  body: string
): Promise<McpResult<{ messageId: string }>> {
  try {
    const result = await window.electronAPI.mcp.inbox.send(to, subject, body);
    if (result.error) {
      return { ok: false, error: result.error };
    }
    return { ok: true, data: result.result as { messageId: string } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * List messages in inbox
 */
export async function inboxList(
  box: 'new' | 'claimed' | 'done' = 'new',
  limit = 20
): Promise<McpResult<InboxMessage[]>> {
  try {
    const result = await window.electronAPI.mcp.inbox.list(box, limit);
    if (result.error) {
      return { ok: false, error: result.error };
    }
    return { ok: true, data: result.result as InboxMessage[] };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Claim a message for processing
 */
export async function inboxClaim(
  messageId: string,
  agent: string
): Promise<McpResult<void>> {
  try {
    const result = await window.electronAPI.mcp.inbox.claim(messageId, agent);
    if (result.error) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Mark a message as complete
 */
export async function inboxComplete(
  messageId: string,
  status: 'done' | 'failed' = 'done',
  note = ''
): Promise<McpResult<void>> {
  try {
    const result = await window.electronAPI.mcp.inbox.complete(messageId, status, note);
    if (result.error) {
      return { ok: false, error: result.error };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ============ CHECKPOINT TOOLS ============

/**
 * Save a checkpoint
 * @param name - Checkpoint name (namespace)
 * @param summary - Human-readable summary description
 * @param data - Optional data to persist in the checkpoint
 */
export async function checkpointSave(
  name: string,
  summary: string,
  data?: Record<string, unknown>
): Promise<McpResult<{ checkpointId: string }>> {
  try {
    // Preload signature: save(name, data, summary?, tags?)
    const result = await window.electronAPI.mcp.checkpoint.save(name, data || {}, summary);
    if (result.error) {
      return { ok: false, error: result.error };
    }
    return { ok: true, data: result.result as { checkpointId: string } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * List checkpoints
 */
export async function checkpointList(limit = 10): Promise<McpResult<Checkpoint[]>> {
  try {
    const result = await window.electronAPI.mcp.checkpoint.list(limit);
    if (result.error) {
      return { ok: false, error: result.error };
    }
    return { ok: true, data: result.result as Checkpoint[] };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Load a checkpoint
 */
export async function checkpointLoad(checkpointId: string): Promise<McpResult<Checkpoint>> {
  try {
    const result = await window.electronAPI.mcp.checkpoint.load(checkpointId);
    if (result.error) {
      return { ok: false, error: result.error };
    }
    return { ok: true, data: result.result as Checkpoint };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// ============ RAG TOOLS ============

/**
 * Query the RAG index
 */
export async function ragQuery(query: string, topK = 10): Promise<McpResult<RagResult[]>> {
  try {
    const result = await window.electronAPI.mcp.rag.query(query, topK);
    if (result.error) {
      return { ok: false, error: result.error };
    }
    return { ok: true, data: result.result as RagResult[] };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Index a path into RAG
 */
export async function ragIndex(path: string): Promise<McpResult<{ indexed: number }>> {
  try {
    const result = await window.electronAPI.mcp.rag.index(path);
    if (result.error) {
      return { ok: false, error: result.error };
    }
    return { ok: true, data: result.result as { indexed: number } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

/**
 * Get RAG status
 */
export async function ragStatus(): Promise<McpResult<{ indexed: number; ready: boolean }>> {
  try {
    const result = await window.electronAPI.mcp.rag.status();
    if (result.error) {
      return { ok: false, error: result.error };
    }
    return { ok: true, data: result.result as { indexed: number; ready: boolean } };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

// Export all as namespace
export const mcpClient = {
  health: checkMcpHealth,
  tools: listMcpTools,
  inbox: {
    send: inboxSend,
    list: inboxList,
    claim: inboxClaim,
    complete: inboxComplete,
  },
  checkpoint: {
    save: checkpointSave,
    list: checkpointList,
    load: checkpointLoad,
  },
  rag: {
    query: ragQuery,
    index: ragIndex,
    status: ragStatus,
  },
};
