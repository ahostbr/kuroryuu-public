import { safeStorage } from 'electron';
import Store from 'electron-store';

interface TokenStoreSchema {
  apiKeys: Record<string, string>; // provider -> encrypted/encoded base64 string
}

let store: Store<TokenStoreSchema>;

/**
 * Initialize the token store
 * Call this during app initialization (after app.ready)
 */
export function initializeTokenStore(): void {
  store = new Store<TokenStoreSchema>({
    name: 'kuroryuu-tray-secrets',
    defaults: { apiKeys: {} },
    // Store in Kuroryuu app data directory (same location as settings)
    cwd: 'Kuroryuu/tray_companion',
    // Ensure file has restrictive permissions
    accessPropertiesByDotNotation: false
  });

  console.log('[TokenStore] Token store initialized');

  if (!safeStorage.isEncryptionAvailable()) {
    console.warn('[TokenStore] OS-level encryption not available - falling back to base64 encoding');
    console.warn('[TokenStore] This is NOT secure. Consider enabling encryption on your system.');
  }
}

/**
 * Save an API key for a provider
 * Uses OS-level encryption (DPAPI on Windows, Keychain on macOS, libsecret on Linux)
 * Falls back to base64 encoding if encryption is unavailable (with warning)
 *
 * @param provider - Provider name (e.g., 'openai', 'anthropic', 'google')
 * @param key - API key to store
 */
export function saveApiKey(provider: string, key: string): void {
  if (!store) {
    throw new Error('[TokenStore] Store not initialized. Call initializeTokenStore() first.');
  }

  if (!provider || !key) {
    throw new Error('[TokenStore] Provider and key are required');
  }

  const normalizedProvider = provider.toLowerCase().trim();

  try {
    let encryptedValue: string;

    if (safeStorage.isEncryptionAvailable()) {
      // Use OS-level encryption (secure)
      const buffer = safeStorage.encryptString(key);
      encryptedValue = buffer.toString('base64');
      console.log(`[TokenStore] Saved encrypted API key for provider: ${normalizedProvider}`);
    } else {
      // Fallback to base64 encoding (NOT secure, but better than plaintext)
      console.warn(`[TokenStore] Encryption not available - using base64 fallback for: ${normalizedProvider}`);
      encryptedValue = Buffer.from(key).toString('base64');
    }

    // Store the encrypted/encoded value
    const apiKeys = store.get('apiKeys');
    apiKeys[normalizedProvider] = encryptedValue;
    store.set('apiKeys', apiKeys);

  } catch (error) {
    console.error(`[TokenStore] Failed to save API key for ${normalizedProvider}:`, error);
    throw new Error(`Failed to save API key: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Retrieve an API key for a provider
 * Decrypts the key if encryption was used, otherwise decodes from base64
 *
 * @param provider - Provider name (e.g., 'openai', 'anthropic', 'google')
 * @returns Decrypted API key, or null if not found
 */
export function getApiKey(provider: string): string | null {
  if (!store) {
    throw new Error('[TokenStore] Store not initialized. Call initializeTokenStore() first.');
  }

  if (!provider) {
    throw new Error('[TokenStore] Provider is required');
  }

  const normalizedProvider = provider.toLowerCase().trim();

  try {
    const apiKeys = store.get('apiKeys');
    const encryptedValue = apiKeys[normalizedProvider];

    if (!encryptedValue) {
      return null;
    }

    // Convert base64 back to buffer
    const buffer = Buffer.from(encryptedValue, 'base64');

    if (safeStorage.isEncryptionAvailable()) {
      // Decrypt using OS-level decryption
      const decrypted = safeStorage.decryptString(buffer);
      return decrypted;
    } else {
      // Fallback: decode from base64
      console.warn(`[TokenStore] Encryption not available - using base64 fallback for: ${normalizedProvider}`);
      return buffer.toString('utf8');
    }

  } catch (error) {
    console.error(`[TokenStore] Failed to retrieve API key for ${normalizedProvider}:`, error);
    // Return null on decryption failure rather than throwing
    // This handles cases where keys were encrypted on different systems
    return null;
  }
}

/**
 * Delete an API key for a provider
 *
 * @param provider - Provider name (e.g., 'openai', 'anthropic', 'google')
 */
export function deleteApiKey(provider: string): void {
  if (!store) {
    throw new Error('[TokenStore] Store not initialized. Call initializeTokenStore() first.');
  }

  if (!provider) {
    throw new Error('[TokenStore] Provider is required');
  }

  const normalizedProvider = provider.toLowerCase().trim();

  try {
    const apiKeys = store.get('apiKeys');

    if (apiKeys[normalizedProvider]) {
      delete apiKeys[normalizedProvider];
      store.set('apiKeys', apiKeys);
      console.log(`[TokenStore] Deleted API key for provider: ${normalizedProvider}`);
    } else {
      console.log(`[TokenStore] No API key found for provider: ${normalizedProvider}`);
    }

  } catch (error) {
    console.error(`[TokenStore] Failed to delete API key for ${normalizedProvider}:`, error);
    throw new Error(`Failed to delete API key: ${error instanceof Error ? error.message : String(error)}`);
  }
}

/**
 * Check if an API key exists for a provider
 *
 * @param provider - Provider name (e.g., 'openai', 'anthropic', 'google')
 * @returns true if key exists, false otherwise
 */
export function hasApiKey(provider: string): boolean {
  if (!store) {
    throw new Error('[TokenStore] Store not initialized. Call initializeTokenStore() first.');
  }

  if (!provider) {
    throw new Error('[TokenStore] Provider is required');
  }

  const normalizedProvider = provider.toLowerCase().trim();

  try {
    const apiKeys = store.get('apiKeys');
    return normalizedProvider in apiKeys && apiKeys[normalizedProvider] !== '';
  } catch (error) {
    console.error(`[TokenStore] Failed to check API key existence for ${normalizedProvider}:`, error);
    return false;
  }
}

/**
 * Get list of all providers with stored keys
 *
 * @returns Array of provider names that have stored keys
 */
export function listProviders(): string[] {
  if (!store) {
    throw new Error('[TokenStore] Store not initialized. Call initializeTokenStore() first.');
  }

  try {
    const apiKeys = store.get('apiKeys');
    return Object.keys(apiKeys);
  } catch (error) {
    console.error('[TokenStore] Failed to list providers:', error);
    return [];
  }
}

/**
 * Clear all stored API keys (use with caution)
 * Useful for testing or complete reset
 */
export function clearAllKeys(): void {
  if (!store) {
    throw new Error('[TokenStore] Store not initialized. Call initializeTokenStore() first.');
  }

  try {
    store.set('apiKeys', {});
    console.log('[TokenStore] Cleared all API keys');
  } catch (error) {
    console.error('[TokenStore] Failed to clear all keys:', error);
    throw new Error(`Failed to clear keys: ${error instanceof Error ? error.message : String(error)}`);
  }
}
