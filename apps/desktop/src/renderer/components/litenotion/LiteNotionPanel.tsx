import { LiteNotionWorkspace } from './LiteNotionWorkspace';

/**
 * LiteNotionPanel — Top-level panel rendered in the main App.
 *
 * Split layout: terminal always on the LEFT, active tool page on the RIGHT,
 * with a draggable resize handle between them.
 * Uses the shared TerminalWorkspace component (same pattern as MarketingPanel).
 */
export function LiteNotionPanel() {
  return <LiteNotionWorkspace />;
}
