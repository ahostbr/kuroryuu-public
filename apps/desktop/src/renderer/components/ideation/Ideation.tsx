/**
 * Ideation Screen
 * 
 * AI-powered idea generation with:
 * - Empty state with config
 * - Generation progress screen
 * - Idea cards grid with type badges
 * - Type filters
 * - Idea detail panel
 * - Convert to task action
 * - Session management (save/load)
 * - Formula workflows (TOML-based reusable workflows)
 */
import { useState } from 'react';
import {
  Lightbulb,
  Shield,
  Zap,
  FileText,
  TestTube,
  Trash2,
  CheckCircle,
  ArrowRight,
  Settings,
  RefreshCw,
  Loader2,
  X,
  Plus,
  Filter,
  Archive,
} from 'lucide-react';
import { useIdeationStore } from '../../stores/ideation-store';
import type { Idea, IdeaType } from '../../types/ideation';
import { IDEA_TYPE_COLORS, IDEA_TYPE_CONFIG } from '../../types/ideation';
import { SessionManager } from './SessionManager';
import { toast } from '../ui/toast';

// ============================================================================
// Icon helper
// ============================================================================
const IdeaTypeIcon = ({ type, className }: { type: IdeaType; className?: string }) => {
  const icons = {
    improvement: Lightbulb,
    vulnerability: Shield,
    performance: Zap,
    documentation: FileText,
    testing: TestTube,
  };
  const Icon = icons[type];
  return <Icon className={className} />;
};

