/**
 * Types for the Context screen
 * - Project Index: File tree with AI indexing status
 * - Memories: Searchable memory cards with sync status
 */

export type IndexStatus = 'indexed' | 'pending' | 'error' | 'not-indexed';

export interface FileNode {
  id: string;
  name: string;
  path: string;
  type: 'file' | 'folder';
  indexStatus: IndexStatus;
  lastIndexed?: number;
  children?: FileNode[];
  expanded?: boolean;
  size?: number;
  extension?: string;
}

export interface Memory {
  id: string;
  title: string;
  content: string;
  source: 'user' | 'auto' | 'imported';
  tags: string[];
  createdAt: number;
  updatedAt: number;
  syncStatus: 'synced' | 'pending' | 'error' | 'local-only';
}

export interface ProjectIndexStats {
  totalFiles: number;
  indexedFiles: number;
  pendingFiles: number;
  errorFiles: number;
  lastFullIndex?: number;
}

export interface MemorySearchResult {
  memory: Memory;
  relevance: number;
  matchedFields: string[];
}

export type ContextTab = 'project-index' | 'memories';

export const INDEX_STATUS_CONFIG: Record<IndexStatus, { label: string; color: string; icon: string }> = {
  'indexed': { label: 'Indexed', color: 'text-green-400', icon: '✓' },
  'pending': { label: 'Pending', color: 'text-yellow-400', icon: '⏳' },
  'error': { label: 'Error', color: 'text-red-400', icon: '✗' },
  'not-indexed': { label: 'Not Indexed', color: 'text-zinc-500', icon: '○' },
};

export const MEMORY_SOURCE_CONFIG: Record<Memory['source'], { label: string; color: string }> = {
  'user': { label: 'User Created', color: 'bg-blue-500/20 text-blue-400' },
  'auto': { label: 'Auto Generated', color: 'bg-purple-500/20 text-purple-400' },
  'imported': { label: 'Imported', color: 'bg-green-500/20 text-green-400' },
};
