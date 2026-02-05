/**
 * TeamControls - Toolbar for Claude Teams actions.
 * Create Team, Cleanup Team, and Refresh buttons.
 */
import { useState } from 'react';
import { Plus, Trash2, RefreshCw } from 'lucide-react';
import { useClaudeTeamsStore } from '../../stores/claude-teams-store';
import { CreateTeamDialog } from './CreateTeamDialog';

export function TeamControls() {
  const {
    selectedTeamId,
    isLoading,
    cleanupTeam,
    refreshTeam,
    startWatching,
  } = useClaudeTeamsStore();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [isCleaningUp, setIsCleaningUp] = useState(false);

  const handleCleanup = async () => {
    if (!selectedTeamId) return;

    setIsCleaningUp(true);
    try {
      await cleanupTeam({ teamName: selectedTeamId });
    } finally {
      setIsCleaningUp(false);
    }
  };

  const handleRefresh = async () => {
    if (selectedTeamId) {
      await refreshTeam(selectedTeamId);
    } else {
      await startWatching();
    }
  };

  return (
    <>
      <div className="flex items-center gap-2">
        {/* Create Team */}
        <button
          onClick={() => setShowCreateDialog(true)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-primary text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          Create Team
        </button>

        {/* Cleanup Team */}
        {selectedTeamId && (
          <button
            onClick={handleCleanup}
            disabled={isCleaningUp}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors disabled:opacity-50"
          >
            <Trash2 className="w-3.5 h-3.5" />
            {isCleaningUp ? 'Cleaning...' : 'Cleanup'}
          </button>
        )}

        {/* Refresh */}
        <button
          onClick={handleRefresh}
          disabled={isLoading}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
        >
          <RefreshCw className={`w-3.5 h-3.5 ${isLoading ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {/* Create Team Dialog */}
      <CreateTeamDialog
        isOpen={showCreateDialog}
        onClose={() => setShowCreateDialog(false)}
      />
    </>
  );
}

export default TeamControls;
