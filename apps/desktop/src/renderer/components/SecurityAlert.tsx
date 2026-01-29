/**
 * Security Alert Modal
 *
 * CRITICAL security modal displayed when an external connection is detected.
 * Features lockdown aesthetic with pulsing red overlay, scanning lines,
 * and threat information display.
 *
 * Actions:
 * - View in Traffic: Navigate to traffic page with threat highlighted
 * - Shutdown Server: Emergency server shutdown
 * - Dismiss: Close alert (threat already auto-blocked)
 */

import * as Dialog from '@radix-ui/react-dialog';
import { Shield, AlertTriangle, Globe, Clock, Server, FileCode, Power, Eye, X } from 'lucide-react';
import { useEffect, useState, useCallback } from 'react';
import { ThemedFrame } from './ui/ThemedFrame';
import { useIsThemedStyle } from '../hooks/useTheme';
import { useKuroryuuDialog } from '../hooks/useKuroryuuDialog';

export interface SecurityAlertData {
  eventId: string;
  clientIp: string;
  userAgent: string;
  endpoint: string;
  method: string;
  headers: Record<string, string>;
  timestamp: string;
  message: string;
  autoBlocked: boolean;
}

interface SecurityAlertProps {
  alert: SecurityAlertData | null;
  onDismiss: () => void;
  onViewInTraffic: () => void;
}

