/**
 * Defense Toolbar
 *
 * Appears in the traffic page when defense mode is activated.
 * Shows threat information and provides defense actions.
 */

import { Shield, Power, Eye, X, Ban, Globe, Clock } from 'lucide-react';
import { useState, useCallback } from 'react';
import { useTrafficStore } from '../../stores/traffic-store';
import { useKuroryuuDialog } from '../../hooks/useKuroryuuDialog';

interface ThreatIntel {
  ip: string;
  country?: string;
  countryCode?: string;
  city?: string;
  isp?: string;
  org?: string;
  isProxy?: boolean;
  isVpn?: boolean;
  threatScore?: number;
}

export function DefenseToolbar() {
  const defenseMode = useTrafficStore((s) => s.defenseMode);
  const threatEvent = useTrafficStore((s) => s.threatEvent);
  const blockedIPs = useTrafficStore((s) => s.blockedIPs);
  const clearDefenseMode = useTrafficStore((s) => s.clearDefenseMode);

  const [intel, setIntel] = useState<ThreatIntel | null>(null);
  const [isLoadingIntel, setIsLoadingIntel] = useState(false);
  const [showIntelModal, setShowIntelModal] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const { confirmDestructive } = useKuroryuuDialog();

  // Fetch threat intelligence
  const fetchIntel = useCallback(async () => {
    if (!threatEvent?.ip || isLoadingIntel) return;

    setIsLoadingIntel(true);
    try {
      const response = await fetch(
        `http://127.0.0.1:8200/v1/security/intel/${threatEvent.ip}?refresh=true`
      );
      if (response.ok) {
        const data = await response.json();
        if (data.found && data.intel) {
          setIntel({
            ip: data.intel.ip,
            country: data.intel.country,
            countryCode: data.intel.country_code,
            city: data.intel.city,
            isp: data.intel.isp,
            org: data.intel.org,
            isProxy: data.intel.is_proxy,
            isVpn: data.intel.is_vpn,
            threatScore: data.intel.threat_score,
          });
        }
      }
    } catch (error) {
      console.error('Failed to fetch threat intel:', error);
    } finally {
      setIsLoadingIntel(false);
    }
  }, [threatEvent?.ip, isLoadingIntel]);

  // Emergency shutdown
  const handleShutdown = useCallback(async () => {
    if (isShuttingDown) return;

    const confirmed = await confirmDestructive({
      title: 'Emergency Shutdown',
      message: 'Are you sure you want to shut down the server?\n\nThis will terminate all connections immediately.',
      confirmLabel: 'Shut Down',
      cancelLabel: 'Cancel',
    });
    if (!confirmed) return;

    setIsShuttingDown(true);
    try {
      await fetch('http://127.0.0.1:8200/v1/security/shutdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Emergency shutdown from defense toolbar', confirm: true }),
      });
    } catch (error) {
      console.error('Failed to shutdown server:', error);
      setIsShuttingDown(false);
    }
  }, [isShuttingDown, confirmDestructive]);

  if (!defenseMode) return null;

  return (
    <>
      {/* Defense Toolbar */}
      <div className="absolute top-0 left-0 right-0 z-50 bg-red-950/95 border-b-2 border-red-500 shadow-lg shadow-red-500/20">
        <div className="flex items-center justify-between px-4 py-2">
          {/* Left: Threat Info */}
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Shield className="w-5 h-5 text-red-500 animate-pulse" />
              <span className="text-red-400 font-bold tracking-wider text-sm">DEFENSE MODE</span>
            </div>

            {threatEvent && (
              <div className="flex items-center gap-3 ml-4 pl-4 border-l border-red-500/30">
                <div className="flex items-center gap-2">
                  <Globe className="w-4 h-4 text-red-400" />
                  <span className="text-white font-mono text-sm">{threatEvent.ip}</span>
                </div>
                <div className="flex items-center gap-2 text-zinc-400 text-xs">
                  <Clock className="w-3 h-3" />
                  {new Date(threatEvent.timestamp).toLocaleTimeString()}
                </div>
                <div className="text-zinc-500 text-xs">
                  <span className="text-cyan-400">{threatEvent.method}</span> {threatEvent.endpoint}
                </div>
              </div>
            )}
          </div>

          {/* Right: Actions */}
          <div className="flex items-center gap-2">
            {/* View Intel Button */}
            <button
              onClick={() => {
                fetchIntel();
                setShowIntelModal(true);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-zinc-200 rounded text-sm
                         hover:bg-zinc-700 transition-colors"
            >
              <Eye className="w-4 h-4" />
              Intel
            </button>

            {/* Blocked IPs Counter */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-800 text-zinc-400 rounded text-sm">
              <Ban className="w-4 h-4" />
              {blockedIPs.length} Blocked
            </div>

            {/* Shutdown Button */}
            <button
              onClick={handleShutdown}
              disabled={isShuttingDown}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-red-800 text-white rounded text-sm
                         hover:bg-red-700 transition-colors disabled:opacity-50"
            >
              <Power className="w-4 h-4" />
              {isShuttingDown ? 'Shutting Down...' : 'Shutdown'}
            </button>

            {/* Clear Alert Button */}
            <button
              onClick={clearDefenseMode}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-zinc-700 text-zinc-200 rounded text-sm
                         hover:bg-zinc-600 transition-colors"
            >
              <X className="w-4 h-4" />
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Intel Modal */}
      {showIntelModal && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70">
          <div className="bg-zinc-900 border border-zinc-700 rounded-xl shadow-2xl w-full max-w-md p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold text-white flex items-center gap-2">
                <Eye className="w-5 h-5 text-cyan-400" />
                Threat Intelligence
              </h3>
              <button
                onClick={() => setShowIntelModal(false)}
                className="text-zinc-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {isLoadingIntel ? (
              <div className="text-center py-8 text-zinc-400">
                <div className="animate-spin w-8 h-8 border-2 border-cyan-500 border-t-transparent rounded-full mx-auto mb-2" />
                Gathering intelligence...
              </div>
            ) : intel ? (
              <div className="space-y-3">
                <div className="bg-zinc-800 rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">IP Address</div>
                  <div className="text-lg font-mono text-red-400">{intel.ip}</div>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <div className="text-xs text-zinc-500 mb-1">Location</div>
                    <div className="text-sm text-white">
                      {intel.city && `${intel.city}, `}
                      {intel.country || 'Unknown'}
                      {intel.countryCode && ` (${intel.countryCode})`}
                    </div>
                  </div>
                  <div className="bg-zinc-800 rounded-lg p-3">
                    <div className="text-xs text-zinc-500 mb-1">Threat Score</div>
                    <div
                      className={`text-lg font-bold ${
                        (intel.threatScore || 0) >= 70
                          ? 'text-red-500'
                          : (intel.threatScore || 0) >= 40
                          ? 'text-yellow-500'
                          : 'text-green-500'
                      }`}
                    >
                      {intel.threatScore ?? 'N/A'}/100
                    </div>
                  </div>
                </div>

                <div className="bg-zinc-800 rounded-lg p-3">
                  <div className="text-xs text-zinc-500 mb-1">ISP / Organization</div>
                  <div className="text-sm text-white">{intel.isp || intel.org || 'Unknown'}</div>
                </div>

                <div className="flex gap-2">
                  {intel.isProxy && (
                    <span className="px-2 py-1 bg-yellow-500/20 text-yellow-400 rounded text-xs">
                      Proxy
                    </span>
                  )}
                  {intel.isVpn && (
                    <span className="px-2 py-1 bg-orange-500/20 text-orange-400 rounded text-xs">
                      VPN
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-zinc-400">
                No intelligence data available
                <button
                  onClick={fetchIntel}
                  className="block mx-auto mt-2 text-cyan-400 hover:underline text-sm"
                >
                  Retry
                </button>
              </div>
            )}

            <div className="mt-4 pt-4 border-t border-zinc-700">
              <button
                onClick={() => setShowIntelModal(false)}
                className="w-full py-2 bg-zinc-700 text-white rounded hover:bg-zinc-600 transition-colors"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
