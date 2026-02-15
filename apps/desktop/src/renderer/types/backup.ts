/**
 * Backup Types
 *
 * TypeScript types for the Restic backup management system.
 */

// ============================================================================
// CONFIGURATION
// ============================================================================

export interface BackupRepository {
  path: string;
  type: 'local'; // v1 only supports local
  initialized: boolean;
}

export interface BackupRetention {
  keep_last: number;
  keep_daily: number;
  keep_weekly: number;
  keep_monthly: number;
}

export interface BackupSchedule {
  enabled: boolean;
  interval_hours: number;
  last_run?: string; // ISO timestamp
}

export interface BackupConfig {
  schema_version: string;
  repository: BackupRepository;
  backup: {
    source_path: string;
    exclusions: string[];
  };
  retention: BackupRetention;
  schedule: BackupSchedule;
}

// ============================================================================
// SNAPSHOTS
// ============================================================================

export interface SnapshotStats {
  files_new: number;
  files_changed: number;
  files_unmodified: number;
  dirs_new?: number; // Optional - not always returned by list API
  dirs_changed?: number;
  dirs_unmodified?: number;
  data_added: number;
  total_files_processed: number;
  total_bytes_processed: number;
}

export interface SnapshotFormatted {
  time_ago: string;
  data_added: string;
  total_size: string;
  files_summary: string; // e.g., "+42 ~18"
}

export interface BackupSnapshot {
  id: string;
  short_id: string;
  parent: string | null;
  tree?: string; // Optional - not always returned by list API

  // Timestamps
  time: string; // ISO timestamp
  time_ago: string;

  // Metadata
  hostname: string;
  username: string;
  tags: string[];
  paths: string[];

  // Git-like commit info
  message: string;

  // Stats
  stats: SnapshotStats;

  // Formatted display values
  formatted: SnapshotFormatted;
}

// ============================================================================
// DIFF
// ============================================================================

export type DiffStatus = 'added' | 'removed' | 'modified';

export interface DiffEntry {
  path: string;
  status: DiffStatus;
}

export interface SnapshotDiff {
  snapshot_id: string;
  compare_to: string;
  added: DiffEntry[];
  removed: DiffEntry[];
  modified: DiffEntry[];
}

// ============================================================================
// PROGRESS
// ============================================================================

export interface BackupProgress {
  session_id: string;
  percent: number;
  files_done: number;
  bytes_done: number;
  total_files: number;
  total_bytes: number;
  current_file: string | null;
  timestamp: string;
}

export interface BackupSummary {
  session_id: string;
  snapshot_id: string;
  files_new: number;
  files_changed: number;
  files_unmodified: number;
  dirs_new: number;
  dirs_changed: number;
  dirs_unmodified: number;
  data_added: number;
  total_files_processed: number;
  total_bytes_processed: number;
  duration_seconds: number;
}

export interface BackupError {
  session_id: string;
  message: string;
  code: string;
}

// Union type for all backup events
export type BackupEvent =
  | { type: 'progress'; data: BackupProgress }
  | { type: 'summary'; data: BackupSummary }
  | { type: 'error'; data: BackupError }
  | { type: 'log'; data: { line: string } }
  | { type: 'heartbeat'; data: { timestamp: string } };

// ============================================================================
// OPERATION STATUS
// ============================================================================

export interface BackupStatus {
  is_configured: boolean;
  repository_exists: boolean;
  repository_accessible: boolean;
  restic_installed: boolean;
  restic_version: string | null;
  config_path: string;
  binary_path: string;
  snapshot_count: number;
  last_backup_time: string | null;
}

// ============================================================================
// API RESPONSES
// ============================================================================

export interface BackupApiResponse {
  ok: boolean;
  error?: string;
  message?: string;
  [key: string]: unknown;
}

export interface ListSnapshotsResponse {
  ok: boolean;
  snapshots: BackupSnapshot[];
  total_count: number;
}

export interface CreateBackupResponse {
  ok: boolean;
  session_id: string;
  snapshot_id?: string;
  error?: string;
}

export interface RestoreResponse {
  ok: boolean;
  restored_files: number;
  target_path: string;
  error?: string;
}

export interface InitRepoResponse {
  ok: boolean;
  message: string;
  error?: string;
}

// ============================================================================
// RESTIC BINARY
// ============================================================================

export interface ResticBinaryStatus {
  installed: boolean;
  path: string | null;
  version: string | null;
  downloaded: boolean;
}
