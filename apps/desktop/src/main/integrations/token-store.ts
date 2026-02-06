/**
 * Token Store - Secure storage for OAuth tokens and API keys
 * 
 * Uses electron.safeStorage for encryption + electron-store for persistence.
 * Tokens are encrypted using OS-level encryption:
 * - Windows: DPAPI
 * - macOS: Keychain
 * - Linux: libsecret
 */

import { safeStorage } from 'electron';
import Store from 'electron-store';

/**
 * Supported OAuth/API providers
 */
export type OAuthProvider =
  | 'anthropic'
  | 'openai'
  | 'google'
  | 'azure'
  | 'github'
  | 'gitlab'
  | 'bitbucket'
  | 'elevenlabs';

/**
 * Token data structure
 */
export interface TokenData {
  accessToken: string;
  refreshToken?: string;
  expiresAt?: number;  // Unix timestamp
  tokenType?: string;
  scope?: string;
}

/**
 * API Key data (fallback when OAuth not available)
 */
export interface ApiKeyData {
  key: string;
  createdAt: number;
}

/**
 * Provider connection status
 */
export interface ProviderStatus {
  connected: boolean;
  provider: OAuthProvider;
  authType: 'oauth' | 'apikey' | 'none';
  expiresAt?: number;
  scope?: string;
}

// Store schema for type safety
interface TokenStoreSchema {
  tokens: Record<string, string>;      // provider -> encrypted token JSON
  apiKeys: Record<string, string>;     // provider -> encrypted API key JSON
  oauthAppCreds: Record<string, string>; // provider -> encrypted OAuth App credentials (clientId/secret)
  metadata: Record<string, {           // provider -> metadata (not encrypted)
    authType: 'oauth' | 'apikey';
    connectedAt: number;
    lastUsed?: number;
  }>;
}

const store = new Store<TokenStoreSchema>({
  name: 'kuroryuu-secrets',
  defaults: {
    tokens: {},
    apiKeys: {},
    oauthAppCreds: {},
    metadata: {},
  },
});

/**
 * Check if encryption is available
 */
export function isEncryptionAvailable(): boolean {
  return safeStorage.isEncryptionAvailable();
}

/**
 * Encrypt a string using OS-level encryption
 */
function encrypt(value: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[TokenStore] Encryption not available, storing in plain text');
    return Buffer.from(value).toString('base64');
  }
  return safeStorage.encryptString(value).toString('base64');
}

/**
 * Decrypt a string
 */
function decrypt(encrypted: string): string {
  if (!safeStorage.isEncryptionAvailable()) {
    return Buffer.from(encrypted, 'base64').toString('utf-8');
  }
  return safeStorage.decryptString(Buffer.from(encrypted, 'base64'));
}

// ============================================================================
// OAuth Token Management
// ============================================================================

/**
 * Save OAuth tokens for a provider
 */
export function saveTokens(provider: OAuthProvider, tokens: TokenData): void {
  const encrypted = encrypt(JSON.stringify(tokens));
  
  const allTokens = store.get('tokens', {});
  allTokens[provider] = encrypted;
  store.set('tokens', allTokens);
  
  // Update metadata
  const metadata = store.get('metadata', {});
  metadata[provider] = {
    authType: 'oauth',
    connectedAt: Date.now(),
    lastUsed: Date.now(),
  };
  store.set('metadata', metadata);
  
  console.log(`[TokenStore] Saved OAuth tokens for ${provider}`);
}

/**
 * Get OAuth tokens for a provider
 */
export function getTokens(provider: OAuthProvider): TokenData | null {
  const allTokens = store.get('tokens', {});
  const encrypted = allTokens[provider];
  
  if (!encrypted) {
    return null;
  }
  
  try {
    const decrypted = decrypt(encrypted);
    const tokens = JSON.parse(decrypted) as TokenData;
    
    // Update last used
    const metadata = store.get('metadata', {});
    if (metadata[provider]) {
      metadata[provider].lastUsed = Date.now();
      store.set('metadata', metadata);
    }
    
    return tokens;
  } catch (error) {
    console.error(`[TokenStore] Failed to decrypt tokens for ${provider}:`, error);
    return null;
  }
}

/**
 * Delete OAuth tokens for a provider
 */
export function deleteTokens(provider: OAuthProvider): void {
  const allTokens = store.get('tokens', {});
  delete allTokens[provider];
  store.set('tokens', allTokens);
  
  const metadata = store.get('metadata', {});
  delete metadata[provider];
  store.set('metadata', metadata);
  
  console.log(`[TokenStore] Deleted OAuth tokens for ${provider}`);
}

/**
 * Check if tokens are expired
 */
export function isTokenExpired(provider: OAuthProvider): boolean {
  const tokens = getTokens(provider);
  if (!tokens || !tokens.expiresAt) {
    return true;
  }
  // Consider expired if less than 5 minutes remaining
  return tokens.expiresAt < Date.now() + 5 * 60 * 1000;
}

// ============================================================================
// API Key Management (Fallback)
// ============================================================================

/**
 * Save API key for a provider
 */
export function saveApiKey(provider: OAuthProvider, key: string): void {
  const data: ApiKeyData = {
    key,
    createdAt: Date.now(),
  };
  const encrypted = encrypt(JSON.stringify(data));
  
  const allKeys = store.get('apiKeys', {});
  allKeys[provider] = encrypted;
  store.set('apiKeys', allKeys);
  
  // Update metadata
  const metadata = store.get('metadata', {});
  metadata[provider] = {
    authType: 'apikey',
    connectedAt: Date.now(),
    lastUsed: Date.now(),
  };
  store.set('metadata', metadata);
  
  console.log(`[TokenStore] Saved API key for ${provider}`);
}

