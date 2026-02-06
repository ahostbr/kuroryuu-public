import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { existsSync, readFileSync } from 'fs';
import { homedir } from 'os';

function resolveUserSettingsPath(): string {
  if (process.env.KURORYUU_SETTINGS_PATH) {
    return process.env.KURORYUU_SETTINGS_PATH;
  }

  const appData =
    process.env.APPDATA ??
    (process.platform === 'darwin'
      ? resolve(homedir(), 'Library', 'Application Support')
      : resolve(homedir(), '.config'));

  return resolve(appData, 'Kuroryuu', 'settings.json');
}

function readDevModeFlag(): boolean {
  if (process.env.KURORYUU_DEV_MODE === 'true') {
    return true;
  }

  try {
    const settingsPath = resolveUserSettingsPath();
    if (!existsSync(settingsPath)) return false;

    const raw = readFileSync(settingsPath, 'utf8');
    const parsed = JSON.parse(raw) as { ui?: { devMode?: unknown } };
    return parsed?.ui?.devMode === true;
  } catch {
    return false;
  }
}

const devModeEnabled = readDevModeFlag();

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({
      // Bundle these packages into the main process
      exclude: ['chokidar']
    })],
    // App icon for the main process window
    define: {
      '__APP_ICON_ICO__': JSON.stringify(resolve(__dirname, 'resources/Kuroryuu_ico.ico')),
      '__APP_ICON_PNG__': JSON.stringify(resolve(__dirname, 'resources/Kuroryuu_png.png'))
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
        // Only node-pty needs to be external (native module)
        external: ['node-pty']
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/preload/index.ts') }
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    server: {
      hmr: devModeEnabled,
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/renderer/index.html') }
      }
    },
    plugins: [react()],
    resolve: {
      alias: { '@': resolve(__dirname, 'src/renderer') }
    }
  }
});
