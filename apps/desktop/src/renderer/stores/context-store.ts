/**
 * Zustand store for Context screen state
 * Manages Project Index (file tree + indexing) and Memories
 * 
 * Uses MCP_CORE RAG tools for semantic search and indexing
 */

import { create } from 'zustand';
import type { ContextTab, FileNode, Memory, ProjectIndexStats, IndexStatus } from '../types/context';
import { mcpClient } from '../services/mcp-client';

interface ContextState {
  // Tab state
  activeTab: ContextTab;
  setActiveTab: (tab: ContextTab) => void;

  // Project Index state
  fileTree: FileNode[];
  indexStats: ProjectIndexStats;
  isIndexing: boolean;
  selectedFile: FileNode | null;
  setFileTree: (tree: FileNode[]) => void;
  toggleFolder: (nodeId: string) => void;
  selectFile: (node: FileNode | null) => void;
  reindexAll: () => Promise<void>;
  reindexFile: (path: string) => Promise<void>;

  // RAG search state
  ragResults: Array<{ score: number; content: string; source: string }>;
  isSearchingRAG: boolean;
  searchRAG: (query: string) => Promise<void>;
  clearRAGResults: () => void;

  // Memories state
  memories: Memory[];
  memorySearchQuery: string;
  filteredMemories: Memory[];
  selectedMemory: Memory | null;
  isSyncing: boolean;
  setMemorySearchQuery: (query: string) => void;
  selectMemory: (memory: Memory | null) => void;
  addMemory: (memory: Omit<Memory, 'id' | 'createdAt' | 'updatedAt' | 'syncStatus'>) => void;
  deleteMemory: (id: string) => void;
  syncMemories: () => Promise<void>;

  // Initialize with mock data
  initialize: () => void;
}

// Helper to generate mock file tree
function generateMockFileTree(): FileNode[] {
  return [
    {
      id: 'src',
      name: 'src',
      path: '/src',
      type: 'folder',
      indexStatus: 'indexed',
      expanded: true,
      children: [
        {
          id: 'src-renderer',
          name: 'renderer',
          path: '/src/renderer',
          type: 'folder',
          indexStatus: 'indexed',
          expanded: true,
          children: [
            { id: 'app-tsx', name: 'App.tsx', path: '/src/renderer/App.tsx', type: 'file', indexStatus: 'indexed', lastIndexed: Date.now() - 3600000, size: 4520, extension: 'tsx' },
            { id: 'main-tsx', name: 'main.tsx', path: '/src/renderer/main.tsx', type: 'file', indexStatus: 'indexed', lastIndexed: Date.now() - 7200000, size: 1240, extension: 'tsx' },
            { id: 'index-css', name: 'index.css', path: '/src/renderer/index.css', type: 'file', indexStatus: 'not-indexed', size: 890, extension: 'css' },
          ],
        },
        {
          id: 'src-main',
          name: 'main',
          path: '/src/main',
          type: 'folder',
          indexStatus: 'pending',
          expanded: false,
          children: [
            { id: 'main-ts', name: 'main.ts', path: '/src/main/main.ts', type: 'file', indexStatus: 'pending', size: 3200, extension: 'ts' },
            { id: 'preload-ts', name: 'preload.ts', path: '/src/main/preload.ts', type: 'file', indexStatus: 'error', size: 1560, extension: 'ts' },
          ],
        },
      ],
    },
    {
      id: 'components',
      name: 'components',
      path: '/components',
      type: 'folder',
      indexStatus: 'indexed',
      expanded: false,
      children: [
        { id: 'sidebar-tsx', name: 'Sidebar.tsx', path: '/components/Sidebar.tsx', type: 'file', indexStatus: 'indexed', lastIndexed: Date.now() - 1800000, size: 2890, extension: 'tsx' },
        { id: 'kanban-tsx', name: 'KanbanBoard.tsx', path: '/components/KanbanBoard.tsx', type: 'file', indexStatus: 'indexed', lastIndexed: Date.now() - 1800000, size: 5670, extension: 'tsx' },
      ],
    },
    { id: 'package-json', name: 'package.json', path: '/package.json', type: 'file', indexStatus: 'indexed', lastIndexed: Date.now() - 86400000, size: 2340, extension: 'json' },
    { id: 'readme-md', name: 'README.md', path: '/README.md', type: 'file', indexStatus: 'indexed', lastIndexed: Date.now() - 172800000, size: 4560, extension: 'md' },
    { id: 'tsconfig-json', name: 'tsconfig.json', path: '/tsconfig.json', type: 'file', indexStatus: 'not-indexed', size: 890, extension: 'json' },
  ];
}

