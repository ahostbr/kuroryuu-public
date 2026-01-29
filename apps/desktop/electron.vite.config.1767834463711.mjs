// electron.vite.config.ts
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import { resolve } from "path";
var __electron_vite_injected_dirname = "E:\\SAS\\Kuroryuu\\apps\\desktop";
var electron_vite_config_default = defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({
      // Bundle these packages into the main process
      exclude: ["chokidar"]
    })],
    // App icon for the main process window
    define: {
      "__APP_ICON_ICO__": JSON.stringify(resolve(__electron_vite_injected_dirname, "resources/Kuroryuu_ico.ico")),
      "__APP_ICON_PNG__": JSON.stringify(resolve(__electron_vite_injected_dirname, "resources/Kuroryuu_png.png"))
    },
    build: {
      rollupOptions: {
        input: { index: resolve(__electron_vite_injected_dirname, "src/main/index.ts") },
        // Only node-pty needs to be external (native module)
        external: ["node-pty"]
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: { index: resolve(__electron_vite_injected_dirname, "src/preload/index.ts") }
      }
    }
  },
  renderer: {
    root: resolve(__electron_vite_injected_dirname, "src/renderer"),
    build: {
      rollupOptions: {
        input: { index: resolve(__electron_vite_injected_dirname, "src/renderer/index.html") }
      }
    },
    plugins: [react()],
    resolve: {
      alias: { "@": resolve(__electron_vite_injected_dirname, "src/renderer") }
    }
  }
});
export {
  electron_vite_config_default as default
};
