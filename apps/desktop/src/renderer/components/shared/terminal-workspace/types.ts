import type { LucideIcon } from 'lucide-react';

/** A single tool in the workspace nav */
export interface WorkspaceTool {
  id: string;
  icon: LucideIcon;
  label: string;
  /** The page component rendered when this tool is active */
  page: React.ReactNode;
  /** If true, item is placed at the bottom of the nav (e.g. gallery) */
  bottom?: boolean;
}

/** A skill entry for the header dropdown */
export interface WorkspaceSkill {
  id: string;
  label: string;
  icon: LucideIcon;
  /** File path relative to ai/skills/ — sent to terminal as quoted path */
  file: string;
}

export type LayoutMode = 'grid' | 'splitter' | 'window';

/** Props for the top-level TerminalWorkspace */
export interface TerminalWorkspaceProps {
  /** Panel title shown in the header */
  title: string;
  /** Available tools with their pages */
  tools: WorkspaceTool[];
  /** Skills for the header dropdown (optional) */
  skills?: WorkspaceSkill[];
  /** Skill file path prefix (e.g. "ai/skills/marketing/") */
  skillPathPrefix?: string;
  /** The terminal component to render */
  terminal: React.ReactNode;
  /** PTY ID for writing skills to terminal (optional — skills dropdown disabled without it) */
  terminalPtyId?: string | null;
  /** Terminal title shown in the window/split header */
  terminalTitle?: string;
  /** Settings key for persisting layout mode (e.g. "ui.marketingLayout") */
  layoutSettingsKey?: string;
  /** Extra elements rendered in the header right section (before layout toggle) */
  headerExtra?: React.ReactNode;
  /** Callback when settings button is clicked (omit to hide settings button) */
  onSettings?: () => void;
  /** Default tool ID to show on mount */
  defaultTool?: string;
  /** Default layout mode */
  defaultLayout?: LayoutMode;
  /** Default split ratio (20-80) */
  defaultSplitRatio?: number;
}

/** Internal workspace state managed by the hook */
export interface WorkspaceState {
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
