import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({
      // Bundle these packages into the main process
      exclude: ['say', 'edge-tts']
    })],
    // App icon for the tray
    define: {
      '__TRAY_ICON_ICO__': JSON.stringify(resolve(__dirname, 'resources/icon.ico')),
      '__TRAY_ICON_PNG__': JSON.stringify(resolve(__dirname, 'resources/icon.png'))
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__dirname, 'src/main/index.ts') },
        // TTS libraries need to be external (native modules)
        external: ['say']
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
