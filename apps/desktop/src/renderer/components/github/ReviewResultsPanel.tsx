/**
 * ReviewResultsPanel - Shows AI review verdict and issues
 */

import { CheckCircle, AlertTriangle, XCircle } from 'lucide-react';
import type { PRReviewResult, ReviewVerdict } from '../../types/github-workflow';

const VERDICT_CONFIG: Record<ReviewVerdict, { icon: typeof CheckCircle; color: string; bg: string; label: string }> = {
  PASS: {
    icon: CheckCircle,
    color: 'text-green-400',
    bg: 'bg-green-500/10',
    label: 'Passed',
  },
  PASS_WITH_CHANGES: {
    icon: AlertTriangle,
    color: 'text-yellow-400',
    bg: 'bg-yellow-500/10',
    label: 'Pass with Changes',
  },
  NEEDS_WORK: {
    icon: XCircle,
    color: 'text-red-400',
    bg: 'bg-red-500/10',
    label: 'Needs Work',
  },
};

export function ReviewResultsPanel({ review }: { review: PRReviewResult }) {
  const config = VERDICT_CONFIG[review.verdict];
  const VerdictIcon = config.icon;

  return (
    <div className={`rounded-md ${config.bg} p-2 space-y-2`}>
      {/* Verdict Badge */}
      <div className="flex items-center gap-1.5">
        <VerdictIcon className={`w-4 h-4 ${config.color}`} />
        <span className={`text-xs font-medium ${config.color}`}>{config.label}</span>
      </div>

      {/* Summary */}
      <p className="text-xs text-foreground/80">{review.summary}</p>

      {/* Must Fix */}
      {review.must_fix.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-red-400 uppercase mb-1">Must Fix</h4>
          <ul className="space-y-0.5">
            {review.must_fix.map((item, i) => (
              <li key={i} className="text-xs text-foreground/70 flex items-start gap-1">
                <span className="text-red-400 mt-0.5">&bull;</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Should Fix */}
      {review.should_fix.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-yellow-400 uppercase mb-1">Should Fix</h4>
          <ul className="space-y-0.5">
            {review.should_fix.map((item, i) => (
              <li key={i} className="text-xs text-foreground/70 flex items-start gap-1">
                <span className="text-yellow-400 mt-0.5">&bull;</span>
                {item}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Issues Table */}
      {review.issues.length > 0 && (
        <div>
          <h4 className="text-[10px] font-semibold text-muted-foreground uppercase mb-1">
            Issues ({review.issues.length})
          </h4>
          <div className="space-y-1">
            {review.issues.map((issue, i) => (
              <div key={i} className="flex items-start gap-1.5 text-xs">
                <span
                  className={`shrink-0 px-1 py-0.5 rounded text-[9px] font-medium ${
                    issue.severity === 'critical'
                      ? 'bg-red-500/20 text-red-400'
                      : issue.severity === 'warning'
                        ? 'bg-yellow-500/20 text-yellow-400'
                        : 'bg-blue-500/20 text-blue-400'
                  }`}
                >
                  {issue.severity}
                </span>
                <div className="flex-1 min-w-0">
                  <p className="text-foreground/70">{issue.description}</p>
                  {issue.file && (
                    <p className="text-[10px] text-muted-foreground">{issue.file}</p>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
