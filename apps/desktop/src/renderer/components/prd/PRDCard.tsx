/**
 * PRD Card Component
 *
 * Individual PRD card in grid with blue theme
 * Follows the pattern from IdeaCard.tsx
 */
import { FileText, X, CheckCircle, Clock, Eye } from 'lucide-react';
import type { PRD, PRDScope, PRDStatus } from '../../types/prd';

interface PRDCardProps {
  prd: PRD;
  isSelected: boolean;
  onClick: () => void;
  onDismiss: () => void;
}

// Scope configuration
const SCOPE_CONFIG: Record<PRDScope, { label: string; color: string }> = {
  task: { label: 'Task', color: 'bg-blue-500/10 text-blue-300 border-blue-500/20' },
  feature: { label: 'Feature', color: 'bg-blue-500/10 text-blue-400 border-blue-500/30' },
  epic: { label: 'Epic', color: 'bg-blue-600/20 text-blue-300 border-blue-600/40' },
};

// Status configuration
const STATUS_CONFIG: Record<PRDStatus, { label: string; color: string; icon: typeof Clock }> = {
  draft: { label: 'Draft', color: 'bg-gray-500/10 text-gray-400', icon: FileText },
  in_review: { label: 'In Review', color: 'bg-yellow-500/10 text-yellow-400', icon: Eye },
  approved: { label: 'Approved', color: 'bg-green-500/10 text-green-400', icon: CheckCircle },
  in_progress: { label: 'In Progress', color: 'bg-blue-500/10 text-blue-400', icon: Clock },
  complete: { label: 'Complete', color: 'bg-green-500/10 text-green-400', icon: CheckCircle },
};

export function PRDCard({ prd, isSelected, onClick, onDismiss }: PRDCardProps) {
  const scopeConfig = SCOPE_CONFIG[prd.scope];
  const statusConfig = STATUS_CONFIG[prd.status];
  const StatusIcon = statusConfig.icon;

  // Extract brief description from content (first few lines of Overview if available)
  const getDescription = (content: string): string => {
    const overviewMatch = content.match(/##\s+Overview\s*\n([\s\S]*?)(?=\n##|$)/);
    if (overviewMatch) {
      const text = overviewMatch[1].trim();
      // Get first paragraph
      const firstPara = text.split('\n\n')[0];
      return firstPara.replace(/[*#_]/g, '').substring(0, 200);
    }
    return 'No description available';
  };

  return (
    <div
      onClick={onClick}
      className={`p-4 rounded-xl border cursor-pointer transition-all ${
        isSelected
          ? 'bg-blue-500/5 border-blue-500/50 ring-1 ring-blue-500/20'
          : 'bg-card border-border hover:border-blue-500/30 hover:bg-blue-500/5'
      }`}
    >
      {/* Header */}
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className={`flex items-center gap-1.5 px-2 py-1 rounded-md text-xs border ${scopeConfig.color}`}>
          <FileText className="w-3 h-3" />
          {scopeConfig.label}
        </div>
        <button
          onClick={(e) => {
            e.stopPropagation();
            onDismiss();
          }}
          className="p-1 text-muted-foreground hover:text-red-400 transition-colors"
          title="Archive PRD"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Title */}
      <h3 className="text-sm font-medium text-foreground mb-2 line-clamp-2">
        {prd.title}
      </h3>

      {/* Description Preview */}
      <p className="text-xs text-muted-foreground line-clamp-3 mb-3">
        {getDescription(prd.content)}
      </p>

      {/* Footer */}
      <div className="flex items-center justify-between">
        <div className={`flex items-center gap-1.5 text-xs px-1.5 py-0.5 rounded ${statusConfig.color}`}>
          <StatusIcon className="w-3 h-3" />
          {statusConfig.label}
        </div>

        {/* Created date */}
        <span className="text-xs text-muted-foreground">
          {new Date(prd.created_at).toLocaleDateString()}
        </span>
      </div>
    </div>
  );
}
