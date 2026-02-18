/**
 * SettingsPanel - Backup configuration and maintenance
 */

import { useState, useEffect } from 'react';
import {
  FolderOpen,
  Filter,
  Clock,
  HardDrive,
  Shield,
  Trash2,
  RefreshCw,
  AlertCircle,
  Check,
  Plus,
  X,
  Save,
} from 'lucide-react';
import { useBackupStore } from '../../stores/backup-store';
import type { BackupConfig, BackupRetention } from '../../types/backup';

// ============================================================================
// Exclusions Editor Component
// ============================================================================

function ExclusionsEditor({
  exclusions,
  onChange,
}: {
  exclusions: string[];
  onChange: (exclusions: string[]) => void;
}) {
  const [newPattern, setNewPattern] = useState('');

  const addExclusion = () => {
    if (newPattern && !exclusions.includes(newPattern)) {
      onChange([...exclusions, newPattern]);
      setNewPattern('');
    }
  };

  const removeExclusion = (pattern: string) => {
    onChange(exclusions.filter((e) => e !== pattern));
  };

  return (
    <div className="space-y-3">
      <div className="flex gap-2">
        <input
          type="text"
          value={newPattern}
          onChange={(e) => setNewPattern(e.target.value)}
          onKeyDown={(e) => e.key === 'Enter' && addExclusion()}
          placeholder="Add pattern (e.g., **/node_modules/)"
          className="flex-1 px-3 py-2 bg-secondary/50 border border-border rounded-lg text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
        />
        <button
          onClick={addExclusion}
          className="px-3 py-2 bg-secondary hover:bg-secondary/80 rounded-lg transition-colors"
        >
          <Plus className="w-4 h-4" />
        </button>
      </div>
      <div className="max-h-40 overflow-y-auto space-y-1">
        {exclusions.map((pattern) => (
          <div
            key={pattern}
            className="flex items-center justify-between px-3 py-2 bg-secondary/30 rounded group"
          >
            <code className="text-xs text-foreground">{pattern}</code>
            <button
              onClick={() => removeExclusion(pattern)}
              className="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ============================================================================
// Retention Editor Component
// ============================================================================

function RetentionEditor({
  retention,
  onChange,
}: {
  retention: BackupRetention;
  onChange: (retention: BackupRetention) => void;
}) {
  const fields = [
    { key: 'keep_last', label: 'Keep Last', description: 'snapshots' },
    { key: 'keep_daily', label: 'Keep Daily', description: 'days' },
    { key: 'keep_weekly', label: 'Keep Weekly', description: 'weeks' },
    { key: 'keep_monthly', label: 'Keep Monthly', description: 'months' },
  ] as const;

  return (
    <div className="grid grid-cols-2 gap-4">
      {fields.map(({ key, label, description }) => (
        <div key={key}>
          <label className="text-xs text-muted-foreground">{label}</label>
          <div className="flex items-center gap-2 mt-1">
            <input
              type="number"
              min="0"
              value={retention[key]}
              onChange={(e) =>
                onChange({ ...retention, [key]: parseInt(e.target.value) || 0 })
              }
              className="w-20 px-3 py-1.5 bg-secondary/50 border border-border rounded text-sm text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            />
            <span className="text-xs text-muted-foreground">{description}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ============================================================================
// Main Component
// ============================================================================

export function SettingsPanel() {
  const {
    config,
    status,
    saveConfig,
    loadStatus,
    pruneRepository,
    checkIntegrity,
  } = useBackupStore();

  const [localConfig, setLocalConfig] = useState<BackupConfig | null>(null);
  const [hasChanges, setHasChanges] = useState(false);
  const [saving, setSaving] = useState(false);
  const [pruning, setPruning] = useState(false);
  const [checking, setChecking] = useState(false);
  const [actionResult, setActionResult] = useState<{
    type: 'success' | 'error';
    message: string;
  } | null>(null);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  useEffect(() => {
    if (config) {
      setLocalConfig(JSON.parse(JSON.stringify(config)));
    }
  }, [config]);

  const handleChange = (updates: Partial<BackupConfig>) => {
    if (!localConfig) return;
    setLocalConfig({ ...localConfig, ...updates });
    setHasChanges(true);
  };

  const handleSave = async () => {
    if (!localConfig) return;
    setSaving(true);
    setActionResult(null);
    try {
      await saveConfig(localConfig);
      setHasChanges(false);
      setActionResult({ type: 'success', message: 'Configuration saved' });
    } catch (err) {
      setActionResult({
        type: 'error',
        message: err instanceof Error ? err.message : 'Failed to save',
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePrune = async () => {
    setPruning(true);
    setActionResult(null);
    const success = await pruneRepository();
    setPruning(false);
    setActionResult({
      type: success ? 'success' : 'error',
      message: success ? 'Repository pruned successfully' : 'Prune failed',
    });
    if (success) {
      loadStatus();
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    setActionResult(null);
    const success = await checkIntegrity();
    setChecking(false);
    setActionResult({
      type: success ? 'success' : 'error',
      message: success ? 'Repository integrity verified' : 'Integrity check found issues',
    });
  };

  if (!localConfig) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <AlertCircle className="w-6 h-6 mb-2" />
        <p className="text-sm">No configuration loaded</p>
        <p className="text-xs mt-1">Complete setup from the Overview tab first.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Action Result */}
      {actionResult && (
        <div
          className={`p-4 rounded-lg border ${
            actionResult.type === 'success'
              ? 'bg-green-500/10 border-green-500/30'
              : 'bg-red-500/10 border-red-500/30'
          }`}
        >
          <div
            className={`flex items-center gap-2 ${
              actionResult.type === 'success' ? 'text-green-500' : 'text-red-500'
            }`}
          >
            {actionResult.type === 'success' ? (
              <Check className="w-5 h-5" />
            ) : (
              <AlertCircle className="w-5 h-5" />
            )}
            <span className="text-sm">{actionResult.message}</span>
          </div>
        </div>
      )}

      {/* Source Path */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <FolderOpen className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Source Directory</h3>
        </div>
        <div className="p-3 bg-secondary/50 rounded-lg">
          <p className="text-sm text-foreground truncate">
            {localConfig.backup?.source_path || 'Not configured'}
          </p>
        </div>
        <p className="text-xs text-muted-foreground">
          The root directory being backed up. Change requires re-initialization.
        </p>
      </section>

      {/* Exclusions */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Filter className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Exclusions</h3>
        </div>
        <ExclusionsEditor
          exclusions={localConfig.backup?.exclusions || []}
          onChange={(exclusions) =>
            handleChange({
              backup: { ...localConfig.backup, exclusions },
            })
          }
        />
      </section>

      {/* Retention Policy */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Clock className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Retention Policy</h3>
        </div>
        <RetentionEditor
          retention={localConfig.retention}
          onChange={(retention) => handleChange({ retention })}
        />
        <p className="text-xs text-muted-foreground">
          Controls how many snapshots to keep. Older snapshots are removed during prune.
        </p>
      </section>

      {/* Repository Info */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <HardDrive className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Repository</h3>
        </div>
        <div className="p-3 bg-secondary/50 rounded-lg space-y-2">
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Path</span>
            <span className="text-foreground truncate max-w-[60%]">
              {localConfig.repository?.path}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Status</span>
            <span
              className={
                status === null
                  ? 'text-muted-foreground'
                  : status.repository_accessible
                    ? 'text-green-500'
                    : 'text-amber-500'
              }
            >
              {status === null
                ? 'Checking...'
                : status.repository_accessible
                  ? 'Accessible'
                  : 'Inaccessible'}
            </span>
          </div>
          <div className="flex items-center justify-between text-sm">
            <span className="text-muted-foreground">Snapshots</span>
            <span className="text-foreground">{status === null ? '—' : status.snapshot_count}</span>
          </div>
        </div>
      </section>

      {/* Maintenance Actions */}
      <section className="space-y-3">
        <div className="flex items-center gap-2">
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="text-sm font-medium text-foreground">Maintenance</h3>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={handleCheck}
            disabled={checking}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {checking ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Shield className="w-4 h-4" />
            )}
            Check Integrity
          </button>
          <button
            onClick={handlePrune}
            disabled={pruning}
            className="flex items-center justify-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm transition-colors disabled:opacity-50"
          >
            {pruning ? (
              <RefreshCw className="w-4 h-4 animate-spin" />
            ) : (
              <Trash2 className="w-4 h-4" />
            )}
            Prune Repository
          </button>
        </div>
        <p className="text-xs text-muted-foreground">
          Integrity check verifies all data. Prune removes unreferenced data to reclaim space.
        </p>
      </section>

      {/* Save Button */}
      {hasChanges && (
        <button
          onClick={handleSave}
          disabled={saving}
          className="w-full flex items-center justify-center gap-2 px-6 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {saving ? (
            <>
              <RefreshCw className="w-5 h-5 animate-spin" />
              Saving...
            </>
          ) : (
            <>
              <Save className="w-5 h-5" />
              Save Changes
            </>
          )}
        </button>
      )}
    </div>
  );
}

export default SettingsPanel;
