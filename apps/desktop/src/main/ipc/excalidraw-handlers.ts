/**
 * Excalidraw IPC Handlers
 * Setup verification for the excalidraw diagramming workspace
 */
import { ipcMain } from 'electron';
import * as fs from 'fs';
import * as path from 'path';

const PROJECT_ROOT = process.env.KURORYUU_ROOT || path.resolve(__dirname, '../../../..');
const OUTPUT_DIR = path.join(PROJECT_ROOT, 'tools', 'excalidraw', 'output');
const SETUP_STATE_FILE = path.join(PROJECT_ROOT, 'ai', 'data', 'excalidraw-setup.json');
const MCP_CORE_URL = 'http://127.0.0.1:8100';

export function registerExcalidrawHandlers(): void {
  // Check if @excalidraw/excalidraw npm package is available
  ipcMain.handle('excalidraw:checkNpmPackage', async () => {
    try {
      require.resolve('@excalidraw/excalidraw');
      return { ok: true };
    } catch {
      return { ok: false, error: '@excalidraw/excalidraw package not found. Run npm install.' };
    }
  });

  // Check if MCP Core server is running
  ipcMain.handle('excalidraw:checkMcpCore', async () => {
    try {
      const res = await fetch(`${MCP_CORE_URL}/health`, { signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        return { ok: true };
      }
      return { ok: false, error: `MCP Core returned status ${res.status}` };
    } catch (err) {
      return { ok: false, error: 'MCP Core not reachable at :8100. Is it running?' };
    }
  });

  // Check if k_excalidraw tool is registered in MCP Core
  ipcMain.handle('excalidraw:checkMcpTool', async () => {
    try {
      const res = await fetch(`${MCP_CORE_URL}/v1/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tool: 'k_excalidraw', args: { action: 'help' } }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        return { ok: false, error: `MCP Core returned status ${res.status}` };
      }
      const data = await res.json();
      // The tool returns help text on success
      if (data.error) {
        return { ok: false, error: data.error };
      }
      return { ok: true };
    } catch (err) {
      return { ok: false, error: 'Failed to call k_excalidraw tool. Is MCP Core running?' };
    }
  });

  // Check if output directory exists and is writable
  ipcMain.handle('excalidraw:checkOutputDir', async () => {
    try {
      // Create directory if it doesn't exist
      if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
      }

      // Test write access with a temp file
      const testFile = path.join(OUTPUT_DIR, '.write-test');
      fs.writeFileSync(testFile, 'ok', 'utf-8');
      fs.unlinkSync(testFile);

      return { ok: true };
    } catch (err) {
      return { ok: false, error: `Output directory not writable: ${String(err)}` };
    }
  });

  // Create a test diagram via k_excalidraw
  ipcMain.handle('excalidraw:testDiagram', async () => {
    try {
      const res = await fetch(`${MCP_CORE_URL}/v1/tools/call`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tool: 'k_excalidraw',
          args: {
            action: 'create',
            name: '_setup_test',
            title: 'Setup Verification',
            nodes: JSON.stringify([
              { id: 'a', label: 'Start', x: 100, y: 100 },
              { id: 'b', label: 'Process', x: 350, y: 100 },
              { id: 'c', label: 'End', x: 600, y: 100 },
            ]),
            edges: JSON.stringify([
              { from: 'a', to: 'b' },
              { from: 'b', to: 'c' },
            ]),
          },
        }),
        signal: AbortSignal.timeout(15000),
      });

      if (!res.ok) {
        return { ok: false, error: `MCP Core returned status ${res.status}` };
      }

      const data = await res.json();
      if (data.error) {
        return { ok: false, error: data.error };
      }

      // Extract path from response
      const filePath = data.result?.path || data.path || `${OUTPUT_DIR}/_setup_test.excalidraw`;
      return { ok: true, path: filePath };
    } catch (err) {
      return { ok: false, error: `Test diagram creation failed: ${String(err)}` };
    }
  });

  // Get setup state
  ipcMain.handle('excalidraw:getSetupState', async () => {
    try {
      if (fs.existsSync(SETUP_STATE_FILE)) {
        const data = fs.readFileSync(SETUP_STATE_FILE, 'utf-8');
        return JSON.parse(data);
      }
      return { complete: false };
    } catch (err) {
      console.error('[Excalidraw] getSetupState error:', err);
      return { complete: false };
    }
  });

  // Save setup state
  ipcMain.handle('excalidraw:saveSetup', async (_event, state: unknown) => {
    try {
      const dir = path.dirname(SETUP_STATE_FILE);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(SETUP_STATE_FILE, JSON.stringify(state, null, 2), 'utf-8');
      return { ok: true };
    } catch (err) {
      console.error('[Excalidraw] saveSetup error:', err);
      return { ok: false, error: String(err) };
    }
  });

  // Reset setup state
  ipcMain.handle('excalidraw:resetSetup', async () => {
    try {
      if (fs.existsSync(SETUP_STATE_FILE)) {
        fs.unlinkSync(SETUP_STATE_FILE);
        console.log('[Excalidraw] Deleted setup state:', SETUP_STATE_FILE);
      }
      return { ok: true };
    } catch (err) {
      console.error('[Excalidraw] resetSetup error:', err);
      return { ok: false, error: String(err) };
    }
  });
}
