/**
 * PRD Empty State Component
 *
 * First-time experience with "Generate PRD" button
 * Follows the pattern from Ideation's empty state
 */
import { FileText, Plus } from 'lucide-react';

interface PRDEmptyStateProps {
  onGenerate: () => void;
}

export function PRDEmptyState({ onGenerate }: PRDEmptyStateProps) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8">
      <div className="w-24 h-24 rounded-3xl bg-gradient-to-br from-blue-400/20 to-blue-600/20 flex items-center justify-center mb-8">
        <FileText className="w-12 h-12 text-blue-400" />
      </div>

      <h2 className="text-2xl font-semibold text-foreground mb-3">
        Generate Product Requirements
      </h2>
      <p className="text-muted-foreground max-w-md mb-8">
        Let AI analyze your codebase and create comprehensive PRDs with technical
        specifications, user stories, and implementation plans based on actual code patterns.
      </p>

      <button
        onClick={onGenerate}
        className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-blue-500 text-white font-medium hover:bg-blue-600 transition-colors"
      >
        <Plus className="w-4 h-4" />
        New PRD
      </button>

      {/* Info Cards */}
      <div className="mt-12 grid grid-cols-1 md:grid-cols-3 gap-4 max-w-3xl">
        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="text-blue-400 mb-2">📊 Context-Aware</div>
          <p className="text-xs text-muted-foreground">
            References actual components, endpoints, and TODOs from your codebase
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="text-blue-400 mb-2">🎯 Structured</div>
          <p className="text-xs text-muted-foreground">
            8-section PRDs with overview, requirements, technical specs, and acceptance criteria
          </p>
        </div>
        <div className="p-4 bg-card border border-border rounded-lg">
          <div className="text-blue-400 mb-2">⚡ Formula Ready</div>
          <p className="text-xs text-muted-foreground">
            Execute PRDs with the PRD-First formula to generate tasks automatically
          </p>
        </div>
      </div>
    </div>
  );
}
