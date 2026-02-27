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

  const candidates = [
    // Electron-wide settings (used by electron-vite dev bootstrap context).
    resolve(appData, 'Electron', 'settings.json'),
    // Current desktop app name (matches electron-store path in development).
    resolve(appData, 'kuroryuu-desktop', 'settings.json'),
    // Legacy/alternate app folder.
    resolve(appData, 'Kuroryuu', 'settings.json'),
  ];

  const existing = candidates.find((p) => existsSync(p));
  return existing ?? candidates[0];
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
    plugins: [
      react(),
      {
        name: 'excalidraw-fonts',
        configureServer(server) {
          server.middlewares.use((req, res, next) => {
            if (req.url?.startsWith('/fonts/')) {
              const fontPath = resolve(
                __dirname,
                'node_modules/@excalidraw/excalidraw/dist/prod',
                req.url.slice(1)
              );
              if (existsSync(fontPath)) {
                res.setHeader('Content-Type', 'font/woff2');
                res.setHeader('Access-Control-Allow-Origin', '*');
                res.end(readFileSync(fontPath));
                return;
              }
            }
            next();
          });
        }
      }
    ],
    resolve: {
      alias: { '@': resolve(__dirname, 'src/renderer') }
    }
  }
});
