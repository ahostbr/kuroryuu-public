/**
 * Types for the Changelog Generator screen
 */

export type ChangelogSource = 'tasks' | 'git';
export type ChangelogFormat = 'markdown' | 'plain' | 'html';
export type ChangelogAudience = 'developers' | 'end-users' | 'stakeholders';
export type EmojiLevel = 'none' | 'minimal' | 'all';

export interface GitHistoryOptions {
  mode: 'count' | 'date-range' | 'tags' | 'version';
  count?: number;
  startDate?: string;
  endDate?: string;
  startTag?: string;
  endTag?: string;
  version?: string;
  includeMergeCommits: boolean;
}

export interface ChangelogConfig {
  version: string;
  releaseDate: string;
  format: ChangelogFormat;
  audience: ChangelogAudience;
  emojiLevel: EmojiLevel;
  customInstructions?: string;
}

export interface ChangelogEntry {
  id: string;
  type: 'feature' | 'fix' | 'improvement' | 'breaking' | 'docs' | 'other';
  title: string;
  description?: string;
  taskId?: string;
  commitHash?: string;
  selected: boolean;
}

export interface ChangelogState {
  source: ChangelogSource;
  gitOptions: GitHistoryOptions;
  config: ChangelogConfig;
  entries: ChangelogEntry[];
  generatedContent: string;
  isGenerating: boolean;
  currentStep: 1 | 2 | 3;
}

export const ENTRY_TYPE_CONFIG: Record<ChangelogEntry['type'], { label: string; emoji: string; color: string }> = {
  feature: { label: 'Feature', emoji: '✨', color: 'text-green-400' },
  fix: { label: 'Bug Fix', emoji: '🐛', color: 'text-red-400' },
  improvement: { label: 'Improvement', emoji: '⚡', color: 'text-blue-400' },
  breaking: { label: 'Breaking Change', emoji: '💥', color: 'text-orange-400' },
  docs: { label: 'Documentation', emoji: '📚', color: 'text-purple-400' },
  other: { label: 'Other', emoji: '📝', color: 'text-zinc-400' },
};
