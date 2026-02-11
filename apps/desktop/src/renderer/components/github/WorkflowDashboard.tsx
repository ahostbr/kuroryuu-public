/**
 * WorkflowDashboard - Summary view of GitHub workflow state
 */

import { useState, useEffect } from 'react';
import {
  GitPullRequest,
  GitMerge,
  RefreshCw,
  Loader2,
} from 'lucide-react';
import { usePRStore } from '../../stores/pr-store';
import { PRDetailPanel } from './PRDetailPanel';

interface WorkflowDashboardProps {
  token?: string;
}

export function WorkflowDashboard({ token }: WorkflowDashboardProps) {
  const { prs, reviews, loading, error, fetchPRs, triggerReview, mergePR } = usePRStore();
  const [selectedPR, setSelectedPR] = useState<number | null>(null);

  useEffect(() => {
    if (token) {
      fetchPRs(token);
    }
  }, [token]);

  const prList = Object.values(prs);
  const openPRs = prList.filter((pr) => pr.state === 'open');
  const mergedPRs = prList.filter((pr) => pr.merged);

  const handleRefresh = () => {
    if (token) fetchPRs(token);
  };

  if (!token) {
    return (
      <div className="p-4 text-center text-muted-foreground text-sm">
        Connect GitHub in Settings to use the workflow dashboard.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Stats Row */}
      <div className="flex items-center gap-4">
        <div className="flex items-center gap-1.5 text-xs">
          <GitPullRequest className="w-3.5 h-3.5 text-green-400" />
          <span className="text-foreground">{openPRs.length}</span>
          <span className="text-muted-foreground">open</span>
        </div>
        <div className="flex items-center gap-1.5 text-xs">
          <GitMerge className="w-3.5 h-3.5 text-purple-400" />
          <span className="text-foreground">{mergedPRs.length}</span>
          <span className="text-muted-foreground">merged</span>
        </div>
        <div className="flex-1" />
        <button
          onClick={handleRefresh}
          disabled={loading}
          className="p-1 text-muted-foreground hover:text-foreground transition-colors"
        >
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <RefreshCw className="w-3.5 h-3.5" />}
        </button>
      </div>

      {error && (
        <p className="text-xs text-red-400">{error}</p>
      )}

      {/* PR List */}
      {prList.length === 0 && !loading && (
        <p className="text-xs text-muted-foreground text-center py-4">
          No pull requests found.
        </p>
      )}

      <div className="space-y-2">
        {openPRs.map((pr) => (
          <PRDetailPanel
            key={pr.number}
            pr={pr}
            review={reviews[pr.number]}
            onMerge={async () => {
              if (token) {
                const ok = await mergePR(pr.number, token);
                if (ok) fetchPRs(token);
              }
            }}
            onTriggerReview={async () => {
              if (token) await triggerReview(pr.number, token);
            }}
            mergeBlocked={reviews[pr.number]?.verdict === 'NEEDS_WORK'}
          />
        ))}
      </div>
    </div>
  );
}
