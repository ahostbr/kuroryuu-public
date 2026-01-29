/**
 * PRD Generation Progress Component
 *
 * Shows progress while LMStudio generates the PRD
 * Follows the pattern from Ideation's GenerationProgressScreen
 */
import { Loader2, X } from 'lucide-react';
import { usePRDStore } from '../../stores/prd-store';

interface PRDGenerationProgressProps {
  progress: number;
  onCancel: () => void;
}

export function PRDGenerationProgress({ progress, onCancel }: PRDGenerationProgressProps) {
  const { generationConfig } = usePRDStore();

  return (
    <div className="h-full flex flex-col items-center justify-center text-center p-8">
      {/* Animated Icon */}
      <div className="w-20 h-20 rounded-2xl bg-gradient-to-br from-blue-400/20 to-blue-600/20 flex items-center justify-center mb-6 animate-pulse">
        <Loader2 className="w-10 h-10 text-blue-400 animate-spin" />
      </div>

      {/* Title */}
      <h2 className="text-xl font-semibold text-foreground mb-2">
        Generating PRD...
      </h2>

      {/* Subtitle */}
      {generationConfig && (
        <p className="text-muted-foreground mb-6">
          {generationConfig.title}
        </p>
      )}

      {/* Progress Bar */}
      <div className="w-full max-w-sm mb-6">
        <div className="h-2 bg-secondary rounded-full overflow-hidden">
          <div
            className="h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
        <div className="mt-2 text-sm text-muted-foreground">
          {Math.round(progress)}% complete
        </div>
      </div>

      {/* Status Messages */}
      <div className="mb-6 text-sm text-muted-foreground">
        {progress < 20 && 'Analyzing codebase with repo_intel...'}
        {progress >= 20 && progress < 50 && 'Building prompt with context...'}
        {progress >= 50 && progress < 80 && 'Generating PRD with LMStudio...'}
        {progress >= 80 && 'Finalizing document...'}
      </div>

      {/* Cancel Button */}
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
