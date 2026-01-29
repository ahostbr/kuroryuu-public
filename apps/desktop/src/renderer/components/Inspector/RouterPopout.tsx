/**
 * RouterPopout - Expandable panel showing endpoints for a clicked router
 */
import React from 'react';
import { X, ArrowRight, AlertCircle, Clock } from 'lucide-react';
import type { EndpointSummary } from '../../types/traffic';

interface RouterPopoutProps {
  router: string;
  endpoints: EndpointSummary[];
  onClose: () => void;
}

function formatLatency(ms: number): string {
  if (ms < 1) return '<1ms';
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

export function RouterPopout({ router, endpoints, onClose }: RouterPopoutProps) {
  const totalRequests = endpoints.reduce((sum, ep) => sum + ep.request_count, 0);
  const totalErrors = endpoints.reduce((sum, ep) => sum + ep.error_count, 0);
  const avgLatency = endpoints.length > 0
    ? endpoints.reduce((sum, ep) => sum + ep.avg_latency, 0) / endpoints.length
    : 0;

  return (
    <div className="absolute right-4 top-16 w-80 max-h-[70vh] bg-zinc-900 border border-zinc-700 rounded-lg shadow-xl overflow-hidden z-50">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 bg-zinc-800 border-b border-zinc-700">
        <div>
          <h3 className="font-semibold text-zinc-100">{router}</h3>
          <p className="text-xs text-zinc-400">{endpoints.length} endpoints</p>
        </div>
        <button
          onClick={onClose}
          className="p-1 rounded hover:bg-zinc-700 transition-colors"
        >
          <X className="w-4 h-4 text-zinc-400" />
        </button>
      </div>

      {/* Stats summary */}
      <div className="grid grid-cols-3 gap-2 px-4 py-2 bg-zinc-850 border-b border-zinc-700">
        <div className="text-center">
          <div className="text-lg font-bold text-cyan-400">{totalRequests}</div>
          <div className="text-[10px] text-zinc-500">Requests</div>
        </div>
        <div className="text-center">
          <div className={`text-lg font-bold ${totalErrors > 0 ? 'text-red-400' : 'text-emerald-400'}`}>
            {totalErrors}
          </div>
          <div className="text-[10px] text-zinc-500">Errors</div>
        </div>
        <div className="text-center">
          <div className="text-lg font-bold text-amber-400">{formatLatency(avgLatency)}</div>
          <div className="text-[10px] text-zinc-500">Avg Latency</div>
        </div>
      </div>

      {/* Endpoint list */}
      <div className="overflow-y-auto max-h-[calc(70vh-140px)]">
        {endpoints.length === 0 ? (
          <div className="p-4 text-center text-zinc-500 text-sm">
            No endpoints recorded
          </div>
        ) : (
          <ul className="divide-y divide-zinc-800">
            {endpoints
              .sort((a, b) => b.request_count - a.request_count)
              .map((ep) => (
                <li
                  key={ep.endpoint}
                  className="px-3 py-2 hover:bg-zinc-800/50 transition-colors"
                >
                  <div className="flex items-start gap-2">
                    {/* Method badge */}
                    <span
                      className={`
                        px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0
                        ${ep.methods_used?.[0] === 'GET' ? 'bg-emerald-500/20 text-emerald-400' : ''}
                        ${ep.methods_used?.[0] === 'POST' ? 'bg-blue-500/20 text-blue-400' : ''}
                        ${ep.methods_used?.[0] === 'PUT' ? 'bg-amber-500/20 text-amber-400' : ''}
                        ${ep.methods_used?.[0] === 'DELETE' ? 'bg-red-500/20 text-red-400' : ''}
                        ${!ep.methods_used?.[0] ? 'bg-zinc-500/20 text-zinc-400' : ''}
                      `}
                    >
                      {ep.methods_used?.[0] || 'GET'}
                    </span>

                    {/* Endpoint path */}
                    <div className="flex-1 min-w-0">
                      <div className="text-xs text-zinc-200 truncate font-mono">
                        {ep.endpoint.replace(router, '')}
                      </div>
                      <div className="flex items-center gap-2 mt-0.5 text-[10px] text-zinc-500">
                        <span>{ep.request_count} req</span>
                        {ep.error_count > 0 && (
                          <span className="flex items-center gap-0.5 text-red-400">
                            <AlertCircle className="w-2.5 h-2.5" />
                            {ep.error_count}
                          </span>
                        )}
                        {ep.avg_latency > 0 && (
                          <span className="flex items-center gap-0.5">
                            <Clock className="w-2.5 h-2.5" />
                            {formatLatency(ep.avg_latency)}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Arrow indicator */}
                    <ArrowRight className="w-3 h-3 text-zinc-600 shrink-0 mt-1" />
                  </div>
                </li>
              ))}
          </ul>
        )}
      </div>
    </div>
  );
}

export default RouterPopout;
