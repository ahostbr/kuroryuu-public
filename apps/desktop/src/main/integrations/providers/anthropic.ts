/**
 * Anthropic OAuth Provider
 * 
 * Note: Anthropic primarily uses API keys, not OAuth.
 * This provider wraps API key management with optional future OAuth support.
 * 
 * Docs: https://docs.anthropic.com/en/docs/build-with-claude/authentication
 */

import { 
  saveApiKey, 
  getApiKey, 
  deleteApiKey, 
  getProviderStatus,
  type ProviderStatus 
} from '../token-store';

export class AnthropicService {
  private static readonly API_BASE = 'https://api.anthropic.com';
  private static readonly API_VERSION = '2023-06-01';

  /**
   * Set API key for Anthropic
   */
  setApiKey(apiKey: string): void {
    saveApiKey('anthropic', apiKey);
  }

  /**
   * Get stored API key
   */
  getApiKey(): string | null {
    return getApiKey('anthropic');
  }

  /**
   * Remove stored API key
   */
  disconnect(): void {
    deleteApiKey('anthropic');
  }

  /**
   * Get connection status
   */
  getStatus(): ProviderStatus {
    return getProviderStatus('anthropic');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return getApiKey('anthropic') !== null;
  }

  /**
   * Verify API key by making a test request
   */
  async verifyApiKey(apiKey?: string): Promise<{ valid: boolean; error?: string }> {
    const key = apiKey || this.getApiKey();
    if (!key) {
      return { valid: false, error: 'No API key provided' };
    }

    try {
      // Use a minimal messages request to verify
      const response = await fetch(`${AnthropicService.API_BASE}/v1/messages`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': key,
          'anthropic-version': AnthropicService.API_VERSION,
        },
        body: JSON.stringify({
          model: 'claude-3-haiku-20240307',
          max_tokens: 1,
          messages: [{ role: 'user', content: 'Hi' }],
        }),
      });

      if (response.ok) {
        return { valid: true };
      }

      const error = await response.json();
      if (response.status === 401) {
        return { valid: false, error: 'Invalid API key' };
      }
      return { valid: false, error: error.error?.message || 'Unknown error' };
    } catch (error) {
      return { valid: false, error: `Network error: ${error}` };
    }
  }

  /**
   * List available models
   */
  async listModels(): Promise<AnthropicModel[]> {
    const key = this.getApiKey();
    if (!key) return [];

    // Anthropic doesn't have a models endpoint, return known models
    return [
      { id: 'claude-opus-4-20250514', name: 'Claude Opus 4', maxTokens: 200000 },
      { id: 'claude-sonnet-4-20250514', name: 'Claude Sonnet 4', maxTokens: 200000 },
      { id: 'claude-3-7-sonnet-20250219', name: 'Claude 3.7 Sonnet', maxTokens: 200000 },
      { id: 'claude-3-5-sonnet-20241022', name: 'Claude 3.5 Sonnet', maxTokens: 200000 },
      { id: 'claude-3-5-haiku-20241022', name: 'Claude 3.5 Haiku', maxTokens: 200000 },
      { id: 'claude-3-opus-20240229', name: 'Claude 3 Opus', maxTokens: 200000 },
      { id: 'claude-3-haiku-20240307', name: 'Claude 3 Haiku', maxTokens: 200000 },
    ];
  }

  /**
   * Get authorization header for API requests
   */
  getAuthHeaders(): Record<string, string> | null {
    const key = this.getApiKey();
    if (!key) return null;

    return {
      'x-api-key': key,
      'anthropic-version': AnthropicService.API_VERSION,
    };
  }
}

export interface AnthropicModel {
  id: string;
  name: string;
  maxTokens: number;
}
