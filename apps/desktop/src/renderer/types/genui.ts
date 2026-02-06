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
}

export interface JsonPatch {
  op: 'add' | 'replace' | 'remove';
  path: string;
  value?: any;
}
