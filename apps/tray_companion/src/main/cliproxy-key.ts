/**
 * Authorization header for the local CLIProxyAPIPlus.
 *
 * New installs get a random key in the proxy's config.yaml (`api-keys`). The config is
 * found the way Kuroryuu Desktop finds it (cliproxy-native.ts getDefaultDataDir): the
 * project-local .cliproxyapi/ if it exists, else the per-user Kuroryuu/cliproxyapi dir.
 * Keep in sync with apps/desktop/src/main/services/cliproxy-native.ts readCliproxyApiKey.
 */
import { app } from 'electron';
import * as fs from 'fs';
import * as path from 'path';
import { getProjectRoot } from './utils/paths';

/** Configs written before random per-install keys had no `api-keys`, so the proxy accepted any value. */
const LEGACY_API_KEY = 'kuroryuu-local';
const FIRST_API_KEY = /^api-keys:[ \t]*\r?\n[ \t]+-[ \t]*["']?([^"'\r\n#]+?)["']?[ \t]*(?:#.*)?$/m;

function dataDir(): string {
  const local = path.join(getProjectRoot(), '.cliproxyapi');
  if (fs.existsSync(local)) return local;
  if (process.platform === 'win32') return path.join(app.getPath('appData'), 'Kuroryuu', 'cliproxyapi');
  if (process.platform === 'darwin') {
    return path.join(app.getPath('home'), 'Library', 'Application Support', 'Kuroryuu', 'cliproxyapi');
  }
  return path.join(app.getPath('home'), '.config', 'Kuroryuu', 'cliproxyapi');
}

export function cliproxyAuthHeader(): string {
  const fromEnv = process.env.KURORYUU_CLIPROXY_API_KEY?.trim();
  if (fromEnv) return `Bearer ${fromEnv}`;
  try {
    const match = FIRST_API_KEY.exec(fs.readFileSync(path.join(dataDir(), 'config.yaml'), 'utf-8'));
    if (match) return `Bearer ${match[1].trim()}`;
  } catch {
    // No config yet: fall through to the legacy key
  }
  return `Bearer ${LEGACY_API_KEY}`;
}
