/**
 * Session Manager Flyout
 * 
 * Allows saving, loading, and managing idea sessions
 */
import { useState } from 'react';
import {
  X,
  Save,
  FolderOpen,
  Trash2,
  Download,
  FileText,
  FileJson,
  Clock,
  Lightbulb,
  Plus,
  Loader2,
  ChevronRight,
  Archive,
} from 'lucide-react';
import { useIdeationStore } from '../../stores/ideation-store';
import type { IdeaSessionSummary } from '../../types/ideation';

// ============================================================================
// Session List Item
// ============================================================================
interface SessionItemProps {
  session: IdeaSessionSummary;
  onLoad: () => void;
  onDelete: () => void;
  onExport: (format: 'markdown' | 'json') => void;
}

function SessionItem({ session, onLoad, onDelete, onExport }: SessionItemProps) {
  const [showExportMenu, setShowExportMenu] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const handleDelete = async () => {
    setIsDeleting(true);
    await onDelete();
    setIsDeleting(false);
  };

  const formatDate = (dateStr: string) => {
    try {
      const date = new Date(dateStr);
      return date.toLocaleDateString('en-US', {
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="p-3 bg-card border border-border rounded-lg hover:border-border transition-colors">
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex-1 min-w-0">
          <h4 className="text-sm font-medium text-foreground truncate">
            {session.name}
          </h4>
          {session.description && (
            <p className="text-xs text-muted-foreground truncate mt-0.5">
              {session.description}
            </p>
          )}
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={handleDelete}
            disabled={isDeleting}
            className="p-1.5 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded transition-colors"
            title="Delete session"
          >
            {isDeleting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <Trash2 className="w-3.5 h-3.5" />
            )}
          </button>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-3 text-muted-foreground">
          <span className="flex items-center gap-1">
            <Lightbulb className="w-3 h-3" />
            {session.idea_count} ideas
          </span>
          <span className="flex items-center gap-1">
            <Clock className="w-3 h-3" />
            {formatDate(session.updated_at)}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {/* Export Menu */}
          <div className="relative">
            <button
              onClick={() => setShowExportMenu(!showExportMenu)}
              className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors"
              title="Export"
            >
              <Download className="w-3.5 h-3.5" />
            </button>
            {showExportMenu && (
              <div className="absolute right-0 bottom-full mb-1 py-1 bg-secondary border border-border rounded-lg shadow-xl z-10 min-w-[140px]">
                <button
                  onClick={() => {
                    onExport('markdown');
                    setShowExportMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <FileText className="w-3.5 h-3.5" />
                  Markdown
                </button>
                <button
                  onClick={() => {
                    onExport('json');
                    setShowExportMenu(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-1.5 text-xs text-foreground hover:bg-muted transition-colors"
                >
                  <FileJson className="w-3.5 h-3.5" />
                  JSON
                </button>
              </div>
            )}
          </div>

          {/* Load Button */}
          <button
            onClick={onLoad}
            className="flex items-center gap-1 px-2 py-1 text-xs text-primary hover:text-yellow-300 hover:bg-primary/10 rounded transition-colors"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Load
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// Save Session Dialog
// ============================================================================
interface SaveDialogProps {
  onSave: (name: string, description: string) => void;
  onCancel: () => void;
  ideaCount: number;
}

function SaveDialog({ onSave, onCancel, ideaCount }: SaveDialogProps) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSave = async () => {
    if (!name.trim()) return;
    setIsSaving(true);
    await onSave(name.trim(), description.trim());
    setIsSaving(false);
  };

  return (
    <div className="p-4 bg-card border border-border rounded-xl">
      <h4 className="text-sm font-medium text-foreground mb-3">Save Session</h4>
      
      <div className="space-y-3">
        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Session Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="e.g., Security Audit Ideas"
            className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
            autoFocus
          />
        </div>

        <div>
          <label className="text-xs text-muted-foreground mb-1 block">Description (optional)</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Brief description..."
            className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50"
          />
        </div>

        <div className="text-xs text-muted-foreground">
          Saving {ideaCount} idea{ideaCount !== 1 ? 's' : ''}
        </div>

        <div className="flex items-center gap-2 pt-2">
          <button
            onClick={onCancel}
            className="flex-1 px-3 py-2 text-sm text-muted-foreground hover:text-foreground hover:bg-secondary rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleSave}
            disabled={!name.trim() || isSaving}
            className="flex-1 flex items-center justify-center gap-2 px-3 py-2 text-sm bg-primary text-background font-medium rounded-lg hover:bg-primary disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
          >
            {isSaving ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Save className="w-4 h-4" />
            )}
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

// ============================================================================
// SessionManager - Main Flyout
// ============================================================================
export function SessionManager() {
  const {
    ideas,
    sessions,
    currentSessionId,
    isLoadingSessions,
    isSessionManagerOpen,
    closeSessionManager,
    saveSession,
    loadSession,
    deleteSession,
    exportSession,
    clearSession,
  } = useIdeationStore();

  const [showSaveDialog, setShowSaveDialog] = useState(false);

  const handleSave = async (name: string, description: string) => {
    const sessionId = await saveSession(name, description);
    if (sessionId) {
      setShowSaveDialog(false);
    }
  };

  const handleExport = async (sessionId: string, format: 'markdown' | 'json') => {
    const content = await exportSession(sessionId, format);
    if (content) {
      // Copy to clipboard or download
      if (format === 'json') {
        navigator.clipboard.writeText(JSON.stringify(content, null, 2));
      } else {
        navigator.clipboard.writeText(content);
      }
      // TODO: Show toast notification
    }
  };

  if (!isSessionManagerOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={closeSessionManager}
      />
      
      {/* Flyout Panel */}
      <div className="relative w-96 max-w-full h-full bg-background border-l border-border flex flex-col shadow-2xl animate-in slide-in-from-right duration-200">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Archive className="w-5 h-5 text-primary" />
            <h2 className="font-semibold text-foreground">Session Manager</h2>
          </div>
          <button
            onClick={closeSessionManager}
            className="p-1.5 text-muted-foreground hover:text-foreground hover:bg-secondary rounded transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Current Session Actions */}
        <div className="px-4 py-3 border-b border-border space-y-2">
          {ideas.length > 0 ? (
            <>
              {showSaveDialog ? (
                <SaveDialog
                  onSave={handleSave}
                  onCancel={() => setShowSaveDialog(false)}
                  ideaCount={ideas.length}
                />
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setShowSaveDialog(true)}
                    className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-primary text-background font-medium rounded-lg hover:bg-primary transition-colors text-sm"
                  >
                    <Save className="w-4 h-4" />
                    Save Current ({ideas.length})
                  </button>
                  <button
                    onClick={clearSession}
                    className="px-3 py-2 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors text-sm"
                    title="Clear all ideas"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              )}
              {currentSessionId && (
                <div className="text-xs text-muted-foreground text-center">
                  Session: {currentSessionId.slice(0, 20)}...
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-4">
              <div className="w-12 h-12 rounded-xl bg-card flex items-center justify-center mx-auto mb-2">
                <Plus className="w-6 h-6 text-muted-foreground" />
              </div>
              <p className="text-sm text-muted-foreground">No ideas to save</p>
              <p className="text-xs text-muted-foreground mt-1">Generate ideas first</p>
            </div>
          )}
        </div>

        {/* Saved Sessions List */}
        <div className="flex-1 overflow-y-auto p-4">
          <div className="flex items-center justify-between mb-3">
            <h3 className="text-sm font-medium text-muted-foreground">Saved Sessions</h3>
            <span className="text-xs text-muted-foreground">{sessions.length} total</span>
          </div>

          {isLoadingSessions ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="w-6 h-6 text-muted-foreground animate-spin" />
            </div>
          ) : sessions.length > 0 ? (
            <div className="space-y-2">
              {sessions.map(session => (
                <SessionItem
                  key={session.id}
                  session={session}
                  onLoad={() => loadSession(session.id)}
                  onDelete={() => deleteSession(session.id)}
                  onExport={(format) => handleExport(session.id, format)}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-8">
              <FolderOpen className="w-10 h-10 text-muted mx-auto mb-3" />
              <p className="text-sm text-muted-foreground">No saved sessions</p>
              <p className="text-xs text-muted-foreground mt-1">
                Save your ideas to access them later
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
