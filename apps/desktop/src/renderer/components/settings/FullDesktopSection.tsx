/**
 * Full Desktop Access Settings Section
 *
 * OPT-IN only, disabled by default. Session-only (resets on app restart).
 * Simplified UI that triggers the FullDesktopWizard for setup.
 *
 * DANGER: This feature gives Claude FULL control of the Windows desktop.
 *
 * Uses pure PowerShell/Win32 APIs - no external dependencies.
 *
 * PLATFORM: Windows only - requires PowerShell and Win32 APIs.
 * In Docker/Linux containers, k_pccontrol is automatically disabled.
 */

import { useState, useEffect } from 'react';
import {
  AlertTriangle,
  Monitor,
  Square,
  Loader2,
  Settings2,
  Zap,
} from 'lucide-react';
import { toast } from '../ui/toast';
import { FullDesktopWizard } from './FullDesktopWizard';

interface PCControlStatus {
  armed: boolean;
}

export function FullDesktopSection() {
  const [status, setStatus] = useState<PCControlStatus | null>(null);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);

  // Load status on mount and listen for changes
  useEffect(() => {
    refreshStatus();

    // Listen for status changes from main process
    const cleanup = window.electronAPI?.pccontrol?.onStatusChanged?.((newStatus) => {
      setStatus(newStatus);
    });

    return () => { cleanup?.(); };
  }, []);

  const refreshStatus = async () => {
    setChecking(true);
    try {
      if (window.electronAPI?.pccontrol?.status) {
        const s = await window.electronAPI.pccontrol.status();
        setStatus(s);
      }
    } catch (err) {
      console.error('Failed to load PC Control status:', err);
    } finally {
      setChecking(false);
    }
  };

  const handleDisable = async () => {
    setLoading(true);
    try {
      if (window.electronAPI?.pccontrol?.disarm) {
        await window.electronAPI.pccontrol.disarm();
        toast.success('Full Desktop Access disabled');
        await refreshStatus();
      }
    } catch (err) {
      toast.error('Failed to disable Full Desktop Access');
    } finally {
      setLoading(false);
    }
  };

  const handleWizardComplete = () => {
    refreshStatus();
    toast.success('Full Desktop Access enabled');
  };

  const isArmed = status?.armed ?? false;

  return (
    <div className="space-y-3">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className={`p-1.5 rounded ${isArmed ? 'bg-red-500/20' : 'bg-muted'}`}>
            <Monitor className={`w-3.5 h-3.5 ${isArmed ? 'text-red-400' : 'text-muted-foreground'}`} />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Full Desktop Access</h3>
            <p className="text-[10px] text-muted-foreground">
              {isArmed ? 'ACTIVE - Claude has PC control' : 'Ready - Not enabled'}
            </p>
          </div>
        </div>
        {isArmed && (
          <span className="px-2 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded-full font-medium animate-pulse">
            ARMED
          </span>
        )}
      </div>

      {/* DANGER Warning - always visible */}
      <div className="bg-red-500/10 border border-red-500/50 rounded-lg p-3">
        <div className="flex items-center gap-2 text-red-400 font-semibold text-xs mb-1.5">
          <AlertTriangle className="w-4 h-4" />
          <span>DANGER: Full PC Control</span>
        </div>
        <ul className="text-[10px] text-red-400/80 space-y-0.5 list-disc list-inside">
          <li>Claude can control your ENTIRE computer</li>
          <li>Can read any visible text including passwords</li>
          <li>Can click, type, and manipulate any window</li>
        </ul>
      </div>

      {/* How it works - brief */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-[10px] text-muted-foreground">
          <Zap className="w-3 h-3 text-primary" />
          <span>Uses PowerShell - no external software required</span>
          <span className="px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded text-[9px] font-medium">
            Windows only
          </span>
        </div>
        <ul className="text-[10px] text-muted-foreground space-y-1 list-disc list-inside ml-1">
          <li>For accurate clicks, use 100% DPI scaling (Settings → Display)</li>
        </ul>
      </div>

      {/* Playwright comparison */}
      <p className="text-[10px] text-muted-foreground/70 italic">
        Think of it as Playwright for your entire desktop - browser automation, but for any Windows application.
      </p>

      {/* Status & Controls */}
      {checking ? (
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Checking status...</span>
        </div>
      ) : (
        <div className="space-y-2">
          {/* Action buttons */}
          <div className="flex gap-2">
            {!isArmed ? (
              <button
                onClick={() => setWizardOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-red-500 text-white rounded text-xs font-medium hover:bg-red-600 transition-colors"
              >
                <Settings2 className="w-3 h-3" />
                Enable
              </button>
            ) : (
              <button
                onClick={handleDisable}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-muted text-foreground rounded text-xs font-medium hover:bg-muted/80 disabled:opacity-50 transition-colors"
              >
                {loading ? (
                  <Loader2 className="w-3 h-3 animate-spin" />
                ) : (
                  <Square className="w-3 h-3" />
                )}
                Disable
              </button>
            )}
          </div>

          {/* Session-only note */}
          {isArmed && (
            <p className="text-[10px] text-muted-foreground">
              This is session-only. Access will be disabled when you restart the app.
            </p>
          )}
        </div>
      )}

      {/* Wizard Dialog */}
      <FullDesktopWizard
        open={wizardOpen}
        onOpenChange={setWizardOpen}
        onComplete={handleWizardComplete}
      />
    </div>
  );
}
