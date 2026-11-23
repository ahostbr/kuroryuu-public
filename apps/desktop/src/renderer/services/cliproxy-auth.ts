/**
 * Authorization header for the local CLIProxyAPIPlus.
 *
 * The key is random per install and lives in the proxy's config.yaml; the main process
 * reads it (cliproxy-native.ts readCliproxyApiKey). Not cached, so a rewritten config is
 * picked up on the next request.
 */
const LEGACY_AUTH = 'Bearer kuroryuu-local';

export async function cliproxyAuthHeader(): Promise<string> {
  try {
    const key = await window.electronAPI?.cliproxy?.native?.apiKey?.();
    return key ? `Bearer ${key}` : LEGACY_AUTH;
  } catch {
    return LEGACY_AUTH;
  }
}
