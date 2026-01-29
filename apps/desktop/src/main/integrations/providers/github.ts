/**
 * GitHub OAuth Provider
 * 
 * Scopes: repo, read:user, gist
 * Docs: https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps
 * 
 * Uses localhost loopback server for callbacks (more reliable than custom protocols)
 */

import { shell } from 'electron';
import { URL } from 'url';
import { saveTokens, getTokens, deleteTokens, isTokenExpired, type TokenData } from '../token-store';
import { OAuthLoopbackServer } from '../oauth-loopback';

// Generate random state string
function generateState(): string {
  const array = new Uint8Array(32);
  require('crypto').randomFillSync(array);
  return Array.from(array, b => b.toString(16).padStart(2, '0')).join('');
}

export class GitHubOAuthService {
  private clientId: string;
  private clientSecret?: string;
  private loopbackServer: OAuthLoopbackServer | null = null;

  constructor(clientId: string, clientSecret?: string) {
    this.clientId = clientId;
    this.clientSecret = clientSecret;
  }

  /**
   * Start OAuth flow using localhost loopback server
   */
  async startAuthFlow(): Promise<void> {
    // Start loopback server to receive callback
    this.loopbackServer = new OAuthLoopbackServer();
    const { redirectUri } = await this.loopbackServer.start();
    
    const state = generateState();
    
    // Build authorization URL
    const url = new URL('https://github.com/login/oauth/authorize');
    url.searchParams.set('client_id', this.clientId);
    url.searchParams.set('redirect_uri', redirectUri);
    url.searchParams.set('scope', 'repo read:user gist');
    url.searchParams.set('state', state);
    
    console.log(`[GitHub OAuth] Opening: ${url.toString()}`);
    
    // Open browser
    await shell.openExternal(url.toString());
    
    // Wait for callback
    try {
      const { code, state: returnedState } = await this.loopbackServer.waitForCallback(120000);
      
      if (returnedState !== state) {
        throw new Error('State mismatch - possible CSRF attack');
      }
      
      // Exchange code for token
      await this.exchangeCodeForToken(code, redirectUri);
      console.log('[GitHub OAuth] Successfully authenticated!');
    } finally {
      this.loopbackServer?.close();
      this.loopbackServer = null;
    }
  }

  /**
   * Exchange authorization code for access token
   */
  private async exchangeCodeForToken(code: string, redirectUri: string): Promise<void> {
    const body = new URLSearchParams({
      client_id: this.clientId,
      code,
      redirect_uri: redirectUri,
    });
    
    if (this.clientSecret) {
      body.set('client_secret', this.clientSecret);
    }
    
    const response = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: {
        'Accept': 'application/json',
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: body.toString(),
    });
    
    if (!response.ok) {
      throw new Error(`Token exchange failed: ${response.status}`);
    }
    
    const data = await response.json();
    
    if (data.error) {
      throw new Error(data.error_description || data.error);
    }
    
    // Save tokens
    const tokenData: TokenData = {
      accessToken: data.access_token,
      refreshToken: data.refresh_token,
      tokenType: data.token_type,
      scope: data.scope,
      // GitHub tokens don't expire unless revoked
    };
    
    saveTokens('github', tokenData);
  }

  /**
   * Get valid access token
   */
  async getValidAccessToken(): Promise<string | null> {
    const tokens = getTokens('github');
    if (!tokens) return null;
    return tokens.accessToken;
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return getTokens('github') !== null;
  }

  /**
   * Disconnect (delete tokens)
   */
  disconnect(): void {
    deleteTokens('github');
  }

  /**
   * Handle callback from custom protocol (deprecated - loopback server handles this now)
   * Kept for backwards compatibility
   */
  async handleCallback(_url: string): Promise<void> {
    console.warn('[GitHub OAuth] handleCallback is deprecated - loopback server handles callbacks now');
    // The loopback server approach handles callbacks directly via HTTP
    // This method is a no-op for backwards compatibility
  }

  /**
   * Get authenticated user info
   */
  async getUserInfo(): Promise<GitHubUser | null> {
    const token = await this.getValidAccessToken();
    if (!token) return null;

    try {
      const response = await fetch('https://api.github.com/user', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!response.ok) return null;
      return await response.json();
    } catch {
      return null;
    }
  }

  /**
   * List user's repositories
   */
  async listRepositories(params?: {
    visibility?: 'all' | 'public' | 'private';
    sort?: 'created' | 'updated' | 'pushed' | 'full_name';
    per_page?: number;
  }): Promise<GitHubRepo[]> {
    const token = await this.getValidAccessToken();
    if (!token) return [];

    const url = new URL('https://api.github.com/user/repos');
    if (params?.visibility) url.searchParams.set('visibility', params.visibility);
    if (params?.sort) url.searchParams.set('sort', params.sort);
    if (params?.per_page) url.searchParams.set('per_page', params.per_page.toString());

    try {
      const response = await fetch(url.toString(), {
        headers: {
          'Authorization': `Bearer ${token}`,
          'Accept': 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      });

      if (!response.ok) return [];
      return await response.json();
    } catch {
      return [];
    }
  }
}

// Type definitions
export interface GitHubUser {
  login: string;
  id: number;
  avatar_url: string;
  name: string | null;
  email: string | null;
  bio: string | null;
  public_repos: number;
  followers: number;
  following: number;
}

export interface GitHubRepo {
  id: number;
  name: string;
  full_name: string;
  private: boolean;
  html_url: string;
  description: string | null;
  fork: boolean;
  clone_url: string;
  ssh_url: string;
  default_branch: string;
  updated_at: string;
}
