/**
 * PRDetailPanel - Shows PR info, review results, and merge action
 */

import { useState } from 'react';
import {
  GitPullRequest,
  GitMerge,
  ExternalLink,
  Loader2,
  AlertCircle,
  XCircle,
} from 'lucide-react';
import type { PRInfo, PRReviewResult } from '../../types/github-workflow';
import { ReviewResultsPanel } from './ReviewResultsPanel';

interface PRDetailPanelProps {
  pr: PRInfo;
  review?: PRReviewResult;
  onMerge?: () => Promise<void>;
  onTriggerReview?: () => Promise<void>;
  mergeBlocked?: boolean;
}

export function PRDetailPanel({ pr, review, onMerge, onTriggerReview, mergeBlocked }: PRDetailPanelProps) {
  const [merging, setMerging] = useState(false);
  const [reviewing, setReviewing] = useState(false);

  const handleMerge = async () => {
    if (!onMerge) return;
    setMerging(true);
    try {
      await onMerge();
    } finally {
      setMerging(false);
    }
  };

  const handleReview = async () => {
    if (!onTriggerReview) return;
    setReviewing(true);
    try {
      await onTriggerReview();
    } finally {
      setReviewing(false);
    }
  };

  const stateIcon = pr.merged ? (
    <GitMerge className="w-4 h-4 text-purple-400" />
  ) : pr.state === 'open' ? (
    <GitPullRequest className="w-4 h-4 text-green-400" />
  ) : (
    <GitPullRequest className="w-4 h-4 text-red-400" />
  );

  return (
    <div className="bg-card/30 rounded-lg border border-border/50 p-3 space-y-3">
      {/* PR Header */}
      <div className="flex items-center gap-2">
        {stateIcon}
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground truncate">
            #{pr.number} {pr.title}
          </h3>
          <p className="text-[10px] text-muted-foreground">
            {pr.head} &rarr; {pr.base}
          </p>
        </div>
        <a
          href={pr.url}
          target="_blank"
          rel="noopener noreferrer"
          className="p-1 text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
      </div>

      {/* PR Body */}
      {pr.body && (
        <p className="text-xs text-muted-foreground line-clamp-3">{pr.body}</p>
      )}

      {/* Review Results */}
      {review && <ReviewResultsPanel review={review} />}

      {/* Actions */}
      <div className="flex items-center gap-2 pt-1 border-t border-border/30">
        {!review && onTriggerReview && (
          <button
            onClick={handleReview}
            disabled={reviewing}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-blue-500/20 text-blue-400 rounded text-xs hover:bg-blue-500/30 transition-colors disabled:opacity-50"
          >
            {reviewing ? <Loader2 className="w-3 h-3 animate-spin" /> : <AlertCircle className="w-3 h-3" />}
            Run AI Review
          </button>
        )}

        {pr.state === 'open' && !pr.merged && onMerge && (
          <button
            onClick={handleMerge}
            disabled={merging || mergeBlocked}
            className="flex items-center gap-1.5 px-2.5 py-1 bg-purple-500/20 text-purple-400 rounded text-xs hover:bg-purple-500/30 transition-colors disabled:opacity-50"
            title={mergeBlocked ? 'Review required before merge' : undefined}
          >
            {merging ? <Loader2 className="w-3 h-3 animate-spin" /> : <GitMerge className="w-3 h-3" />}
            Merge
          </button>
        )}

        {mergeBlocked && (
          <span className="text-[10px] text-red-400 flex items-center gap-1">
            <XCircle className="w-2.5 h-2.5" /> Review required
          </span>
        )}
      </div>
    </div>
  );
}