// Helper to generate mock memories
function generateMockMemories(): Memory[] {
  return [
    {
      id: 'mem-1',
      title: 'Project Architecture Overview',
      content: 'Kuroryuu uses Electron + Vite + React 19 with TypeScript. The renderer process handles UI, main process handles system operations.',
      source: 'auto',
      tags: ['architecture', 'setup'],
      createdAt: Date.now() - 86400000 * 3,
      updatedAt: Date.now() - 86400000,
      syncStatus: 'synced',
    },
    {
      id: 'mem-2',
      title: 'Styling Guidelines',
      content: 'Using Tailwind CSS 4 with "Oscura Midnight" theme. Primary background: #0B0B0F, Yellow accent: #D6D876, borders: zinc-800.',
      source: 'user',
      tags: ['styling', 'design', 'tailwind'],
      createdAt: Date.now() - 86400000 * 2,
      updatedAt: Date.now() - 86400000 * 2,
      syncStatus: 'synced',
    },
    {
      id: 'mem-3',
      title: 'State Management Pattern',
      content: 'Use Zustand 5.x for state management. One store per feature domain. Stores are in /stores folder with naming pattern [feature]-store.ts.',
      source: 'user',
      tags: ['state', 'zustand', 'patterns'],
      createdAt: Date.now() - 86400000,
      updatedAt: Date.now() - 43200000,
      syncStatus: 'pending',
    },
    {
      id: 'mem-4',
      title: 'API Integration Notes',
      content: 'Claude API via Anthropic SDK. Support for multiple models. Tool calling enabled for file operations, terminal commands, and search.',
      source: 'imported',
      tags: ['api', 'claude', 'integration'],
      createdAt: Date.now() - 3600000,
      updatedAt: Date.now() - 3600000,
      syncStatus: 'local-only',
    },
  ];
}

// Calculate stats from file tree
function calculateStats(tree: FileNode[]): ProjectIndexStats {
  let total = 0, indexed = 0, pending = 0, error = 0;
  
  const countNodes = (nodes: FileNode[]) => {
    for (const node of nodes) {
      if (node.type === 'file') {
        total++;
        if (node.indexStatus === 'indexed') indexed++;
        else if (node.indexStatus === 'pending') pending++;
        else if (node.indexStatus === 'error') error++;
      }
      if (node.children) countNodes(node.children);
    }
  };
  
  countNodes(tree);
  return { totalFiles: total, indexedFiles: indexed, pendingFiles: pending, errorFiles: error, lastFullIndex: Date.now() - 86400000 };
}

// Helper to update node in tree
function updateNodeInTree(tree: FileNode[], nodeId: string, updater: (node: FileNode) => FileNode): FileNode[] {
  return tree.map(node => {
    if (node.id === nodeId) {
      return updater(node);
    }
    if (node.children) {
      return { ...node, children: updateNodeInTree(node.children, nodeId, updater) };
    }
    return node;
  });
}

