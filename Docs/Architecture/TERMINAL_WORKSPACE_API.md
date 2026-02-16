# Terminal Workspace API

> **Location:** `apps/desktop/src/renderer/components/shared/terminal-workspace/`

## Overview

`TerminalWorkspace` is a reusable layout component for any Kuroryuu panel that combines a tool sidebar, terminal, and collapsible tool pages. It provides the "golden layout" pattern used across Marketing, PRD, and any future terminal-based panels.

## Features

- VS Code-style icon nav sidebar (left)
- Terminal on the left, tool pages on the right (split/grid modes)
- Collapsible tool panel (click active nav icon to toggle)
- Draggable resize handle between terminal and tool page
- Window mode with two floating, draggable/resizable windows
- Optional skills dropdown in the header
- Layout mode toggle (grid / splitter / window) with optional persistence
- Fully self-contained state (no external store required)

## Quick Start

```tsx
import { TerminalWorkspace } from '../shared/terminal-workspace';
import type { WorkspaceTool, WorkspaceSkill } from '../shared/terminal-workspace';

const MY_TOOLS: WorkspaceTool[] = [
  { id: 'editor', icon: Code, label: 'Editor', page: <EditorPage /> },
  { id: 'preview', icon: Eye, label: 'Preview', page: <PreviewPage /> },
  { id: 'files', icon: FolderOpen, label: 'Files', page: <FilesPage />, bottom: true },
];

const MY_SKILLS: WorkspaceSkill[] = [
  { id: 'lint', label: 'Lint Code', icon: CheckCircle, file: 'lint.md' },
];

function MyPanel() {
  return (
    <TerminalWorkspace
      title="My Panel"
      tools={MY_TOOLS}
      skills={MY_SKILLS}
      skillPathPrefix="ai/skills/my-panel/"
      terminal={<MyTerminal />}
      terminalPtyId={ptyId}
      terminalTitle="My Terminal"
      layoutSettingsKey="ui.myPanelLayout"
      onSettings={() => openSettings()}
    />
  );
}
```

## API Reference

### `<TerminalWorkspace>` Props

| Prop | Type | Required | Default | Description |
|------|------|----------|---------|-------------|
| `title` | `string` | Yes | — | Panel title shown in the header |
| `tools` | `WorkspaceTool[]` | Yes | — | Tool definitions with icons and pages |
| `skills` | `WorkspaceSkill[]` | No | — | Skills for the header dropdown |
| `skillPathPrefix` | `string` | No | `''` | Path prefix prepended to skill file paths |
| `terminal` | `ReactNode` | Yes | — | The terminal component to render |
| `terminalPtyId` | `string \| null` | No | — | PTY ID for skills dropdown (disabled without it) |
| `terminalTitle` | `string` | No | `'Terminal'` | Label shown on terminal header/window |
| `layoutSettingsKey` | `string` | No | — | Electron settings key for layout persistence |
| `headerExtra` | `ReactNode` | No | — | Extra elements in header right section |
| `onSettings` | `() => void` | No | — | Settings button callback (hidden if omitted) |
| `defaultTool` | `string` | No | First tool | Initial active tool ID |
| `defaultLayout` | `LayoutMode` | No | `'window'` | Initial layout mode |
| `defaultSplitRatio` | `number` | No | `50` | Initial split ratio (20-80) |

### `WorkspaceTool`

```ts
interface WorkspaceTool {
  id: string;           // Unique tool identifier
  icon: LucideIcon;     // Lucide icon component
  label: string;        // Display name (shown in tooltip + window title)
  page: ReactNode;      // The page component rendered when active
  bottom?: boolean;     // If true, placed at bottom of nav (e.g. gallery)
}
```

### `WorkspaceSkill`

```ts
interface WorkspaceSkill {
  id: string;           // Unique skill identifier
  label: string;        // Display name in dropdown
  icon: LucideIcon;     // Lucide icon component
  file: string;         // File name (prepended with skillPathPrefix)
}
```

### `LayoutMode`

```ts
type LayoutMode = 'grid' | 'splitter' | 'window';
```

All three modes are cycled via the header toggle button:
- **grid / splitter**: Terminal on left, tool page on right with resize handle
- **window**: Both terminal and tool page as independent floating windows

## Layout Behavior

### Split Mode (grid / splitter)

```
[ToolNav] [  Terminal (left)  ] [|] [  Tool Page (right)  ]
  48px     (100 - splitRatio)%  2px      splitRatio%
```

When the tool panel is collapsed (click active nav icon):
```
[ToolNav] [          Terminal (full width)                ]
  48px                      100%
```

### Window Mode

```
[ToolNav] [                                              ]
          [  +--Terminal Window--+  +--Tool Page Window--+]
          [  | drag to move     |  | Research            |]
          [  |                  |  |                     |]
          [  +------------------+  +--------------------+]
```

