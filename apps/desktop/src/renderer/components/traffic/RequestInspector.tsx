/**
 * RequestInspector - Full request/response inspection modal
 * Shows headers, body, timing for a specific traffic event
 */
import React, { useState, useMemo } from 'react';
import { X, Copy, ChevronDown, ChevronRight, Terminal, Clock, FileJson } from 'lucide-react';
import { useTrafficStore } from '../../stores/traffic-store';

type TabId = 'request' | 'response' | 'timing' | 'raw';

interface HeaderSectionProps {
  title: string;
  headers: Record<string, string>;
  defaultOpen?: boolean;
}

function HeaderSection({ title, headers, defaultOpen = true }: HeaderSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);
  const headerEntries = Object.entries(headers);

  if (headerEntries.length === 0) {
    return null;
  }

  return (
    <div className="header-section mb-4">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-2 text-sm font-medium mb-2 opacity-80 hover:opacity-100"
      >
        {isOpen ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        {title} ({headerEntries.length})
      </button>
      {isOpen && (
        <div className="headers-list bg-black/30 rounded-lg p-3 font-mono text-xs space-y-1 overflow-x-auto">
          {headerEntries.map(([key, value]) => (
            <div key={key} className="flex">
              <span className="header-key text-cyan-400 min-w-[180px]">{key}:</span>
              <span className="header-value opacity-80 break-all">{value}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

interface BodyViewerProps {
  body?: string;
  contentType?: string;
  truncated?: boolean;
}

function BodyViewer({ body, contentType, truncated }: BodyViewerProps) {
  const [isFormatted, setIsFormatted] = useState(true);

  const formattedBody = useMemo(() => {
    if (!body) return null;

    // Try to parse and format JSON
    if (contentType?.includes('json') && isFormatted) {
      try {
        const parsed = JSON.parse(body);
        return JSON.stringify(parsed, null, 2);
      } catch {
        return body;
      }
    }
    return body;
  }, [body, contentType, isFormatted]);

  if (!body) {
    return <div className="text-sm opacity-40 py-4 text-center">No body content</div>;
  }

  const copyBody = () => {
    navigator.clipboard.writeText(body);
  };

  return (
    <div className="body-viewer">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs opacity-60">BODY</span>
        <div className="flex items-center gap-2">
          {contentType?.includes('json') && (
            <button
              onClick={() => setIsFormatted(!isFormatted)}
              className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors"
            >
              {isFormatted ? 'Raw' : 'Format'}
            </button>
          )}
          <button
            onClick={copyBody}
            className="text-xs px-2 py-1 rounded bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1"
          >
            <Copy size={12} />
            Copy
          </button>
        </div>
      </div>
      <pre className="body-content bg-black/30 rounded-lg p-3 font-mono text-xs overflow-auto max-h-[400px] whitespace-pre-wrap">
        {formattedBody}
      </pre>
      {truncated && (
        <div className="text-xs text-orange-400 mt-2">Body was truncated (10KB limit)</div>
      )}
    </div>
  );
}

export function RequestInspector() {
  const selectedEvent = useTrafficStore((s) => s.selectedEvent);
  const closeInspector = useTrafficStore((s) => s.closeInspector);
  const [activeTab, setActiveTab] = useState<TabId>('request');

  if (!selectedEvent) {
    return (
      <div className="inspector-modal fixed inset-0 z-50 flex items-center justify-center bg-black/80">
        <div className="inspector-content w-[90vw] max-w-4xl h-[80vh] rounded-xl flex items-center justify-center">
          <div className="loading-spinner w-8 h-8 border-2 border-t-transparent rounded-full animate-spin" />
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string; icon: React.ReactNode }[] = [
    { id: 'request', label: 'Request', icon: <Terminal size={14} /> },
    { id: 'response', label: 'Response', icon: <FileJson size={14} /> },
    { id: 'timing', label: 'Timing', icon: <Clock size={14} /> },
    { id: 'raw', label: 'Raw', icon: <Copy size={14} /> },
  ];

  // Format timestamp
  const formatTime = (timestamp: string) => {
    const date = new Date(timestamp);
    return date.toLocaleString();
  };

  // Get status badge class
  const getStatusClass = () => {
    const status = selectedEvent.status || 0;
    if (status >= 500) return 'bg-red-500/20 text-red-400 border-red-500/50';
    if (status >= 400) return 'bg-orange-500/20 text-orange-400 border-orange-500/50';
    if (status >= 300) return 'bg-cyan-500/20 text-cyan-400 border-cyan-500/50';
    return 'bg-green-500/20 text-green-400 border-green-500/50';
  };

  // Generate cURL command
  const generateCurl = () => {
    const method = selectedEvent.method || 'GET';
    const url = `http://localhost:8200${selectedEvent.endpoint}`;
    let curl = `curl -X ${method} '${url}'`;

    if (selectedEvent.request_headers) {
      Object.entries(selectedEvent.request_headers).forEach(([key, value]) => {
        if (!key.toLowerCase().startsWith('host')) {
          curl += ` \\\n  -H '${key}: ${value}'`;
        }
      });
    }

    if (selectedEvent.request_body) {
      curl += ` \\\n  -d '${selectedEvent.request_body.replace(/'/g, "\\'")}'`;
    }

    return curl;
  };

  // Copy cURL to clipboard
  const copyCurl = () => {
    navigator.clipboard.writeText(generateCurl());
  };

  // Generate raw HTTP text
  const generateRaw = () => {
    let raw = '';

    // Request
    raw += `=== REQUEST ===\n`;
    raw += `${selectedEvent.method} ${selectedEvent.endpoint} HTTP/1.1\n`;
    if (selectedEvent.request_headers) {
      Object.entries(selectedEvent.request_headers).forEach(([key, value]) => {
        raw += `${key}: ${value}\n`;
      });
    }
    raw += '\n';
    if (selectedEvent.request_body) {
      raw += selectedEvent.request_body + '\n';
    }

    raw += '\n=== RESPONSE ===\n';
    raw += `HTTP/1.1 ${selectedEvent.status}\n`;
    if (selectedEvent.response_headers) {
      Object.entries(selectedEvent.response_headers).forEach(([key, value]) => {
        raw += `${key}: ${value}\n`;
      });
    }
    raw += '\n';
    if (selectedEvent.response_body) {
      raw += selectedEvent.response_body;
    }

    return raw;
  };

  return (
    <div
      className="inspector-modal fixed inset-0 z-50 flex items-center justify-center bg-black/80"
      onClick={(e) => e.target === e.currentTarget && closeInspector()}
    >
      <div className="inspector-content w-[90vw] max-w-4xl h-[80vh] rounded-xl flex flex-col overflow-hidden">
        {/* Header */}
        <div className="inspector-header flex items-center justify-between p-4 border-b border-white/10">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-bold">REQUEST INSPECTOR</h2>
            <span className="method-badge font-mono text-sm px-2 py-1 rounded bg-white/10">
              {selectedEvent.method}
            </span>
            <span
              className={`status-badge font-mono text-sm px-2 py-1 rounded border ${getStatusClass()}`}
            >
              {selectedEvent.status}
            </span>
            <span className="text-sm opacity-60">
              {selectedEvent.duration?.toFixed(0)}ms
            </span>
          </div>
          <button
            onClick={closeInspector}
            className="p-2 rounded-lg hover:bg-white/10 transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Endpoint */}
        <div className="px-4 py-2 border-b border-white/10 bg-black/20">
          <code className="text-sm font-mono opacity-80">{selectedEvent.endpoint}</code>
          <span className="ml-4 text-xs opacity-40">{formatTime(selectedEvent.timestamp)}</span>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-white/10">
          {tabs.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`flex items-center gap-2 px-4 py-3 text-sm transition-colors ${
                activeTab === tab.id
                  ? 'border-b-2 border-cyan-400 text-cyan-400'
                  : 'opacity-60 hover:opacity-100'
              }`}
            >
              {tab.icon}
              {tab.label}
            </button>
          ))}
        </div>

        {/* Tab Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'request' && (
            <div className="space-y-4">
              <HeaderSection
                title="Request Headers"
                headers={selectedEvent.request_headers || {}}
              />
              <BodyViewer
                body={selectedEvent.request_body}
                contentType={selectedEvent.request_headers?.['content-type']}
                truncated={selectedEvent.request_body_truncated}
              />
              {selectedEvent.query_params && Object.keys(selectedEvent.query_params).length > 0 && (
                <HeaderSection
                  title="Query Parameters"
                  headers={selectedEvent.query_params}
                />
              )}
            </div>
          )}

          {activeTab === 'response' && (
            <div className="space-y-4">
              <HeaderSection
                title="Response Headers"
                headers={selectedEvent.response_headers || {}}
              />
              <BodyViewer
                body={selectedEvent.response_body}
                contentType={selectedEvent.response_headers?.['content-type']}
                truncated={selectedEvent.response_body_truncated}
              />
              {selectedEvent.error_message && (
                <div className="error-section">
                  <div className="text-xs opacity-60 mb-2">ERROR</div>
                  <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-red-400">
                    <div className="text-sm font-medium">{selectedEvent.error_type}</div>
                    <div className="text-xs mt-1 opacity-80">{selectedEvent.error_message}</div>
                  </div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'timing' && (
            <div className="space-y-4">
              <div className="timing-bar">
                <div className="text-xs opacity-60 mb-2">TOTAL DURATION</div>
                <div className="bg-black/30 rounded-lg p-4">
                  <div className="text-3xl font-bold text-cyan-400">
                    {selectedEvent.duration?.toFixed(2)}ms
                  </div>
                </div>
              </div>

              <div className="timing-details grid grid-cols-2 gap-4">
                <div className="bg-black/30 rounded-lg p-3">
                  <div className="text-xs opacity-60 mb-1">Request Size</div>
                  <div className="text-lg font-mono">
                    {selectedEvent.request_body_size || 0} bytes
                  </div>
                </div>
                <div className="bg-black/30 rounded-lg p-3">
                  <div className="text-xs opacity-60 mb-1">Response Size</div>
                  <div className="text-lg font-mono">
                    {selectedEvent.response_body_size || 0} bytes
                  </div>
                </div>
                <div className="bg-black/30 rounded-lg p-3">
                  <div className="text-xs opacity-60 mb-1">Client IP</div>
                  <div className="text-lg font-mono">{selectedEvent.client_ip || '—'}</div>
                </div>
                <div className="bg-black/30 rounded-lg p-3">
                  <div className="text-xs opacity-60 mb-1">Correlation ID</div>
                  <div className="text-sm font-mono truncate">
                    {selectedEvent.correlation_id || '—'}
                  </div>
                </div>
              </div>

              {selectedEvent.user_agent && (
                <div className="bg-black/30 rounded-lg p-3">
                  <div className="text-xs opacity-60 mb-1">User Agent</div>
                  <div className="text-sm font-mono break-all">{selectedEvent.user_agent}</div>
                </div>
              )}
            </div>
          )}

          {activeTab === 'raw' && (
            <div className="space-y-4">
              <div className="flex justify-end">
                <button
                  onClick={() => navigator.clipboard.writeText(generateRaw())}
                  className="text-xs px-3 py-1.5 rounded bg-white/5 hover:bg-white/10 transition-colors flex items-center gap-1"
                >
                  <Copy size={12} />
                  Copy Raw
                </button>
              </div>
              <pre className="raw-content bg-black/30 rounded-lg p-4 font-mono text-xs overflow-auto whitespace-pre-wrap">
                {generateRaw()}
              </pre>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="inspector-footer flex items-center justify-between p-4 border-t border-white/10 bg-black/20">
          <button
            onClick={copyCurl}
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm flex items-center gap-2"
          >
            <Terminal size={14} />
            Copy as cURL
          </button>
          <button
            onClick={() =>
              navigator.clipboard.writeText(JSON.stringify(selectedEvent, null, 2))
            }
            className="px-4 py-2 rounded-lg bg-white/5 hover:bg-white/10 transition-colors text-sm flex items-center gap-2"
          >
            <FileJson size={14} />
            Export JSON
          </button>
        </div>
      </div>
    </div>
  );
}
