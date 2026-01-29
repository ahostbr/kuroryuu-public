/**
 * OAuth Service - Base class for OAuth 2.0 + PKCE authentication
 * 
 * Implements:
 * - PKCE (Proof Key for Code Exchange) for public clients
 * - Token refresh with automatic retry
 * - Secure callback handling via custom protocol
 */

import { shell, BrowserWindow, protocol } from 'electron';
import crypto from 'crypto';
import { URL } from 'url';
import { 
  saveTokens, 
  getTokens, 
  deleteTokens, 
  isTokenExpired,
  type TokenData,
  type OAuthProvider 
} from './token-store';

/**
 * OAuth provider configuration
 */
export interface OAuthConfig {
  provider: OAuthProvider;
  clientId: string;
  clientSecret?: string;  // Optional for PKCE
  authorizationUrl: string;
  tokenUrl: string;
  revokeUrl?: string;
  scopes: string[];
  redirectUri: string;
  usePkce: boolean;
}

/**
 * OAuth state for PKCE flow
 */
interface PkceState {
  state: string;
  codeVerifier: string;
  createdAt: number;
}

// Active PKCE states (keyed by state parameter)
const activeStates = new Map<string, PkceState>();

// Clean up stale states every 10 minutes
setInterval(() => {
  const now = Date.now();
  for (const [state, data] of activeStates) {
    // States expire after 10 minutes
    if (now - data.createdAt > 10 * 60 * 1000) {
      activeStates.delete(state);
    }
  }
}, 10 * 60 * 1000);

/**
 * Generate a cryptographically secure random string
 */
function generateRandomString(length: number): string {
  return crypto.randomBytes(length).toString('base64url').slice(0, length);
}

/**
 * Generate PKCE code verifier and challenge
 */
function generatePkce(): { codeVerifier: string; codeChallenge: string } {
  const codeVerifier = generateRandomString(64);
  const codeChallenge = crypto
    .createHash('sha256')
    .update(codeVerifier)
    .digest('base64url');
  return { codeVerifier, codeChallenge };
}

/**
 * Base OAuth Service class
 */
export abstract class OAuthService {
  protected config: OAuthConfig;

  constructor(config: OAuthConfig) {
    this.config = config;
  }

  /**
   * Start OAuth flow - opens browser with authorization URL
   */
  async startAuthFlow(): Promise<void> {
    const state = generateRandomString(32);
    
    // Build authorization URL
    const url = new URL(this.config.authorizationUrl);
    url.searchParams.set('client_id', this.config.clientId);
    url.searchParams.set('redirect_uri', this.config.redirectUri);
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', this.config.scopes.join(' '));
    url.searchParams.set('state', state);

    // Add PKCE parameters
    if (this.config.usePkce) {
      const { codeVerifier, codeChallenge } = generatePkce();
      url.searchParams.set('code_challenge', codeChallenge);
      url.searchParams.set('code_challenge_method', 'S256');
      
      // Store state for callback
      activeStates.set(state, {
        state,
        codeVerifier,
        createdAt: Date.now(),
      });
    } else {
      activeStates.set(state, {
        state,
        codeVerifier: '',
        createdAt: Date.now(),
      });
    }

    // Allow subclasses to add extra params
    this.addAuthParams(url);

    // Open in default browser
    await shell.openExternal(url.toString());
  }

  /**
   * Handle OAuth callback from redirect URI
   */
  async handleCallback(callbackUrl: string): Promise<TokenData> {
    const url = new URL(callbackUrl);
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const error = url.searchParams.get('error');
    const errorDescription = url.searchParams.get('error_description');

    if (error) {
      throw new Error(`OAuth error: ${error} - ${errorDescription || 'No description'}`);
    }

    if (!code) {
      throw new Error('No authorization code in callback');
    }

    if (!state) {
      throw new Error('No state parameter in callback');
    }

    // Verify state
    const storedState = activeStates.get(state);
    if (!storedState) {
      throw new Error('Invalid or expired state parameter');
    }
    activeStates.delete(state);

    // Exchange code for tokens
    const tokens = await this.exchangeCode(code, storedState.codeVerifier);
    
    // Save tokens
    saveTokens(this.config.provider, tokens);
    
    return tokens;
  }

