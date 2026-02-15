/**
 * Unit Tests for Backup Service
 *
 * Tests:
 * - Flat response parsing (not .data wrapper)
 * - Password handling
 * - Session ID extraction
 * - Snapshot listing
 * - Diff parsing
 * - Restore operation
 * - Error handling
 *
 * Requirements: T108 (Restic backup untested), Wave 2 (10-bug fix)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BackupService } from '../backup-service';
import type {
  BackupStatus,
  ResticBinaryStatus,
  BackupSnapshot,
  SnapshotDiff,
} from '../../../renderer/types/backup';

// ═══════════════════════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════════════════════

global.fetch = vi.fn();

vi.mock('electron', () => ({
  app: {
    getPath: vi.fn(() => '/mock/home'),
  },
}));

vi.mock('fs/promises', () => ({
  mkdir: vi.fn(),
  readFile: vi.fn(),
  writeFile: vi.fn(),
  rename: vi.fn(),
}));

vi.mock('fs', () => ({
  existsSync: vi.fn(() => false),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// Test Helpers
// ═══════════════════════════════════════════════════════════════════════════════

function mockMCPResponse(result: any) {
  vi.mocked(global.fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      jsonrpc: '2.0',
      id: 'test_123',
      result: {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result),
          },
        ],
      },
    }),
  } as any);
}

function mockMCPError(message: string) {
  vi.mocked(global.fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      jsonrpc: '2.0',
      id: 'test_123',
      error: {
        code: -1,
        message,
      },
    }),
  } as any);
}

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('BackupService', () => {
  let service: BackupService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new BackupService();
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Status Operations
  // ─────────────────────────────────────────────────────────────────────────────

  describe('getStatus()', () => {
    it('should correctly read flat response (not .data wrapper)', async () => {
      // Mock flat response structure (Wave 2 fix)
      mockMCPResponse({
        ok: true,
        restic: {
          installed: true,
          version: '0.16.2',
          path: '/usr/local/bin/restic',
        },
        repository: {
          exists: true,
          initialized: true,
        },
        config: {
          source_configured: true,
        },
      });

      const status: BackupStatus = await service.getStatus();

      expect(status.restic_installed).toBe(true);
      expect(status.restic_version).toBe('0.16.2');
      expect(status.repository_exists).toBe(true);
      expect(status.repository_accessible).toBe(true);
      expect(status.is_configured).toBe(true);
    });

    it('should handle missing fields gracefully', async () => {
      mockMCPResponse({
        ok: true,
        restic: {},
        repository: {},
        config: {},
      });

      const status = await service.getStatus();

      expect(status.restic_installed).toBe(false);
      expect(status.restic_version).toBeNull();
      expect(status.repository_exists).toBe(false);
      expect(status.repository_accessible).toBe(false);
      expect(status.is_configured).toBe(false);
    });

    it('should return default status on error', async () => {
      mockMCPError('Connection refused');

      const status = await service.getStatus();

      expect(status.restic_installed).toBe(false);
      expect(status.repository_exists).toBe(false);
      expect(status.snapshot_count).toBe(0);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Repository Operations
  // ─────────────────────────────────────────────────────────────────────────────

  describe('initRepository()', () => {
    it('should pass password correctly to MCP tool', async () => {
      mockMCPResponse({
        ok: true,
        message: 'Repository initialized',
      });

      await service.initRepository('test-password-123');

      // Verify fetch was called with correct password
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('"password":"test-password-123"'),
        })
      );
    });

    it('should return error on init failure', async () => {
      mockMCPError('Repository already exists');

      const result = await service.initRepository('password');

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Repository already exists');
    });
  });

  describe('verifyPassword()', () => {
    it('should return true when password is correct', async () => {
      mockMCPResponse({ ok: true });

      const isValid = await service.verifyPassword('correct-password');

      expect(isValid).toBe(true);
    });

    it('should return false when password is incorrect', async () => {
      mockMCPError('Wrong password');

      const isValid = await service.verifyPassword('wrong-password');

      expect(isValid).toBe(false);
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Backup Operations
  // ─────────────────────────────────────────────────────────────────────────────

  describe('createBackup()', () => {
    it('should read session_id from flat response', async () => {
      mockMCPResponse({
        ok: true,
        session_id: 'backup_20260215_123456',
        snapshot_id: 'abc123def456',
      });

      const result = await service.createBackup('Test backup', ['tag1', 'tag2']);

      expect(result.ok).toBe(true);
      expect(result.session_id).toBe('backup_20260215_123456');
      expect(result.snapshot_id).toBe('abc123def456');
    });

    it('should handle missing session_id', async () => {
      mockMCPResponse({
        ok: true,
        snapshot_id: 'xyz789',
      });

      const result = await service.createBackup();

      expect(result.ok).toBe(true);
      expect(result.session_id).toBe(''); // Fallback to empty string
      expect(result.snapshot_id).toBe('xyz789');
    });

    it('should return structured error on failure', async () => {
      mockMCPError('Source path not found');

      const result = await service.createBackup('Test');

      expect(result.ok).toBe(false);
      expect(result.session_id).toBe('');
      expect(result.error).toBe('Source path not found');
    });
  });

  describe('listSnapshots()', () => {
    it('should read snapshots array from flat response', async () => {
      const mockSnapshots: BackupSnapshot[] = [
        {
          id: 'snap1',
          short_id: 'snap1',
          time: '2026-02-15T10:00:00Z',
          hostname: 'test-host',
          username: 'test-user',
          paths: ['/test/path'],
          tags: ['auto'],
          parent: '',
          time_ago: '1 hour ago',
          message: '',
          stats: { files_new: 0, files_changed: 0, files_unmodified: 0, data_added: 0, total_files_processed: 0, total_bytes_processed: 0 },
          formatted: { time_ago: '1 hour ago', data_added: '0 B', total_size: '0 B', files_summary: '' },
        },
        {
          id: 'snap2',
          short_id: 'snap2',
          time: '2026-02-14T10:00:00Z',
          hostname: 'test-host',
          username: 'test-user',
          paths: ['/test/path'],
          tags: ['manual'],
          parent: '',
          time_ago: '1 day ago',
          message: '',
          stats: { files_new: 0, files_changed: 0, files_unmodified: 0, data_added: 0, total_files_processed: 0, total_bytes_processed: 0 },
          formatted: { time_ago: '1 day ago', data_added: '0 B', total_size: '0 B', files_summary: '' },
        },
      ];

      mockMCPResponse({
        ok: true,
        snapshots: mockSnapshots,
        total_count: 2,
      });

      const result = await service.listSnapshots(50);

      expect(result.ok).toBe(true);
      expect(result.snapshots).toHaveLength(2);
      expect(result.total_count).toBe(2);
      expect(result.snapshots[0].id).toBe('snap1');
    });

    it('should fallback to count if total_count is missing', async () => {
      mockMCPResponse({
        ok: true,
        snapshots: [],
        count: 5, // Old field name
      });

      const result = await service.listSnapshots(10);

      expect(result.total_count).toBe(5);
    });

    it('should return empty array on error', async () => {
      mockMCPError('Repository not found');

      const result = await service.listSnapshots();

      expect(result.ok).toBe(false);
      expect(result.snapshots).toEqual([]);
      expect(result.total_count).toBe(0);
    });
  });

  describe('getDiff()', () => {
    it('should read flat added/removed/modified fields', async () => {
      mockMCPResponse({
        ok: true,
        snapshot_id: 'snap1',
        compare_to: 'snap2',
        added: ['file1.txt', 'file2.txt'],
        removed: ['file3.txt'],
        modified: ['file4.txt'],
      });

      const diff: SnapshotDiff | null = await service.getDiff('snap1', 'snap2');

      expect(diff).not.toBeNull();
      expect(diff!.snapshot_id).toBe('snap1');
      expect(diff!.compare_to).toBe('snap2');
      expect(diff!.added).toEqual(['file1.txt', 'file2.txt']);
      expect(diff!.removed).toEqual(['file3.txt']);
      expect(diff!.modified).toEqual(['file4.txt']);
    });

    it('should handle missing arrays with defaults', async () => {
      mockMCPResponse({
        ok: true,
        snapshot_id: 'snap1',
      });

      const diff = await service.getDiff('snap1');

      expect(diff!.added).toEqual([]);
      expect(diff!.removed).toEqual([]);
      expect(diff!.modified).toEqual([]);
    });

    it('should return null on error', async () => {
      mockMCPError('Snapshot not found');

      const diff = await service.getDiff('invalid-id');

      expect(diff).toBeNull();
    });
  });

  describe('restore()', () => {
    it('should read flat response fields', async () => {
      mockMCPResponse({
        ok: true,
        restored_files: 42,
        message: 'Restore complete',
      });

      const result = await service.restore('snap1', '/restore/target', ['/include/path']);

      expect(result.ok).toBe(true);
      expect(result.restored_files).toBe(42);
      expect(result.target_path).toBe('/restore/target');
    });

    it('should handle restore error', async () => {
      mockMCPError('Permission denied');

      const result = await service.restore('snap1', '/target');

      expect(result.ok).toBe(false);
      expect(result.restored_files).toBe(0);
      expect(result.error).toBe('Permission denied');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Maintenance Operations
  // ─────────────────────────────────────────────────────────────────────────────

  describe('Maintenance Operations', () => {
    it('should call forget with prune flag', async () => {
      mockMCPResponse({
        ok: true,
        message: 'Snapshot forgotten and pruned',
      });

      const result = await service.forgetSnapshot('snap1', true);

      expect(result.ok).toBe(true);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          body: expect.stringContaining('"prune":true'),
        })
      );
    });

    it('should handle prune errors', async () => {
      mockMCPError('Prune failed: repository locked');

      const result = await service.prune();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Prune failed: repository locked');
    });

    it('should handle checkIntegrity errors', async () => {
      mockMCPError('Integrity check failed');

      const result = await service.checkIntegrity();

      expect(result.ok).toBe(false);
      expect(result.error).toBe('Integrity check failed');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Binary Status
  // ─────────────────────────────────────────────────────────────────────────────

  describe('ensureRestic()', () => {
    it('should read restic status from flat response', async () => {
      mockMCPResponse({
        ok: true,
        restic: {
          installed: true,
          path: '/usr/local/bin/restic',
          version: '0.16.2',
          downloaded: true,
        },
      });

      const status: ResticBinaryStatus = await service.ensureRestic();

      expect(status.installed).toBe(true);
      expect(status.path).toBe('/usr/local/bin/restic');
      expect(status.version).toBe('0.16.2');
      expect(status.downloaded).toBe(true);
    });

    it('should return default status when restic is missing', async () => {
      mockMCPResponse({
        ok: false,
      });

      const status = await service.ensureRestic();

      expect(status.installed).toBe(false);
      expect(status.path).toBeNull();
      expect(status.version).toBeNull();
      expect(status.downloaded).toBe(false);
    });
  });
});