export function SecurityAlert({ alert, onDismiss, onViewInTraffic }: SecurityAlertProps) {
  const { isKuroryuu, isGrunge } = useIsThemedStyle();
  const [pulseCount, setPulseCount] = useState(0);
  const [showHeaders, setShowHeaders] = useState(false);
  const [isShuttingDown, setIsShuttingDown] = useState(false);
  const { confirmDestructive } = useKuroryuuDialog();

  // Pulsing animation for urgency
  useEffect(() => {
    if (!alert) return;
    const interval = setInterval(() => {
      setPulseCount((c) => c + 1);
    }, 500);
    return () => clearInterval(interval);
  }, [alert]);

  // Play alert sound on mount
  useEffect(() => {
    if (!alert) return;
    playAlertSound();
  }, [alert]);

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
      const response = await fetch('http://127.0.0.1:8200/v1/security/shutdown', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason: 'Emergency shutdown from security alert', confirm: true }),
      });
      if (!response.ok) {
        throw new Error('Shutdown request failed');
      }
    } catch (error) {
      console.error('Failed to shutdown server:', error);
      setIsShuttingDown(false);
    }
  }, [isShuttingDown, confirmDestructive]);

  const handleViewInTraffic = useCallback(() => {
    onViewInTraffic();
    onDismiss();
  }, [onViewInTraffic, onDismiss]);

  if (!alert) return null;

  const formattedTime = new Date(alert.timestamp).toLocaleString();

  return (
    <Dialog.Root open={!!alert} onOpenChange={(open) => !open && onDismiss()}>
      <Dialog.Portal>
        {/* Animated red overlay with pulsing effect */}
        <Dialog.Overlay
          className={`fixed inset-0 z-[9999] transition-all duration-300 ${
            pulseCount % 2 === 0 ? 'bg-red-900/90' : 'bg-red-950/95'
          }`}
          style={{ backdropFilter: 'blur(8px)' }}
        />

        {/* Scanning line effect */}
        <div
          className="fixed inset-0 z-[9999] pointer-events-none overflow-hidden"
          style={{
            background:
              'repeating-linear-gradient(0deg, transparent, transparent 2px, rgba(255,0,0,0.03) 2px, rgba(255,0,0,0.03) 4px)',
          }}
        >
          <div
            className="absolute w-full h-1 bg-red-500/30"
            style={{
              animation: 'scan 2s linear infinite',
              top: `${(pulseCount * 3) % 100}%`,
            }}
          />
        </div>

        <Dialog.Content
          className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[10000]"
          style={{ animation: 'zoom-in 0.2s ease-out' }}
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
          onInteractOutside={(e) => e.preventDefault()}
        >
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="lg"
            className="w-[95vw] max-w-2xl bg-zinc-900 border-2 border-red-500 shadow-[0_0_60px_rgba(239,68,68,0.5)]"
          >
          {/* Animated border glow */}
          <div
            className="absolute inset-0 rounded-xl border-2 border-red-500"
            style={{ animation: 'pulse 1s ease-in-out infinite' }}
          />

          {/* LOCKDOWN Banner */}
          <div className="absolute -top-4 left-1/2 -translate-x-1/2 px-6 py-1 bg-red-600 text-white text-sm font-bold tracking-widest rounded">
            LOCKDOWN
          </div>

          {/* Header with warning icon */}
          <div className="flex items-center gap-4 mb-6 mt-2">
            <div
              className="p-4 bg-red-500/20 rounded-full"
              style={{ animation: 'pulse 1s ease-in-out infinite' }}
            >
              <Shield className="w-10 h-10 text-red-500" />
            </div>
            <div>
              <Dialog.Title className="text-2xl font-bold text-red-400 flex items-center gap-2">
                <AlertTriangle className="w-6 h-6" />
                SECURITY ALERT
              </Dialog.Title>
              <p className="text-red-300 text-sm mt-1">External Connection Detected & Blocked</p>
            </div>
          </div>

          {/* Main Alert Content */}
          <div className="space-y-4 mb-6">
            <div className="bg-red-950/50 border border-red-500/30 rounded-lg p-4">
              <p className="text-white text-lg font-semibold mb-2">
                A connection from outside localhost has been detected!
              </p>
              <p className="text-red-200 text-sm">
                The IP has been automatically blocked. Review the connection details below.
              </p>
            </div>

            {/* Connection Details */}
            <div className="grid gap-3">
              {/* IP Address - Most prominent */}
              <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                  <Globe className="w-4 h-4" />
                  Threat IP Address
                </div>
                <div className="text-2xl font-mono text-red-400 font-bold">{alert.clientIp}</div>
              </div>

              {/* Two-column grid for other details */}
              <div className="grid grid-cols-2 gap-3">
                <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                    <Server className="w-4 h-4" />
                    Target Endpoint
                  </div>
                  <div className="font-mono text-sm text-zinc-200 truncate">
                    <span className="text-cyan-400">{alert.method}</span> {alert.endpoint}
                  </div>
                </div>

                <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                  <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                    <Clock className="w-4 h-4" />
                    Detected At
                  </div>
                  <div className="font-mono text-sm text-zinc-200">{formattedTime}</div>
                </div>
              </div>

              {/* User Agent */}
              <div className="bg-zinc-800 rounded-lg p-3 border border-zinc-700">
                <div className="flex items-center gap-2 text-zinc-400 text-xs mb-1">
                  <FileCode className="w-4 h-4" />
                  User-Agent
                </div>
                <div className="font-mono text-xs text-zinc-300 break-all">
                  {alert.userAgent || '(not provided)'}
                </div>
              </div>
            </div>

            {/* Expandable Headers Section */}
            <details
              className="bg-zinc-800 rounded-lg border border-zinc-700"
              open={showHeaders}
              onToggle={(e) => setShowHeaders((e.target as HTMLDetailsElement).open)}
            >
              <summary className="p-3 cursor-pointer text-zinc-400 text-sm hover:text-zinc-200">
                View All Headers ({Object.keys(alert.headers).length})
              </summary>
              <div className="p-3 pt-0 max-h-40 overflow-auto">
                <pre className="text-xs font-mono text-zinc-400">
                  {JSON.stringify(alert.headers, null, 2)}
                </pre>
              </div>
            </details>
          </div>

          {/* Actions */}
          <div className="flex gap-3 justify-between">
            <button
              onClick={handleShutdown}
              disabled={isShuttingDown}
              className="px-4 py-2 bg-red-800 text-white rounded-lg font-semibold
                         hover:bg-red-700 transition-colors flex items-center gap-2
                         disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Power className="w-4 h-4" />
              {isShuttingDown ? 'Shutting Down...' : 'Shutdown Server'}
            </button>

            <div className="flex gap-3">
              <button
                onClick={handleViewInTraffic}
                className="px-4 py-2 bg-zinc-700 text-white rounded-lg font-semibold
                           hover:bg-zinc-600 transition-colors flex items-center gap-2"
              >
                <Eye className="w-4 h-4" />
                View in Traffic
              </button>

              <button
                onClick={onDismiss}
                className="px-6 py-2 bg-zinc-600 text-white rounded-lg font-semibold
                           hover:bg-zinc-500 transition-colors flex items-center gap-2"
              >
                <X className="w-4 h-4" />
                Dismiss
              </button>
            </div>
          </div>
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>

      {/* CSS Animations */}
      <style>{`
        @keyframes scan {
          0% { top: -1%; }
          100% { top: 101%; }
        }
        @keyframes zoom-in {
          from { transform: translate(-50%, -50%) scale(0.95); opacity: 0; }
          to { transform: translate(-50%, -50%) scale(1); opacity: 1; }
        }
        @keyframes pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.5; }
        }
      `}</style>
    </Dialog.Root>
  );
}

/**
 * Play an alert sound using Web Audio API
 */
function playAlertSound() {
  try {
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();

    // Play 3 rapid beeps
    for (let i = 0; i < 3; i++) {
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 880; // A5 note - high pitch for alert
      oscillator.type = 'square';

      gainNode.gain.value = 0.2;

      const startTime = audioContext.currentTime + i * 0.15;
      oscillator.start(startTime);
      oscillator.stop(startTime + 0.1);
    }
  } catch (e) {
    console.error('[Security] Failed to play alert sound:', e);
  }
}
