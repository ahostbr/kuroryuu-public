/**
 * Zustand store for Checkpoints Panel
 *
 * Manages checkpoint data from k_checkpoint MCP tool
 */
import { create } from 'zustand';

// ============================================================================
// Types
// ============================================================================

export interface Checkpoint {
  id: string;           // cp_20260124_163000_a1b2c3d4
  name: string;         // PRD-First-Orchestration
  saved_at: string;     // ISO timestamp
  summary?: string;     // Optional description
  tags: string[];       // ["orchestration", "desktop"]
  size_bytes: number;
  path: string;         // Relative path to JSON
}

export interface CheckpointFull extends Checkpoint {
  schema?: string;      // kuroryuu_checkpoint_v1
  data?: unknown;       // Full payload
}

interface CheckpointsState {
  checkpoints: Checkpoint[];
  isLoading: boolean;
  searchQuery: string;
  selectedCheckpointId: string | null;
  selectedCheckpoint: CheckpointFull | null;
  detailLoading: boolean;

  // Actions
  loadCheckpoints: () => Promise<void>;
  loadCheckpointDetail: (id: string) => Promise<void>;
  setSearchQuery: (query: string) => void;
  selectCheckpoint: (id: string | null) => void;
  getFilteredCheckpoints: () => Checkpoint[];
}

// ============================================================================
// Helpers
// ============================================================================

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function extractDateFromId(id: string): string {
  // Format: cp_20260124_163000_a1b2c3d4 -> 2026-01-24
  const match = id.match(/cp_(\d{4})(\d{2})(\d{2})/);
  if (match) {
    return `${match[1]}-${match[2]}-${match[3]}`;
  }
  return 'Unknown';
}

function extractTimeFromId(id: string): string {
  // Format: cp_20260124_163000_a1b2c3d4 -> 16:30:00
  const match = id.match(/cp_\d{8}_(\d{2})(\d{2})(\d{2})/);
  if (match) {
    return `${match[1]}:${match[2]}:${match[3]}`;
  }
  return '';
}

// ============================================================================
// Store
// ============================================================================

export const useCheckpointsStore = create<CheckpointsState>((set, get) => ({
  checkpoints: [],
  isLoading: false,
  searchQuery: '',
  selectedCheckpointId: null,
  selectedCheckpoint: null,
  detailLoading: false,

  loadCheckpoints: async () => {
    set({ isLoading: true });
    try {
      const result = await window.electronAPI.mcp.checkpoint.list(100);

      // Handle different response structures
      let checkpointList: Checkpoint[] = [];

      if (result && typeof result === 'object') {
        // Check for result.result (wrapped MCP response)
        const data = (result as { result?: { checkpoints?: Checkpoint[] }; checkpoints?: Checkpoint[] }).result || result;

        if (Array.isArray((data as { checkpoints?: Checkpoint[] }).checkpoints)) {
          checkpointList = (data as { checkpoints: Checkpoint[] }).checkpoints;
        } else if (Array.isArray(data)) {
          checkpointList = data as Checkpoint[];
        }
      }

      // Sort by saved_at descending (newest first)
      checkpointList.sort((a, b) => {
        const dateA = a.saved_at || a.id;
        const dateB = b.saved_at || b.id;
        return dateB.localeCompare(dateA);
      });

      set({ checkpoints: checkpointList });
    } catch (err) {
      console.error('[Checkpoints] Failed to load:', err);
    } finally {
      set({ isLoading: false });
    }
  },

  loadCheckpointDetail: async (id: string) => {
    set({ detailLoading: true });
    try {
      const result = await window.electronAPI.mcp.checkpoint.load(id);
      console.log('[Checkpoints] Load result:', JSON.stringify(result, null, 2));

      // Handle various response structures from MCP
      let checkpointData: CheckpointFull | null = null;

      if (result && typeof result === 'object') {
        const r = result as Record<string, unknown>;

        // Try different extraction paths
        // 1. Direct checkpoint with schema field
        if (r.schema === 'kuroryuu_checkpoint_v1' || r.id || r.name) {
          checkpointData = r as unknown as CheckpointFull;
        }
        // 2. Nested in result field
        else if (r.result && typeof r.result === 'object') {
          const nested = r.result as Record<string, unknown>;
          if (nested.schema === 'kuroryuu_checkpoint_v1' || nested.id || nested.name) {
            checkpointData = nested as unknown as CheckpointFull;
          }
          // 3. Nested in result.checkpoint
          else if (nested.checkpoint && typeof nested.checkpoint === 'object') {
            checkpointData = nested.checkpoint as CheckpointFull;
          }
        }
        // 4. Nested in checkpoint field
        else if (r.checkpoint && typeof r.checkpoint === 'object') {
          checkpointData = r.checkpoint as CheckpointFull;
        }
      }

      // Calculate size_bytes from data if not provided by MCP
      if (checkpointData && !checkpointData.size_bytes && checkpointData.data) {
        try {
          checkpointData.size_bytes = new Blob([JSON.stringify(checkpointData.data)]).size;
        } catch {
          checkpointData.size_bytes = 0;
        }
      }

      console.log('[Checkpoints] Extracted checkpoint:', checkpointData?.id, 'has data:', !!checkpointData?.data, 'size:', checkpointData?.size_bytes);

      if (checkpointData) {
        set({ selectedCheckpoint: checkpointData });
      }
    } catch (err) {
      console.error('[Checkpoints] Failed to load detail:', err);
    } finally {
      set({ detailLoading: false });
    }
  },

  setSearchQuery: (query) => set({ searchQuery: query }),

  selectCheckpoint: (id) => {
    set({ selectedCheckpointId: id, selectedCheckpoint: null });
    if (id) {
      get().loadCheckpointDetail(id);
    }
  },

  getFilteredCheckpoints: () => {
    const { checkpoints, searchQuery } = get();
    if (!searchQuery.trim()) return checkpoints;

    const q = searchQuery.toLowerCase();
    return checkpoints.filter((cp) =>
      cp.name.toLowerCase().includes(q) ||
      cp.summary?.toLowerCase().includes(q) ||
      cp.tags?.some((t) => t.toLowerCase().includes(q)) ||
      cp.id.toLowerCase().includes(q)
    );
  },
}));

// Export helpers for use in components
export { formatBytes, extractDateFromId, extractTimeFromId };
