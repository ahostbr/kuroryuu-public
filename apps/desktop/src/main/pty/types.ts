export interface PtyProcess {
  id: string;
  pid: number;
  cols: number;
  rows: number;
  cwd: string;
  sessionId?: string; // Kuroryuu hook session ID
}

export interface CreatePtyOptions {
  cmd?: string;
  args?: string[];
  cwd?: string;
  env?: Record<string, string>;
  cols?: number;
  rows?: number;
  // Ownership metadata for targeted routing (Plan: PTY_TargetedRouting)
  ownerAgentId?: string;
  ownerSessionId?: string;
  ownerRole?: 'leader' | 'worker';
  label?: string;
  title?: string;      // Human-friendly terminal title
  cliType?: string;    // CLI type: 'shell', 'claude', 'kiro', etc.
}

// Event payload for PTY create events
export interface PtyCreateEvent {
  id: string;
  sessionId: string;
  pid: number;
  cliType: string;
  // Ownership metadata (optional)
  ownerAgentId?: string;
  ownerSessionId?: string;
  ownerRole?: string;
  label?: string;
}

export interface PtyDataEvent {
  id: string;
  data: string;
}

export interface PtyExitEvent {
  id: string;
  exitCode: number;
}
