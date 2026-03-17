/**
 * Browser HTTP Bridge — Exposes BrowserManager actions over HTTP.
 *
 * Mirrors LiteEditor's agent-bridge.ts:
 * - Local HTTP server on port 7425 (LiteEditor uses 7423)
 * - Bearer token auth (token stored in ~/.kuroryuu/browser-bridge-token)
 * - Stateless request/response — browser state lives in BrowserManager
 * - MCP tools_browser.py proxies to this bridge
 */

import * as http from 'http';
import * as fs from 'fs';
import * as path from 'path';
import { randomBytes } from 'crypto';
import { getBrowserManager } from './browser-manager';

const PORT = 7425;
const TOKEN_DIR = path.join(process.env.HOME || process.env.USERPROFILE || '', '.kuroryuu');
const TOKEN_PATH = path.join(TOKEN_DIR, 'browser-bridge-token');

let _server: http.Server | null = null;
let _token: string = '';

/** Read or generate bearer token */
function ensureToken(): string {
  try {
    if (fs.existsSync(TOKEN_PATH)) {
      return fs.readFileSync(TOKEN_PATH, 'utf-8').trim();
    }
  } catch { /* generate new */ }

  const token = randomBytes(32).toString('hex');
  fs.mkdirSync(TOKEN_DIR, { recursive: true });
  fs.writeFileSync(TOKEN_PATH, token, 'utf-8');
  return token;
}

/** Parse JSON body from request */
function parseBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    req.on('data', (c: Buffer) => chunks.push(c));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString()));
      } catch {
        resolve({});
      }
    });
  });
}

/** Send JSON response */
function respond(res: http.ServerResponse, status: number, data: unknown): void {
  const body = JSON.stringify(data);
  res.writeHead(status, { 'Content-Type': 'application/json' });
  res.end(body);
}

/** Route handler */
async function handleRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }

  // Auth check
  const auth = req.headers['authorization'] || '';
  if (auth !== `Bearer ${_token}`) {
    respond(res, 401, { error: 'Unauthorized' });
    return;
  }

  const url = req.url || '';
  const bm = getBrowserManager();

  try {
    // GET endpoints
    if (req.method === 'GET') {
      if (url === '/browser/list') {
        respond(res, 200, { sessions: bm.listSessions() });
        return;
      }
      if (url === '/browser/health') {
        respond(res, 200, { ok: true, sessions: bm.listSessions().length });
        return;
      }
    }

    // POST endpoints
    if (req.method === 'POST') {
      const body = await parseBody(req);
      const sid = body.session_id as string | undefined;

      switch (url) {
        case '/browser/create-session': {
          const result = bm.createSession();
          respond(res, 200, { success: true, ...result });
          return;
        }
        case '/browser/destroy-session': {
          const ok = bm.destroySession(sid || '');
          respond(res, 200, { success: ok });
          return;
        }
        case '/browser/navigate': {
          const result = await bm.navigate(body.url as string, sid);
          respond(res, 200, result);
          return;
        }
        case '/browser/go-back': {
          const result = await bm.goBack(sid);
          respond(res, 200, result);
          return;
        }
        case '/browser/go-forward': {
          const result = await bm.goForward(sid);
          respond(res, 200, result);
          return;
        }
        case '/browser/reload': {
          const result = await bm.reload(sid);
          respond(res, 200, result);
          return;
        }
        case '/browser/read-page': {
          const result = await bm.readPage(sid);
          respond(res, 200, result);
          return;
        }
        case '/browser/screenshot': {
          const result = await bm.screenshot(sid);
          respond(res, 200, result);
          return;
        }
        case '/browser/click': {
          const result = await bm.click(body.index as number, sid);
          respond(res, 200, result);
          return;
        }
        case '/browser/type': {
          const result = await bm.type(body.text as string, body.index as number | undefined, sid);
          respond(res, 200, result);
          return;
        }
        case '/browser/scroll': {
          const result = await bm.scroll(
            (body.direction as string) || 'down',
            (body.amount as number) || 300,
            sid,
          );
          respond(res, 200, result);
          return;
        }
        case '/browser/select-option': {
          const result = await bm.selectOption(
            body.element_index as number,
            body.option_index as number,
            sid,
          );
          respond(res, 200, result);
          return;
        }
        case '/browser/execute-js': {
          const result = await bm.executeJs(body.code as string, sid);
          respond(res, 200, result);
          return;
        }
        case '/browser/console-logs': {
          const logs = bm.getConsoleLogs(sid, body.since as number | undefined);
          respond(res, 200, { success: true, logs });
          return;
        }
        case '/browser/status': {
          const result = bm.getStatus(sid);
          respond(res, 200, { success: true, ...result });
          return;
        }
        default:
          break;
      }
    }

    respond(res, 404, { error: `Unknown endpoint: ${req.method} ${url}` });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[BrowserBridge] Error on ${url}:`, msg);
    respond(res, 500, { error: msg });
  }
}

/** Start the HTTP bridge server */
export function startBrowserBridge(): void {
  if (_server) return;

  _token = ensureToken();
  _server = http.createServer(handleRequest);
  _server.listen(PORT, '127.0.0.1', () => {
    console.log(`[BrowserBridge] HTTP bridge listening on http://127.0.0.1:${PORT}`);
    console.log(`[BrowserBridge] Token stored at ${TOKEN_PATH}`);
  });
  _server.on('error', (err) => {
    console.error('[BrowserBridge] Server error:', err);
  });
}

/** Stop the bridge and destroy all sessions */
export function stopBrowserBridge(): void {
  getBrowserManager().destroyAll();
  if (_server) {
    _server.close();
    _server = null;
  }
}

/** Get the port for the bridge */
export function getBrowserBridgePort(): number {
  return PORT;
}
