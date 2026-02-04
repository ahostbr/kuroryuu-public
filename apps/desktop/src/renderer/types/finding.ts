export type FindingSeverity = 'critical' | 'high' | 'medium' | 'low' | 'info';

export type FindingCategory =
  | 'bug'
  | 'security'
  | 'performance'
  | 'memory_leak'
  | 'code_quality'
  | 'refactoring'
  | 'testing'
  | 'documentation';

export interface Finding {
  id: string;
  title: string;
  description: string;
  severity: FindingSeverity;
  category: FindingCategory;
  location?: string;      // File path if detected
  lineNumbers?: string;   // e.g., "45-52" or "123"
  selected: boolean;      // For UI multi-select
}

export interface FindingsExtractionResult {
  sessionId: string;
  extractedAt: string;
  findings: Finding[];
  metadata: {
    totalFound: number;
    bySeverity: Record<FindingSeverity, number>;
    byCategory: Record<FindingCategory, number>;
  };
}
