import { defineConfig, externalizeDepsPlugin } from 'electron-vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

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
      hmr: process.env.KURORYUU_DEV_MODE === 'true'  // Enable HMR when devMode is on
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