// ============================================================================
// IdeationEmptyState - Config panel + Generate button
// ============================================================================
function IdeationEmptyState({ onGenerate }: { onGenerate: () => void }) {
  const { config, setConfig } = useIdeationStore();
  const [showConfig, setShowConfig] = useState(false);

  const toggleType = (type: IdeaType) => {
    const types = config.types.includes(type)
      ? config.types.filter(t => t !== type)
      : [...config.types, type];
    setConfig({ types });
  };

  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8">
      <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-yellow-400/20 to-orange-500/20 flex items-center justify-center mb-8">
        <Lightbulb className="w-12 h-12 text-primary" />
      </div>
      
      <h2 className="text-2xl font-semibold text-foreground mb-3">
        Generate Ideas
      </h2>
      <p className="text-muted-foreground max-w-md mb-8">
        Let AI analyze your codebase and suggest improvements, identify potential
        vulnerabilities, performance optimizations, and more.
      </p>

      {/* Config Panel */}
      {showConfig && (
        <div className="w-full max-w-md mb-6 p-4 bg-card border border-border rounded-xl text-left">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-medium text-foreground">Configuration</h3>
            <button
              onClick={() => setShowConfig(false)}
              className="p-1 text-muted-foreground hover:text-foreground"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          
          <div className="space-y-4">
            {/* Idea Types */}
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Idea Types</label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(IDEA_TYPE_CONFIG) as IdeaType[]).map(type => (
                  <button
                    key={type}
                    onClick={() => toggleType(type)}
                    className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm border transition-colors ${
                      config.types.includes(type)
                        ? IDEA_TYPE_COLORS[type]
                        : 'bg-secondary text-muted-foreground border-border'
                    }`}
                  >
                    <IdeaTypeIcon type={type} className="w-3.5 h-3.5" />
                    {IDEA_TYPE_CONFIG[type].label}
                  </button>
                ))}
              </div>
            </div>

            {/* Max Ideas */}
            <div>
              <label className="text-sm text-muted-foreground mb-2 block">Max Ideas: {config.maxIdeas}</label>
              <input
                type="range"
                min={5}
                max={50}
                value={config.maxIdeas}
                onChange={(e) => setConfig({ maxIdeas: Number(e.target.value) })}
                className="w-full accent-yellow-500"
              />
            </div>

            {/* Include Files */}
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={config.includeFiles}
                onChange={(e) => setConfig({ includeFiles: e.target.checked })}
                className="rounded border-border bg-secondary text-primary focus:ring-primary"
              />
              <span className="text-sm text-foreground">Include file references</span>
            </label>
          </div>
        </div>
      )}

      <div className="flex items-center gap-3">
        <button
          onClick={() => setShowConfig(!showConfig)}
          className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-foreground hover:bg-muted transition-colors"
        >
          <Settings className="w-4 h-4" />
          Configure
        </button>
        <button
          onClick={onGenerate}
          disabled={config.types.length === 0}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-background font-medium hover:bg-primary disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
        >
          <Lightbulb className="w-4 h-4" />
          Generate Ideas
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// GenerationProgressScreen - Streaming generation with progress
// ============================================================================
function GenerationProgressScreen({ onCancel }: { onCancel: () => void }) {
  const { generationProgress, ideas } = useIdeationStore();

  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8">
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-yellow-400/20 to-orange-500/20 flex items-center justify-center mb-6 animate-pulse">
        <Loader2 className="w-10 h-10 text-primary animate-spin" />
      </div>
      
      <h2 className="text-xl font-semibold text-foreground mb-2">
        Analyzing Codebase...
      </h2>
      <p className="text-muted-foreground mb-6">
        Found {ideas.length} ideas so far
      </p>

      {/* Progress Bar */}
      <div className="w-full max-w-sm mb-6">
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-yellow-500 to-orange-500 transition-all duration-300"
            style={{ width: `${generationProgress}%` }}
          />
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {Math.round(generationProgress)}% complete
        </div>
      </div>

      <button
        onClick={onCancel}
        className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
      >
        <X className="w-4 h-4" />
        Cancel
      </button>
    </div>
  );
}

// ============================================================================
// IdeaCard - Individual idea card in grid
// ============================================================================
interface IdeaCardProps {
  idea: Idea;
  isSelected: boolean;
  onClick: () => void;
  onDismiss: () => void;
}

function IdeaCard({ idea, isSelected, onClick, onDismiss }: IdeaCardProps) {
  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl border cursor-pointer transition-all ${
        isSelected
          ? 'bg-secondary border-primary/50 ring-1 ring-primary/20'
          : 'bg-card border-border hover:border-border hover:bg-secondary/50'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border ${IDEA_TYPE_COLORS[idea.type]}`}>
          <IdeaTypeIcon type={idea.type} className="w-3 h-3" />
          {IDEA_TYPE_CONFIG[idea.type].label}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-foreground mb-2 line-clamp-2">
        {idea.title}
      </h3>

      {/* Description */}
      <p className="text-xs text-muted-foreground line-clamp-3 mb-3">
        {idea.description}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {idea.impact && (
            <span className={`text-xs px-1.5 py-0.5 rounded ${
              idea.impact === 'high' ? 'bg-red-500/10 text-red-400' :
              idea.impact === 'medium' ? 'bg-primary/10 text-primary' :
              'bg-muted text-muted-foreground'
            }`}>
              {idea.impact} impact
            </span>
          )}
        </div>
        {idea.status === 'converted' && (
          <span className="flex items-center gap-1 text-xs text-green-400">
            <CheckCircle className="w-3 h-3" />
            Task {idea.taskId}
          </span>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// IdeaDetailPanel - Full idea details + actions
// ============================================================================
interface IdeaDetailPanelProps {
  idea: Idea;
  onClose: () => void;
  onConvertToTask: () => void;
  onDismiss: () => void;
  onGoToTask?: () => void;
}

function IdeaDetailPanel({ idea, onClose, onConvertToTask, onDismiss, onGoToTask }: IdeaDetailPanelProps) {
  return (
    <div className="w-96 h-full flex flex-col bg-card border-l border-border">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border ${IDEA_TYPE_COLORS[idea.type]}`}>
          <IdeaTypeIcon type={idea.type} className="w-3 h-3" />
          {IDEA_TYPE_CONFIG[idea.type].label}
        </div>
        <button onClick={onClose} className="p-1 text-muted-foreground hover:text-foreground">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        <h2 className="text-lg font-semibold text-foreground">{idea.title}</h2>
        
        <p className="text-sm text-muted-foreground">{idea.description}</p>

        {idea.rationale && (
          <div>
            <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-1">Rationale</h4>
            <p className="text-sm text-foreground">{idea.rationale}</p>
          </div>
        )}

        {/* Impact & Effort */}
        <div className="grid grid-cols-2 gap-3">
          {idea.impact && (
            <div className="p-3 bg-secondary rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Impact</div>
              <div className={`text-sm font-medium ${
                idea.impact === 'high' ? 'text-red-400' :
                idea.impact === 'medium' ? 'text-primary' :
                'text-muted-foreground'
              }`}>
                {idea.impact.charAt(0).toUpperCase() + idea.impact.slice(1)}
              </div>
            </div>
          )}
          {idea.effort && (
            <div className="p-3 bg-secondary rounded-lg">
              <div className="text-xs text-muted-foreground mb-1">Effort</div>
              <div className="text-sm font-medium text-foreground">
                {idea.effort.charAt(0).toUpperCase() + idea.effort.slice(1)}
              </div>
            </div>
          )}
        </div>

        {/* Related Files */}
        {idea.files && idea.files.length > 0 && (
          <div>
            <h4 className="text-xs text-muted-foreground uppercase tracking-wide mb-2">Related Files</h4>
            <div className="space-y-1">
              {idea.files.map(file => (
                <div key={file} className="flex items-center gap-2 px-2 py-1.5 bg-secondary rounded text-xs text-muted-foreground">
                  <FileText className="w-3 h-3" />
                  {file}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Actions */}
      <div className="p-4 border-t border-border space-y-2">
        {idea.status === 'converted' && idea.taskId ? (
          <button
            onClick={onGoToTask}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-green-500/10 text-green-400 border border-green-500/30 hover:bg-green-500/20 transition-colors"
          >
            <ArrowRight className="w-4 h-4" />
            Go to Task {idea.taskId}
          </button>
        ) : (
          <button
            onClick={onConvertToTask}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-background font-medium hover:bg-primary transition-colors"
          >
            <Plus className="w-4 h-4" />
            Convert to Task
          </button>
        )}
        <button
          onClick={onDismiss}
          className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-secondary text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors"
        >
          <Trash2 className="w-4 h-4" />
          Dismiss
        </button>
      </div>
    </div>
  );
}

// ============================================================================
// Ideation - Main Component (Ideas only - Formulas tab is in parent Dojo)
// ============================================================================
export function Ideation() {
  const {
    ideas,
    isGenerating,
    filter,
    selectedIdeaId,
    setFilter,
    selectIdea,
    dismissIdea,
    dismissAll,
    convertToTask,
    startGeneration,
    cancelGeneration,
    getFilteredIdeas,
    getSelectedIdea,
    getIdeaCountByType,
    openSessionManager,
  } = useIdeationStore();

  const filteredIdeas = getFilteredIdeas();
  const selectedIdea = getSelectedIdea();
  const counts = getIdeaCountByType();

  const handleConvertToTask = async (ideaId: string) => {
    try {
      const taskId = await convertToTask(ideaId);
      if (taskId) {
        toast.success(`Created task ${taskId} from idea`);
      }
    } catch (error) {
      toast.error(`Failed to create task: ${String(error)}`);
    }
  };

  // Generating state - show progress
  if (isGenerating) {
    return <GenerationProgressScreen onCancel={cancelGeneration} />;
  }

  // Empty state - no ideas yet
  if (ideas.length === 0) {
    return (
      <div className="h-full flex flex-col bg-background">
        <IdeationEmptyState onGenerate={startGeneration} />
      </div>
    );
  }

  // Ideas view with ideas
  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header with actions */}
      <div className="flex items-center justify-between px-6 py-3 border-b border-border bg-card/50">
        <div className="flex items-center gap-2">
          <Lightbulb className="w-5 h-5 text-primary" />
          <span className="font-medium text-foreground">Ideas</span>
          <span className="px-2 py-0.5 rounded-full bg-secondary text-muted-foreground text-xs">
            {counts.all}
          </span>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={openSessionManager}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-foreground hover:bg-muted transition-colors text-sm"
            title="Manage saved sessions"
          >
            <Archive className="w-4 h-4" />
            Sessions
          </button>
          <button
            onClick={startGeneration}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-secondary text-foreground hover:bg-muted transition-colors text-sm"
          >
            <RefreshCw className="w-4 h-4" />
            Add More
          </button>
          <button
            onClick={dismissAll}
            className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-muted-foreground hover:text-red-400 hover:bg-red-500/10 transition-colors text-sm"
          >
            <Trash2 className="w-4 h-4" />
            Dismiss All
          </button>
        </div>
      </div>
      
      {/* Main Content Area */}
      <div className="flex-1 flex overflow-hidden">
        {/* Ideas Grid */}
        <div className="flex-1 flex flex-col h-full">
          {/* Type Filters */}
          <div className="px-6 py-3 border-b border-border">
            <div className="flex items-center gap-1 p-1 bg-card rounded-lg w-fit">
              <button
                onClick={() => setFilter('all')}
                className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                  filter === 'all'
                    ? 'bg-secondary text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All ({counts.all})
              </button>
              {(Object.keys(IDEA_TYPE_CONFIG) as IdeaType[]).map(type => (
                <button
                  key={type}
                  onClick={() => setFilter(type)}
                  className={`px-3 py-1.5 rounded-md text-sm transition-colors ${
                    filter === type
                      ? 'bg-secondary text-foreground'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  {counts[type]}
                </button>
              ))}
            </div>
          </div>

          {/* Ideas Grid */}
          <div className="flex-1 overflow-y-auto p-6">
            {filteredIdeas.length > 0 ? (
              <div className="grid grid-cols-2 xl:grid-cols-3 gap-4">
                {filteredIdeas.map(idea => (
                  <IdeaCard
                    key={idea.id}
                    idea={idea}
                    isSelected={idea.id === selectedIdeaId}
                    onClick={() => selectIdea(idea.id)}
                    onDismiss={() => dismissIdea(idea.id)}
                  />
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-center">
                <Filter className="w-12 h-12 text-muted mb-4" />
                <p className="text-muted-foreground">No ideas match the current filter</p>
                <button
                  onClick={() => setFilter('all')}
                  className="mt-2 text-sm text-primary hover:text-primary"
                >
                  Show all ideas
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Detail Panel */}
        {selectedIdea && (
          <IdeaDetailPanel
            idea={selectedIdea}
            onClose={() => selectIdea(null)}
            onConvertToTask={() => handleConvertToTask(selectedIdea.id)}
            onDismiss={() => dismissIdea(selectedIdea.id)}
          />
        )}
      </div>

      {/* Session Manager Flyout */}
      <SessionManager />
    </div>
  );
}
