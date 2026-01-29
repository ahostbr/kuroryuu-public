/**
 * Types for the Ideation screen
 */

export type IdeaType = 
  | 'improvement'
  | 'vulnerability'
  | 'performance'
  | 'documentation'
  | 'testing';

export type IdeaStatus = 
  | 'new'
  | 'reviewing'
  | 'accepted'
  | 'dismissed'
  | 'converted';

export interface Idea {
  id: string;
  type: IdeaType;
  title: string;
  description: string;
  rationale?: string;
  impact?: 'low' | 'medium' | 'high';
  effort?: 'low' | 'medium' | 'high';
  status: IdeaStatus;
  taskId?: string;  // If converted to task
  files?: string[]; // Related files
  createdAt: number;
  updatedAt: number;
}

export interface IdeationConfig {
  types: IdeaType[];
  maxIdeas: number;
  includeFiles: boolean;
  focusArea?: string;
}

export const IDEA_TYPE_CONFIG: Record<IdeaType, { label: string; color: string; icon: string }> = {
  improvement: { label: 'Improvement', color: 'blue', icon: 'Lightbulb' },
  vulnerability: { label: 'Vulnerability', color: 'red', icon: 'Shield' },
  performance: { label: 'Performance', color: 'yellow', icon: 'Zap' },
  documentation: { label: 'Documentation', color: 'green', icon: 'FileText' },
  testing: { label: 'Testing', color: 'purple', icon: 'TestTube' },
};

export const IDEA_TYPE_COLORS: Record<IdeaType, string> = {
  improvement: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
  vulnerability: 'bg-red-500/10 text-red-400 border-red-500/30',
  performance: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
  documentation: 'bg-green-500/10 text-green-400 border-green-500/30',
  testing: 'bg-purple-500/10 text-purple-400 border-purple-500/30',
};

// Session persistence types
export interface IdeaSessionSummary {
  id: string;
  name: string;
  description: string;
  idea_count: number;
  created_at: string;
  updated_at: string;
}

export interface SavedIdea {
  id: string;
  title: string;
  description: string;
  type: string;
  impact: string;
  effort: string;
  rationale: string;
  files: string[];
  status: string;
  created_at: string;
  updated_at: string;
}

export interface IdeaSession {
  id: string;
  name: string;
  description: string;
  ideas: SavedIdea[];
  created_at: string;
  updated_at: string;
  config: Record<string, unknown>;
  context_snapshot: {
    total_files: number;
    total_symbols: number;
    total_todos: number;
    indexed_at: string;
  };
}