/**
 * Get API key for a provider
 */
export function getApiKey(provider: OAuthProvider): string | null {
  const allKeys = store.get('apiKeys', {});
  const encrypted = allKeys[provider];
  
  if (!encrypted) {
    return null;
  }
  
  try {
    const decrypted = decrypt(encrypted);
    const data = JSON.parse(decrypted) as ApiKeyData;
    
    // Update last used
    const metadata = store.get('metadata', {});
    if (metadata[provider]) {
      metadata[provider].lastUsed = Date.now();
      store.set('metadata', metadata);
    }
    
    return data.key;
  } catch (error) {
    console.error(`[TokenStore] Failed to decrypt API key for ${provider}:`, error);
    return null;
  }
}

/**
 * Delete API key for a provider
 */
export function deleteApiKey(provider: OAuthProvider): void {
  const allKeys = store.get('apiKeys', {});
  delete allKeys[provider];
  store.set('apiKeys', allKeys);
  
  const metadata = store.get('metadata', {});
  delete metadata[provider];
  store.set('metadata', metadata);
  
  console.log(`[TokenStore] Deleted API key for ${provider}`);
}

// ============================================================================
// OAuth App Credentials (for GitHub, GitLab, etc.)
// ============================================================================

/**
 * OAuth App credentials (client ID + secret for apps we register)
 */
export interface OAuthAppCredentials {
  clientId: string;
  clientSecret?: string;
  createdAt: number;
}

/**
 * Save OAuth App credentials (Client ID + Secret)
 * These are the app registration credentials, not user tokens
 */
export function saveOAuthAppCredentials(provider: OAuthProvider, creds: { clientId: string; clientSecret?: string }): void {
  const data: OAuthAppCredentials = {
    clientId: creds.clientId,
    clientSecret: creds.clientSecret,
    createdAt: Date.now(),
  };
  const encrypted = encrypt(JSON.stringify(data));
  
  // Store under a separate key from apiKeys/tokens
  const allCreds = store.get('oauthAppCreds', {} as Record<string, string>);
  allCreds[provider] = encrypted;
  store.set('oauthAppCreds', allCreds);
  
  console.log(`[TokenStore] Saved OAuth App credentials for ${provider}`);
}

/**
 * Get OAuth App credentials for a provider
 */
export function getOAuthAppCredentials(provider: OAuthProvider): OAuthAppCredentials | null {
  const allCreds = store.get('oauthAppCreds', {} as Record<string, string>);
  const encrypted = allCreds[provider];
  
  if (!encrypted) {
    return null;
  }
  
  try {
    const decrypted = decrypt(encrypted);
    return JSON.parse(decrypted) as OAuthAppCredentials;
  } catch (error) {
    console.error(`[TokenStore] Failed to decrypt OAuth App credentials for ${provider}:`, error);
    return null;
  }
}

/**
 * Delete OAuth App credentials
 */
export function deleteOAuthAppCredentials(provider: OAuthProvider): void {
  const allCreds = store.get('oauthAppCreds', {} as Record<string, string>);
  delete allCreds[provider];
  store.set('oauthAppCreds', allCreds);
  console.log(`[TokenStore] Deleted OAuth App credentials for ${provider}`);
}

/**
 * Check if OAuth App is configured (has client ID)
 */
export function hasOAuthAppCredentials(provider: OAuthProvider): boolean {
  const creds = getOAuthAppCredentials(provider);
  return creds !== null && !!creds.clientId;
}

// ============================================================================
// Status & Utilities
// ============================================================================

/**
 * Get connection status for a provider
 */
export function getProviderStatus(provider: OAuthProvider): ProviderStatus {
  const metadata = store.get('metadata', {});
  const providerMeta = metadata[provider];
  
  if (!providerMeta) {
    return {
      connected: false,
      provider,
      authType: 'none',
    };
  }
  
  if (providerMeta.authType === 'oauth') {
    const tokens = getTokens(provider);
    return {
      connected: tokens !== null && !isTokenExpired(provider),
      provider,
      authType: 'oauth',
      expiresAt: tokens?.expiresAt,
      scope: tokens?.scope,
    };
  }
  
  if (providerMeta.authType === 'apikey') {
    const key = getApiKey(provider);
    return {
      connected: key !== null,
      provider,
      authType: 'apikey',
    };
  }
  
  return {
    connected: false,
    provider,
    authType: 'none',
  };
}

/**
 * Get status for all providers
 */
export function getAllProviderStatuses(): Record<OAuthProvider, ProviderStatus> {
  const providers: OAuthProvider[] = [
    'anthropic', 'openai', 'google', 'azure',
    'github', 'gitlab', 'bitbucket', 'elevenlabs'
  ];
  
  const statuses: Record<string, ProviderStatus> = {};
  for (const provider of providers) {
    statuses[provider] = getProviderStatus(provider);
  }
  return statuses as Record<OAuthProvider, ProviderStatus>;
}

/**
 * Disconnect a provider (remove all credentials)
 */
export function disconnectProvider(provider: OAuthProvider): void {
  deleteTokens(provider);
  deleteApiKey(provider);
}

/**
 * Clear all stored credentials
 */
export function clearAllCredentials(): void {
  store.set('tokens', {});
  store.set('apiKeys', {});
  store.set('metadata', {});
  console.log('[TokenStore] Cleared all credentials');
}

// Export the store for direct access if needed
export { store as tokenStore };