Both windows are independently:
- Draggable (via title bar)
- Resizable (via edge/corner handles)
- The tool page window is hidden when panel is collapsed

### Nav Toggle Behavior

| Action | Result |
|--------|--------|
| Click tool icon (panel open, different tool) | Switch to that tool's page |
| Click tool icon (panel open, same tool) | Collapse tool panel |
| Click tool icon (panel collapsed) | Expand panel with that tool |
| Click collapse button (bottom of nav) | Hide entire nav sidebar |
| Click expand button (header, when nav hidden) | Show nav sidebar |

## File Structure

```
shared/terminal-workspace/
  types.ts              — Type definitions (WorkspaceTool, WorkspaceSkill, etc.)
  TerminalWorkspace.tsx  — Main orchestrator (state + composition)
  WorkspaceHeader.tsx    — Title bar with skills, layout toggle, settings
  WorkspaceNav.tsx       — VS Code-style icon strip sidebar
  WorkspaceContent.tsx   — Split/window layout with resize + drag logic
  SkillsDropdown.tsx     — Generic skills dropdown (sends path to PTY)
  index.ts              — Barrel exports
```

## Sub-Components

All sub-components are props-based with zero store dependencies. They receive a `WorkspaceState` object for layout coordination:

```ts
interface WorkspaceState {
  activeTool: string;
  setActiveTool: (id: string) => void;
  showToolNav: boolean;
  setShowToolNav: (v: boolean) => void;
  showToolPanel: boolean;
  setShowToolPanel: (v: boolean) => void;
  layoutMode: LayoutMode;
  setLayoutMode: (mode: LayoutMode) => void;
  splitRatio: number;
  setSplitRatio: (ratio: number) => void;
}
```

This means sub-components can be used standalone if you need custom composition (e.g. a workspace without the header, or with a custom nav).

## Example: Marketing Panel (Reference Implementation)

```tsx
// MarketingWorkspace.tsx — 60 lines total
import { TerminalWorkspace } from '../shared/terminal-workspace';
import type { WorkspaceTool, WorkspaceSkill } from '../shared/terminal-workspace';

const TOOLS: WorkspaceTool[] = [
  { id: 'research', icon: Search, label: 'Research', page: <ResearchPage /> },
  { id: 'scraper', icon: Globe, label: 'Web Scraper', page: <ScraperPage /> },
  { id: 'image-gen', icon: ImageIcon, label: 'Image Gen', page: <ImageGenPage /> },
  { id: 'voiceover', icon: Mic, label: 'Voiceover', page: <VoiceoverPage /> },
  { id: 'music-gen', icon: Music, label: 'Music Gen', page: <MusicGenPage /> },
  { id: 'video-render', icon: Video, label: 'Video Render', page: <VideoRenderPage /> },
  { id: 'gallery', icon: FolderOpen, label: 'Gallery', page: <GalleryPage />, bottom: true },
];

const SKILLS: WorkspaceSkill[] = [
  { id: 'positioning', label: 'Positioning', icon: Target, file: 'positioning.md' },
  // ...
];

export function MarketingWorkspace() {
  const terminalPtyId = useMarketingStore((s) => s.terminalPtyId);
  const setSetupComplete = useMarketingStore((s) => s.setSetupComplete);

  return (
    <TerminalWorkspace
      title="Marketing"
      tools={TOOLS}
      skills={SKILLS}
      skillPathPrefix="ai/skills/marketing/"
      terminal={<MarketingTerminal />}
      terminalPtyId={terminalPtyId}
      terminalTitle="Marketing Terminal"
      layoutSettingsKey="ui.marketingLayout"
      onSettings={() => setSetupComplete(false)}
    />
  );
}
```

Before: 5 files, ~450 LOC of layout logic
After: 1 file, ~60 LOC (tools + skills arrays + one component)

## Design Decisions

1. **Self-contained state**: The workspace manages its own layout state internally via `useState`. No external Zustand store required. This keeps the API simple — just pass props.

2. **No store dependency**: All sub-components receive state via props. This makes them testable, reusable, and decoupled from any specific domain store.

3. **Tool pages are ReactNode**: Consumers provide pre-rendered pages as `ReactNode`, not component references. This allows pages to close over their own store/context without the workspace needing to know about it.

4. **Skills are optional**: Not every workspace needs skills. The dropdown is hidden when `skills` is empty or omitted.

5. **Layout persistence is opt-in**: Pass `layoutSettingsKey` to persist layout mode to Electron settings. Omit it for transient layouts.

6. **Terminal component is injected**: The workspace doesn't know how to spawn terminals. It just renders whatever `terminal` ReactNode is provided.
