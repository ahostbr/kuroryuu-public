/**
 * OpenAI Service
 * 
 * Note: OpenAI primarily uses API keys, not OAuth.
 * This provider wraps API key management.
 * 
 * Docs: https://platform.openai.com/docs/api-reference/authentication
 */

import { 
  saveApiKey, 
  getApiKey, 
  deleteApiKey, 
  getProviderStatus,
  type ProviderStatus 
} from '../token-store';

export class OpenAIService {
  private static readonly API_BASE = 'https://api.openai.com';

  /**
   * Set API key for OpenAI
   */
  setApiKey(apiKey: string): void {
    saveApiKey('openai', apiKey);
  }

  /**
   * Get stored API key
   */
  getApiKey(): string | null {
    return getApiKey('openai');
  }

  /**
   * Remove stored API key
   */
  disconnect(): void {
    deleteApiKey('openai');
  }

  /**
   * Get connection status
   */
  getStatus(): ProviderStatus {
    return getProviderStatus('openai');
  }

  /**
   * Check if connected
   */
  isConnected(): boolean {
    return getApiKey('openai') !== null;
  }

  /**
   * Verify API key by listing models
   */
  async verifyApiKey(apiKey?: string): Promise<{ valid: boolean; error?: string }> {
    const key = apiKey || this.getApiKey();
    if (!key) {
      return { valid: false, error: 'No API key provided' };
    }

    try {
      const response = await fetch(`${OpenAIService.API_BASE}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${key}`,
        },
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
  async listModels(): Promise<OpenAIModel[]> {
    const key = this.getApiKey();
    if (!key) return [];

    try {
      const response = await fetch(`${OpenAIService.API_BASE}/v1/models`, {
        headers: {
          'Authorization': `Bearer ${key}`,
        },
      });

      if (!response.ok) return [];

      const data = await response.json();
      return data.data
        .filter((m: { id: string }) => 
          m.id.startsWith('gpt-') || m.id.startsWith('o1') || m.id.startsWith('o3')
        )
        .map((m: { id: string; created: number }) => ({
          id: m.id,
          name: formatModelName(m.id),
          created: m.created,
        }))
        .sort((a: OpenAIModel, b: OpenAIModel) => b.created - a.created);
    } catch {
      return [];
    }
  }

  /**
   * Get authorization header for API requests
   */
  getAuthHeaders(): Record<string, string> | null {
    const key = this.getApiKey();
    if (!key) return null;

    return {
      'Authorization': `Bearer ${key}`,
    };
  }
}

/**
 * Format model ID to readable name
 */
function formatModelName(id: string): string {
  // gpt-4o-2024-08-06 -> GPT-4o (Aug 2024)
  const parts = id.split('-');
  let name = parts[0].toUpperCase();
  
  if (parts[1]) {
    name += `-${parts[1]}`;
  }

  // Extract date if present
  const dateMatch = id.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (dateMatch) {
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                    'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const month = months[parseInt(dateMatch[2]) - 1];
    name += ` (${month} ${dateMatch[1]})`;
  }

  return name;
}

export interface OpenAIModel {
  id: string;
  name: string;
  created: number;
}
