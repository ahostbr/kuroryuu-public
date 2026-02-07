# Kuroryuu Dependency Review

- Generated: 2026-02-07
- Source: `Reports/RepoIntel/dependency_map.json`
- Repo intel timestamp: `2026-02-06T21:48:00.619004`

## Summary

- NPM manifest files: `5`
- Python requirements files: `5`
- Unique direct NPM dependencies: `89`
- Unique direct Python dependencies: `15`

## setup-project.ps1 Coverage

### Installed by setup-project.ps1

- Python requirements:
  - `apps/mcp_core/requirements.txt`
  - `apps/mcp_stdio/requirements.txt`
  - `apps/gateway/requirements.txt`
- Extra Python packages:
  - `SpeechRecognition`
  - `pyaudio`
  - `edge-tts`
- Node apps (`npm install`):
  - `apps/desktop`
  - `apps/pty_daemon`
  - `apps/web`
  - `apps/tray_companion`
- External binary dependency:
  - FFmpeg from BtbN (`ffmpeg-master-latest-win64-gpl.zip`)

### In repo manifests but not installed by setup-project.ps1

- Python:
  - `apps/kuroryuu_cli/requirements.txt`
  - `apps/mcp_stdio_bridge/requirements.txt`
- Node:
  - `apps/kuroryuu_cli_v2/package.json`

## NPM Dependencies by App

### `apps/desktop/package.json`

- App: `desktop`
- Package: `kuroryuu-desktop`
- Version: `0.1.0`

#### dependencies

- `@codemirror/lang-css`: `^6.3.1`
- `@codemirror/lang-html`: `^6.4.9`
- `@codemirror/lang-javascript`: `^6.2.3`
- `@codemirror/lang-json`: `^6.0.1`
- `@codemirror/lang-markdown`: `^6.5.0`
- `@codemirror/lang-python`: `^6.1.7`
- `@codemirror/lang-rust`: `^6.0.2`
- `@codemirror/lang-sql`: `^6.8.0`
- `@codemirror/lang-yaml`: `^6.1.2`
- `@codemirror/language`: `^6.11.1`
- `@codemirror/legacy-modes`: `^6.5.1`
- `@codemirror/merge`: `^6.11.2`
- `@codemirror/state`: `^6.5.4`
- `@codemirror/theme-one-dark`: `^6.1.3`
- `@codemirror/view`: `^6.39.11`
- `@dnd-kit/core`: `^6.3.1`
- `@dnd-kit/sortable`: `^10.0.0`
- `@dnd-kit/utilities`: `^3.2.2`
- `@radix-ui/react-alert-dialog`: `^1.1.15`
- `@radix-ui/react-dialog`: `^1.1.15`
- `@radix-ui/react-dropdown-menu`: `^2.1.16`
- `@radix-ui/react-slot`: `^1.2.4`
- `@radix-ui/react-tabs`: `^1.1.13`
- `@types/dagre`: `^0.7.53`
- `@xterm/addon-fit`: `^0.10.0`
- `@xterm/xterm`: `^5.5.0`
- `@xyflow/react`: `^12.10.0`
- `chokidar`: `^5.0.0`
- `class-variance-authority`: `^0.7.1`
- `clsx`: `^2.1.1`
- `codemirror`: `^6.0.2`
- `dagre`: `^0.8.5`
- `echarts`: `^6.0.0`
- `echarts-for-react`: `^3.0.6`
- `electron-log`: `^5.3.0`
- `electron-store`: `^8.2.0`
- `electron-updater`: `^6.7.3`
- `framer-motion`: `^12.27.0`
- `lucide-react`: `^0.562.0`
- `react`: `^19.1.0`
- `react-dom`: `^19.1.0`
- `react-markdown`: `^10.1.0`
- `react-resizable-panels`: `^4.4.1`
- `react-rnd`: `^10.5.2`
- `react-window`: `^1.8.11`
- `remark-gfm`: `^4.0.1`
- `tailwind-merge`: `^3.4.0`
- `uuid`: `^13.0.0`
- `zustand`: `^5.0.9`

#### devDependencies

- `@electron-toolkit/preload`: `^3.0.2`
- `@electron-toolkit/utils`: `^4.0.0`
- `@playwright/test`: `^1.58.0`
- `@tailwindcss/postcss`: `^4.1.17`
- `@types/node`: `^22.15.21`
- `@types/react`: `^19.1.6`
- `@types/react-dom`: `^19.1.5`
- `@types/react-window`: `^1.8.8`
- `@types/uuid`: `^10.0.0`
- `@vitejs/plugin-react`: `^4.4.1`
- `@vitest/coverage-v8`: `^4.0.16`
- `autoprefixer`: `^10.4.21`
- `electron`: `^36.3.1`
- `electron-builder`: `^26.4.0`
- `electron-vite`: `^3.1.0`
- `fast-check`: `^4.5.3`
- `node-pty`: `^1.0.0`
- `playwright-core`: `^1.58.0`
- `postcss`: `^8.5.3`
- `rcedit`: `^4.0.1`
- `tailwindcss`: `^4.1.7`
- `typescript`: `^5.8.3`
- `vitest`: `^4.0.16`

### `apps/kuroryuu_cli_v2/package.json`

- App: `kuroryuu_cli_v2`
- Package: `@kuroryuu/cli`
- Version: `2.0.0-alpha.1`

#### dependencies

