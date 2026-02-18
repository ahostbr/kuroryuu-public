/**
 * BackupManagerPage - Main container for Restic backup management
 *
 * Features:
 * - Overview dashboard
 * - Snapshot browser (git-log style)
 * - Backup creation with message
 * - Diff view and restore
 * - Settings panel
 */

import { useEffect } from 'react';
import {
  HardDrive,
  Archive,
  Settings,
  FolderSync,
  RefreshCw,
  History,
  Shield,
  AlertCircle,
  CheckCircle2,
  Clock,
  Plus,
} from 'lucide-react';
import { ThemedFrame } from '../ui/ThemedFrame';
import { useBackupStore, type BackupView } from '../../stores/backup-store';
import { useBackupProgress } from '../../hooks/useBackupProgress';
import { SetupWizard } from './SetupWizard';
import { SnapshotBrowser } from './SnapshotBrowser';
import { BackupNowPanel } from './BackupNowPanel';
import { DiffView } from './DiffView';
import { SettingsPanel } from './SettingsPanel';

// ============================================================================
// Navigation Tabs
// ============================================================================

const TABS: { id: BackupView; label: string; icon: React.ElementType }[] = [
  { id: 'overview', label: 'Overview', icon: HardDrive },
  { id: 'snapshots', label: 'Snapshots', icon: History },
  { id: 'backup', label: 'Backup Now', icon: FolderSync },
  { id: 'restore', label: 'Restore', icon: Archive },
  { id: 'settings', label: 'Settings', icon: Settings },
];

// ============================================================================
// Overview Dashboard
// ============================================================================

