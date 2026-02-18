export interface A2UIComponent {
  type: string;
  id: string;
  props: Record<string, any>;
  children?: A2UIComponent[];
  zone?: string;
  layout?: Record<string, string>;
}

export interface ActivityLogEntry {
  timestamp: string;
  step: string;
  message: string;
}

export type RenderMode = 'components' | 'playground';

export interface FeedbackEntry {
  timestamp: string;
  promptText: string;
  sentTo: 'clipboard' | 'claude-pty';
  targetPtyId?: string;
}

export interface PlaygroundFile {
  name: string;
  path: string;
  size: number;
  mtime: string;
}

export interface DashboardState {
  markdownContent: string;
  documentTitle: string;
  documentType: string;
  contentAnalysis: Record<string, any>;
  layoutType: string;
  components: A2UIComponent[];
  status: 'idle' | 'analyzing' | 'generating' | 'complete' | 'error';
  progress: number;
  currentStep: string;
  activityLog: ActivityLogEntry[];
  errorMessage: string | null;

  // Playground mode fields
  renderMode: RenderMode;
  playgroundHTML: string | null;
  playgroundFileName: string | null;
  promptOutput: string | null;
  feedbackHistory: FeedbackEntry[];
}

export interface JsonPatch {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value?: any;
}