- `chalk`: `^5.3.0`
- `cli-boxes`: `^4.0.0`
- `figures`: `^6.0.0`
- `ink`: `^6.0.0`
- `ink-select-input`: `^6.0.0`
- `ink-spinner`: `^5.0.0`
- `ink-text-input`: `^6.0.0`
- `react`: `^19.0.0`
- `yaml`: `^2.3.4`
- `yargs`: `^17.7.0`

#### devDependencies

- `@types/node`: `^22.0.0`
- `@types/react`: `^19.0.0`
- `@types/yargs`: `^17.0.0`
- `ink-testing-library`: `^4.0.0`
- `rimraf`: `^6.0.0`
- `typescript`: `^5.9.0`
- `vitest`: `^4.0.0`

### `apps/pty_daemon/package.json`

- App: `pty_daemon`
- Package: `@kuroryuu/pty-daemon`
- Version: `1.0.0`

#### dependencies

- `node-pty`: `^1.0.0`

#### devDependencies

- `@types/node`: `^20.10.0`
- `ts-node`: `^10.9.2`
- `typescript`: `^5.3.0`

### `apps/tray_companion/package.json`

- App: `tray_companion`
- Package: `kuroryuu-tray-companion`
- Version: `0.1.0`

#### dependencies

- `class-variance-authority`: `^0.7.1`
- `clsx`: `^2.1.1`
- `electron-store`: `^8.2.0`
- `elevenlabs`: `^1.0.0`
- `lucide-react`: `^0.562.0`
- `react`: `^19.1.0`
- `react-dom`: `^19.1.0`
- `say`: `^0.16.0`
- `tailwind-merge`: `^3.4.0`

#### devDependencies

- `@electron-toolkit/preload`: `^3.0.2`
- `@electron-toolkit/utils`: `^4.0.0`
- `@tailwindcss/postcss`: `^4.1.17`
- `@types/node`: `^22.15.21`
- `@types/react`: `^19.1.6`
- `@types/react-dom`: `^19.1.5`
- `@vitejs/plugin-react`: `^4.4.1`
- `autoprefixer`: `^10.4.21`
- `electron`: `^36.3.1`
- `electron-vite`: `^3.1.0`
- `postcss`: `^8.5.3`
- `tailwindcss`: `^4.1.7`
- `typescript`: `^5.8.3`

### `apps/web/package.json`

- App: `web`
- Package: `kuroryuu-web`
- Version: `0.1.0`

#### dependencies

- `class-variance-authority`: `^0.7.1`
- `clsx`: `^2.1.1`
- `framer-motion`: `^12.24.10`
- `lucide-react`: `^0.562.0`
- `react`: `^19.1.0`
- `react-dom`: `^19.1.0`
- `react-dropzone`: `^14.3.8`
- `react-markdown`: `^9.0.1`
- `remark-gfm`: `^4.0.0`
- `tailwind-merge`: `^3.4.0`

#### devDependencies

- `@tailwindcss/postcss`: `^4.1.18`
- `@types/react`: `^19.1.6`
- `@types/react-dom`: `^19.1.5`
- `@vitejs/plugin-react`: `^4.4.1`
- `autoprefixer`: `^10.4.21`
- `postcss`: `^8.5.4`
- `tailwindcss`: `^4.1.17`
- `typescript`: `^5.8.3`
- `vite`: `^6.3.5`

## Python Dependencies by App

### `apps/gateway/requirements.txt`

- App: `gateway`
- `aiohttp`: `3.9.0` (commented in file for threat intel lookups)
- `anthropic`: `0.40.0` (Claude SDK)
- `fastapi`: `0.109.0`
- `httpx`: `0.26.0`
- `pydantic`: `2.0.0`
- `python-dotenv`: `1.0.0`
- `sse-starlette`: `1.8.0`
- `uvicorn[standard]`: `0.27.0`

### `apps/kuroryuu_cli/requirements.txt`

- App: `kuroryuu_cli`
- `aiohttp`: `3.9.0`
- `anthropic`: `0.75.0`
- `colorama`: `0.4.6`
- `httpx`: `0.26.0`
- `prompt_toolkit`: `3.0.43`
- `rich`: `13.7.0`

### `apps/mcp_core/requirements.txt`

- App: `mcp_core`
- `fastapi`: `0.109`
- `httpx`: `0.26`
- `numpy`: `1.24.0`
- `pydantic`: `2.0.0`
- `requests`: `2.31`
- `sentence-transformers`: `3.0.0`
- `uvicorn[standard]`: `0.27`

### `apps/mcp_stdio/requirements.txt`

- App: `mcp_stdio`
- `mcp`: `1.0.0`

### `apps/mcp_stdio_bridge/requirements.txt`

- App: `mcp_stdio_bridge`
- `httpx`: `0.24.0`

## Most Reused Dependencies

### NPM (top reused)

- `typescript`: used by 5 apps
- `react`: used by 4 apps
- `@types/node`: used by 4 apps
- `@types/react`: used by 4 apps
- `class-variance-authority`: used by 3 apps
- `clsx`: used by 3 apps
- `lucide-react`: used by 3 apps
- `react-dom`: used by 3 apps
- `tailwind-merge`: used by 3 apps
- `@tailwindcss/postcss`: used by 3 apps

### Python (reused)

- `httpx`: used by 4 apps
- `aiohttp`: used by 2 apps
- `anthropic`: used by 2 apps
- `fastapi`: used by 2 apps
- `pydantic`: used by 2 apps
- `uvicorn[standard]`: used by 2 apps