  /**
   * Exchange authorization code for tokens
   */
  protected async exchangeCode(code: string, codeVerifier: string): Promise<TokenData> {
    const body = new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: this.config.redirectUri,
      client_id: this.config.clientId,
    });

    if (this.config.clientSecret) {
      body.set('client_secret', this.config.clientSecret);
    }

    if (this.config.usePkce && codeVerifier) {
      body.set('code_verifier', codeVerifier);
    }

    const response = await fetch(this.config.tokenUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
      },
      body: body.toString(),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Token exchange failed: ${response.status} - ${errorText}`);
    }

    const data = await response.json();
    return this.parseTokenResponse(data);
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshTokens(): Promise<TokenData | null> {
    const currentTokens = getTokens(this.config.provider);
    if (!currentTokens?.refreshToken) {
      console.log(`[OAuth:${this.config.provider}] No refresh token available`);
      return null;
    }

    try {
      const body = new URLSearchParams({
        grant_type: 'refresh_token',
        refresh_token: currentTokens.refreshToken,
        client_id: this.config.clientId,
      });

      if (this.config.clientSecret) {
        body.set('client_secret', this.config.clientSecret);
      }

      const response = await fetch(this.config.tokenUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
        },
        body: body.toString(),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OAuth:${this.config.provider}] Token refresh failed:`, errorText);
        return null;
      }

      const data = await response.json();
      const tokens = this.parseTokenResponse(data);
      
      // Preserve refresh token if not returned
      if (!tokens.refreshToken && currentTokens.refreshToken) {
        tokens.refreshToken = currentTokens.refreshToken;
      }

      saveTokens(this.config.provider, tokens);
      return tokens;
    } catch (error) {
      console.error(`[OAuth:${this.config.provider}] Token refresh error:`, error);
      return null;
    }
  }

  /**
   * Get valid access token (refresh if needed)
   */
  async getValidAccessToken(): Promise<string | null> {
    if (isTokenExpired(this.config.provider)) {
      const refreshed = await this.refreshTokens();
      if (!refreshed) {
        return null;
      }
      return refreshed.accessToken;
    }

    const tokens = getTokens(this.config.provider);
    return tokens?.accessToken || null;
  }

  /**
   * Revoke tokens and disconnect
   */
  async disconnect(): Promise<void> {
    const tokens = getTokens(this.config.provider);
    
    // Try to revoke token at provider
    if (tokens?.accessToken && this.config.revokeUrl) {
      try {
        await fetch(this.config.revokeUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: new URLSearchParams({
            token: tokens.accessToken,
            client_id: this.config.clientId,
          }).toString(),
        });
      } catch (error) {
        console.warn(`[OAuth:${this.config.provider}] Token revocation failed:`, error);
      }
    }

    // Delete local tokens
    deleteTokens(this.config.provider);
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    const tokens = getTokens(this.config.provider);
    return tokens !== null;
  }

  /**
   * Parse token response from provider
   * Subclasses can override for provider-specific formats
   */
  protected parseTokenResponse(data: Record<string, unknown>): TokenData {
    return {
      accessToken: data.access_token as string,
      refreshToken: data.refresh_token as string | undefined,
      expiresAt: data.expires_in 
        ? Date.now() + (data.expires_in as number) * 1000 
        : undefined,
      tokenType: data.token_type as string | undefined,
      scope: data.scope as string | undefined,
    };
  }

  /**
   * Add provider-specific auth params
   * Subclasses can override to add extra parameters
   */
  protected addAuthParams(_url: URL): void {
    // Override in subclasses
  }
}

/**
 * Register custom protocol handler for OAuth callbacks
 * Call this once during app initialization
 */
export function registerOAuthProtocol(): void {
  // Register kuroryuu:// protocol for OAuth callbacks
  protocol.registerStringProtocol('kuroryuu', (request, callback) => {
    callback({ data: 'Redirecting...', mimeType: 'text/plain' });
  });
}

/**
 * Handle OAuth callback URL
 * Returns the provider from the callback URL path
 */
export function parseOAuthCallback(url: string): { provider: OAuthProvider; url: string } | null {
  try {
    const parsed = new URL(url);
    // Expected format: kuroryuu://oauth/callback/{provider}?code=...&state=...
    if (parsed.protocol === 'kuroryuu:' && parsed.pathname.startsWith('/oauth/callback/')) {
      const provider = parsed.pathname.split('/')[3] as OAuthProvider;
      return { provider, url };
    }
    return null;
  } catch {
    return null;
  }
}
