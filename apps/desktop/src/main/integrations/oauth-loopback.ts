/**
 * OAuth Loopback Server
 * 
 * Starts a temporary localhost HTTP server to receive OAuth callbacks.
 * This is more reliable than custom protocols, especially in dev mode.
 * 
 * Usage:
 *   const server = new OAuthLoopbackServer();
 *   const { port, authUrl } = await server.start(baseAuthUrl, state);
 *   // User completes auth in browser...
 *   const { code, state } = await server.waitForCallback(30000);
 *   server.close();
 */

import { createServer, Server, IncomingMessage, ServerResponse } from 'http';
import { URL } from 'url';

export interface LoopbackResult {
  code: string;
  state: string;
}

// Fixed port for OAuth callbacks - must match GitHub OAuth App settings
const OAUTH_LOOPBACK_PORT = 17123;

export class OAuthLoopbackServer {
  private server: Server | null = null;
  private port: number = OAUTH_LOOPBACK_PORT;
  private resolveCallback: ((result: LoopbackResult) => void) | null = null;
  private rejectCallback: ((error: Error) => void) | null = null;

  /**
   * Start the loopback server on fixed port 17123
   */
  async start(): Promise<{ port: number; redirectUri: string }> {
    return new Promise((resolve, reject) => {
      this.server = createServer(this.handleRequest.bind(this));
      
      // Listen on fixed port for OAuth callback
      this.server.listen(OAUTH_LOOPBACK_PORT, '127.0.0.1', () => {
        const address = this.server?.address();
        if (address && typeof address === 'object') {
          this.port = address.port;
          const redirectUri = `http://127.0.0.1:${this.port}/callback`;
          console.log(`[OAuth Loopback] Started on ${redirectUri}`);
          resolve({ port: this.port, redirectUri });
        } else {
          reject(new Error('Failed to get server address'));
        }
      });
      
      this.server.on('error', reject);
    });
  }

  /**
   * Wait for the OAuth callback
   */
  waitForCallback(timeoutMs: number = 120000): Promise<LoopbackResult> {
    return new Promise((resolve, reject) => {
      this.resolveCallback = resolve;
      this.rejectCallback = reject;
      
      // Set timeout
      setTimeout(() => {
        if (this.rejectCallback) {
          this.rejectCallback(new Error('OAuth callback timeout'));
          this.close();
        }
      }, timeoutMs);
    });
  }

  /**
   * Handle incoming HTTP request
   */
  private handleRequest(req: IncomingMessage, res: ServerResponse): void {
    const url = new URL(req.url || '/', `http://127.0.0.1:${this.port}`);
    
    if (url.pathname === '/callback') {
      const code = url.searchParams.get('code');
      const state = url.searchParams.get('state');
      const error = url.searchParams.get('error');
      const errorDescription = url.searchParams.get('error_description');
      
      if (error) {
        // OAuth error
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Authorization Failed</title></head>
          <body style="font-family: system-ui; text-align: center; padding: 50px; background: #0B0B0F; color: #fff;">
            <h1 style="color: #ef4444;">❌ Authorization Failed</h1>
            <p>${errorDescription || error}</p>
            <p style="color: #666;">You can close this window.</p>
          </body>
          </html>
        `);
        
        if (this.rejectCallback) {
          this.rejectCallback(new Error(errorDescription || error));
        }
      } else if (code && state) {
        // Success!
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Authorization Successful</title></head>
          <body style="font-family: system-ui; text-align: center; padding: 50px; background: #0B0B0F; color: #fff;">
            <h1 style="color: #D6D876;">✓ Authorization Successful</h1>
            <p>You can close this window and return to Kuroryuu.</p>
            <script>setTimeout(() => window.close(), 2000);</script>
          </body>
          </html>
        `);
        
        if (this.resolveCallback) {
          this.resolveCallback({ code, state });
        }
      } else {
        // Missing parameters
        res.writeHead(400, { 'Content-Type': 'text/html' });
        res.end(`
          <!DOCTYPE html>
          <html>
          <head><title>Error</title></head>
          <body style="font-family: system-ui; text-align: center; padding: 50px; background: #0B0B0F; color: #fff;">
            <h1 style="color: #ef4444;">❌ Missing Parameters</h1>
            <p>The authorization response is missing required parameters.</p>
          </body>
          </html>
        `);
      }
      
      // Close server after handling
      setTimeout(() => this.close(), 1000);
    } else {
      // Unknown path
      res.writeHead(404);
      res.end('Not Found');
    }
  }

  /**
   * Close the server
   */
  close(): void {
    if (this.server) {
      this.server.close();
      this.server = null;
      console.log('[OAuth Loopback] Server closed');
    }
  }
}