export const useContextStore = create<ContextState>((set, get) => ({
  // Tab state
  activeTab: 'project-index',
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Project Index state
  fileTree: [],
  indexStats: { totalFiles: 0, indexedFiles: 0, pendingFiles: 0, errorFiles: 0 },
  isIndexing: false,
  selectedFile: null,
  
  // RAG search state
  ragResults: [],
  isSearchingRAG: false,
  
  searchRAG: async (query: string) => {
    set({ isSearchingRAG: true, ragResults: [] });
    
    try {
      const result = await mcpClient.rag.query(query, 10);
      
      if (result.ok && result.data) {
        set({ ragResults: result.data, isSearchingRAG: false });
      } else {
        console.error('RAG query failed:', result.error);
        set({ ragResults: [], isSearchingRAG: false });
      }
    } catch (e) {
      console.error('RAG query error:', e);
      set({ ragResults: [], isSearchingRAG: false });
    }
  },
  
  clearRAGResults: () => set({ ragResults: [] }),
  
  setFileTree: (tree) => set({ fileTree: tree, indexStats: calculateStats(tree) }),
  
  toggleFolder: (nodeId) => {
    const { fileTree } = get();
    const newTree = updateNodeInTree(fileTree, nodeId, (node) => ({
      ...node,
      expanded: !node.expanded,
    }));
    set({ fileTree: newTree });
  },
  
  selectFile: (node) => set({ selectedFile: node }),
  
  reindexAll: async () => {
    set({ isIndexing: true });
    
    // Try to use MCP_CORE RAG index
    const result = await mcpClient.rag.index('.');
    
    if (result.ok) {
      console.log('Indexed', result.data?.indexed, 'files via RAG');
    }
    
    // Also update local file tree status
    await new Promise(resolve => setTimeout(resolve, 500));
    const { fileTree } = get();
    const updateAllStatus = (nodes: FileNode[]): FileNode[] => 
      nodes.map(node => ({
        ...node,
        indexStatus: node.type === 'file' ? 'indexed' as IndexStatus : node.indexStatus,
        lastIndexed: node.type === 'file' ? Date.now() : node.lastIndexed,
        children: node.children ? updateAllStatus(node.children) : undefined,
      }));
    const newTree = updateAllStatus(fileTree);
    set({ fileTree: newTree, indexStats: calculateStats(newTree), isIndexing: false });
  },
  
  reindexFile: async (path) => {
    const { fileTree } = get();
    // Find and update the specific file
    const findAndUpdate = (nodes: FileNode[]): FileNode[] => 
      nodes.map(node => {
        if (node.path === path) {
          return { ...node, indexStatus: 'pending' as IndexStatus };
        }
        if (node.children) {
          return { ...node, children: findAndUpdate(node.children) };
        }
        return node;
      });
    set({ fileTree: findAndUpdate(fileTree) });
    
    // Simulate indexing
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const { fileTree: currentTree } = get();
    const completeUpdate = (nodes: FileNode[]): FileNode[] => 
      nodes.map(node => {
        if (node.path === path) {
          return { ...node, indexStatus: 'indexed' as IndexStatus, lastIndexed: Date.now() };
        }
        if (node.children) {
          return { ...node, children: completeUpdate(node.children) };
        }
        return node;
      });
    const newTree = completeUpdate(currentTree);
    set({ fileTree: newTree, indexStats: calculateStats(newTree) });
  },

  // Memories state
  memories: [],
  memorySearchQuery: '',
  filteredMemories: [],
  selectedMemory: null,
  isSyncing: false,
  
  setMemorySearchQuery: (query) => {
    const { memories } = get();
    const filtered = query
      ? memories.filter(m => 
          m.title.toLowerCase().includes(query.toLowerCase()) ||
          m.content.toLowerCase().includes(query.toLowerCase()) ||
          m.tags.some(t => t.toLowerCase().includes(query.toLowerCase()))
        )
      : memories;
    set({ memorySearchQuery: query, filteredMemories: filtered });
  },
  
  selectMemory: (memory) => set({ selectedMemory: memory }),
  
  addMemory: (memory) => {
    const newMemory: Memory = {
      ...memory,
      id: `mem-${Date.now()}`,
      createdAt: Date.now(),
      updatedAt: Date.now(),
      syncStatus: 'local-only',
    };
    const { memories, memorySearchQuery } = get();
    const newMemories = [newMemory, ...memories];
    set({ 
      memories: newMemories,
      filteredMemories: memorySearchQuery ? get().filteredMemories : newMemories,
    });
  },
  
  deleteMemory: (id) => {
    const { memories, filteredMemories, selectedMemory } = get();
    set({
      memories: memories.filter(m => m.id !== id),
      filteredMemories: filteredMemories.filter(m => m.id !== id),
      selectedMemory: selectedMemory?.id === id ? null : selectedMemory,
    });
  },
  
  syncMemories: async () => {
    set({ isSyncing: true });
    await new Promise(resolve => setTimeout(resolve, 1500));
    const { memories } = get();
    const synced = memories.map(m => ({ ...m, syncStatus: 'synced' as const }));
    set({ memories: synced, filteredMemories: synced, isSyncing: false });
  },

  // Initialize
  initialize: () => {
    const tree = generateMockFileTree();
    const memories = generateMockMemories();
    set({
      fileTree: tree,
      indexStats: calculateStats(tree),
      memories,
      filteredMemories: memories,
    });
  },
}));
