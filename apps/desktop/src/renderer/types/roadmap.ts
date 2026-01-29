/**
 * Types for the Roadmap screen
 */

export type FeatureStatus = 
  | 'backlog'
  | 'planned'
  | 'in-progress'
  | 'shipped'
  | 'archived';

export type FeaturePriority = 'low' | 'medium' | 'high' | 'critical';
export type FeatureComplexity = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type FeatureImpact = 'low' | 'medium' | 'high';

export interface RoadmapFeature {
  id: string;
  title: string;
  description: string;
  status: FeatureStatus;
  priority: FeaturePriority;
  complexity: FeatureComplexity;
  impact: FeatureImpact;
  targetDate?: string;
  taskIds?: string[];  // Linked tasks
  tags?: string[];
  createdAt: number;
  updatedAt: number;
}

export interface RoadmapConfig {
  projectName?: string;
  productVision?: string;
  targetAudience?: string;
  competitors?: string[];
  timeframe?: 'quarter' | 'half-year' | 'year';
  focusAreas?: string[];  // e.g., ["performance", "security", "features"]
}

export const FEATURE_STATUS_CONFIG: Record<FeatureStatus, { label: string; color: string }> = {
  backlog: { label: 'Backlog', color: 'zinc' },
  planned: { label: 'Planned', color: 'blue' },
  'in-progress': { label: 'In Progress', color: 'yellow' },
  shipped: { label: 'Shipped', color: 'green' },
  archived: { label: 'Archived', color: 'gray' },
};

export const PRIORITY_COLORS: Record<FeaturePriority, string> = {
  low: 'bg-zinc-500/10 text-zinc-400',
  medium: 'bg-blue-500/10 text-blue-400',
  high: 'bg-orange-500/10 text-orange-400',
  critical: 'bg-red-500/10 text-red-400',
};

export const COMPLEXITY_VALUES: Record<FeatureComplexity, number> = {
  xs: 1,
  sm: 2,
  md: 3,
  lg: 5,
  xl: 8,
};