function OverviewDashboard() {
  const { status, statusError, config, loadStatus, loadSnapshots, snapshots, snapshotsLoading } = useBackupStore();

  useEffect(() => {
    loadStatus();
    loadSnapshots(5);
  }, [loadStatus, loadSnapshots]);

  const formatBytes = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  return (
    <div className="space-y-6">
      {statusError && (
        <div className="flex items-center gap-3 p-4 rounded-lg border border-amber-500/30 bg-amber-500/10">
          <AlertCircle className="w-5 h-5 text-amber-500 shrink-0" />
          <div>
            <p className="text-sm font-medium text-amber-500">Status Unavailable</p>
            <p className="text-xs text-muted-foreground">{statusError}</p>
          </div>
        </div>
      )}
      {/* Status Cards */}
      <div className="grid grid-cols-3 gap-4">
        {/* Repository Status */}
        <div className="bg-card/50 border border-border rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <HardDrive className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-foreground">Repository</span>
          </div>
          <div className="space-y-1">
            {status?.repository_accessible ? (
              <>
                <div className="flex items-center gap-2 text-green-500">
                  <CheckCircle2 className="w-4 h-4" />
                  <span className="text-sm">Accessible</span>
                </div>
                <p className="text-xs text-muted-foreground truncate">
                  {config?.repository?.path || 'N/A'}
                </p>
              </>
            ) : (
              <div className="flex items-center gap-2 text-amber-500">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">Not Configured</span>
              </div>
            )}
          </div>
        </div>

        {/* Snapshot Count */}
        <div className="bg-card/50 border border-border rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <Archive className="w-5 h-5 text-purple-400" />
            <span className="text-sm font-medium text-foreground">Snapshots</span>
          </div>
          <div className="text-2xl font-bold text-foreground">
            {status?.snapshot_count ?? 0}
          </div>
          <p className="text-xs text-muted-foreground">
            Total backups stored
          </p>
        </div>

        {/* Restic Status */}
        <div className="bg-card/50 border border-border rounded-lg p-4">
          <div className="flex items-center gap-3 mb-2">
            <Shield className="w-5 h-5 text-blue-400" />
            <span className="text-sm font-medium text-foreground">Restic</span>
          </div>
          {status?.restic_installed ? (
            <>
              <div className="flex items-center gap-2 text-green-500">
                <CheckCircle2 className="w-4 h-4" />
                <span className="text-sm">Installed</span>
              </div>
              <p className="text-xs text-muted-foreground">
                v{status.restic_version}
              </p>
            </>
          ) : (
            <div className="flex items-center gap-2 text-amber-500">
              <AlertCircle className="w-4 h-4" />
              <span className="text-sm">Not Installed</span>
            </div>
          )}
        </div>
      </div>

      {/* Recent Snapshots */}
      <div className="bg-card/50 border border-border rounded-lg">
        <div className="flex items-center justify-between p-4 border-b border-border">
          <div className="flex items-center gap-2">
            <History className="w-5 h-5 text-primary" />
            <span className="text-sm font-medium text-foreground">Recent Backups</span>
          </div>
          <button
            onClick={() => loadSnapshots(5)}
            disabled={snapshotsLoading}
            className="text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${snapshotsLoading ? 'animate-spin' : ''}`} />
          </button>
        </div>
        <div className="divide-y divide-border">
          {snapshots.length === 0 ? (
            <div className="p-8 text-center text-muted-foreground">
              <Archive className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p>No backups yet</p>
              <p className="text-xs">Create your first backup to get started</p>
            </div>
          ) : (
            snapshots.slice(0, 5).map((snapshot) => (
              <div key={snapshot.id} className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded bg-primary/20 flex items-center justify-center">
                    <Archive className="w-4 h-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-medium text-foreground">
                      {snapshot.message || 'Unnamed backup'}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <Clock className="w-3 h-3" />
                      <span>{snapshot.formatted?.time_ago || snapshot.time_ago}</span>
                      <span>•</span>
                      <span className="font-mono">{snapshot.short_id}</span>
                    </div>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-sm text-foreground">
                    {snapshot.formatted?.files_summary || 'N/A'}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {snapshot.formatted?.data_added || 'N/A'}
                  </p>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid grid-cols-2 gap-4">
        <QuickActionCard
          icon={Plus}
          title="Create Backup"
          description="Back up your project now"
          onClick={() => useBackupStore.getState().setView('backup')}
          color="text-green-500"
        />
        <QuickActionCard
          icon={Shield}
          title="Check Integrity"
          description="Verify repository health"
          onClick={() => useBackupStore.getState().checkIntegrity()}
          color="text-blue-500"
        />
      </div>
    </div>
  );
}

function QuickActionCard({
  icon: Icon,
  title,
  description,
  onClick,
  color,
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  onClick: () => void;
  color: string;
}) {
  return (
    <button
      onClick={onClick}
      className="bg-card/50 border border-border rounded-lg p-4 text-left hover:border-primary/50 transition-colors group"
    >
      <Icon className={`w-6 h-6 ${color} mb-2 group-hover:scale-110 transition-transform`} />
      <h4 className="text-sm font-medium text-foreground">{title}</h4>
      <p className="text-xs text-muted-foreground">{description}</p>
    </button>
  );
}

// ============================================================================
// Main Page Component
// ============================================================================

export function BackupManagerPage() {
  const {
    config,
    isConfigured,
    isLoading,
    showSetupWizard,
    currentView,
    setView,
    loadConfig,
    loadStatus,
  } = useBackupStore();

  // Connect to WebSocket for progress updates
  useBackupProgress({ autoConnect: true });

  // Load config on mount
  useEffect(() => {
    loadConfig();
    loadStatus();
  }, [loadConfig, loadStatus]);

  // Show setup wizard if not configured
  if (showSetupWizard || !isConfigured) {
    return (
      <ThemedFrame className="h-full">
        <SetupWizard />
      </ThemedFrame>
    );
  }

  // Render content based on current view
  const renderContent = () => {
    switch (currentView) {
      case 'overview':
        return <OverviewDashboard />;
      case 'snapshots':
        return <SnapshotBrowser />;
      case 'backup':
        return <BackupNowPanel />;
      case 'restore':
        return <DiffView />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return <OverviewDashboard />;
    }
  };

  return (
    <ThemedFrame className="h-full">
      <div className="flex flex-col h-full">
        {/* Tab Navigation */}
        <div className="flex gap-1 p-2 bg-secondary/50 rounded-lg mb-4">
          {TABS.map((tab) => {
            const Icon = tab.icon;
            const isActive = currentView === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setView(tab.id)}
                className={`
                  flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all
                  ${isActive
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                  }
                `}
              >
                <Icon className="w-4 h-4" />
                {tab.label}
              </button>
            );
          })}
        </div>

        {/* Content Area */}
        <div className="flex-1 overflow-auto">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <RefreshCw className="w-8 h-8 text-primary animate-spin" />
            </div>
          ) : (
            renderContent()
          )}
        </div>
      </div>
    </ThemedFrame>
  );
}

export default BackupManagerPage;
