/**
 * Update Notification Component
 *
 * Shows update status in bottom-right corner:
 * - Downloading progress
 * - Update ready notification with restart button
 */
import { useState, useEffect, useCallback } from 'react';
import { Download, RefreshCw, X, Check, AlertCircle } from 'lucide-react';

interface UpdateStatus {
  status: 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error';
  version?: string;
  percent?: number;
  error?: string;
}

export function UpdateNotification() {
  const [status, setStatus] = useState<UpdateStatus | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    // Only subscribe if updater API is available (production mode)
    if (!window.electronAPI?.updater?.onStatus) {
      return;
    }

    // Subscribe to update status
    const unsubscribe = window.electronAPI.updater.onStatus((newStatus) => {
      setStatus(newStatus);
      setDismissed(false);

      // Show notification for actionable states
      if (['downloading', 'ready', 'error'].includes(newStatus.status)) {
        setVisible(true);
      } else if (newStatus.status === 'not-available') {
        // Hide after brief display for "up to date" message
        setVisible(true);
        setTimeout(() => setVisible(false), 2000);
      }
    });

    return () => {
      if (unsubscribe) unsubscribe();
    };
  }, []);

  const handleInstall = useCallback(() => {
    window.electronAPI?.updater?.install();
  }, []);

  const handleDismiss = useCallback(() => {
    setDismissed(true);
    setVisible(false);
  }, []);

  // Don't render if dismissed or not visible
  if (dismissed || !visible || !status) {
    return null;
  }

  // Render based on status
  const renderContent = () => {
    switch (status.status) {
      case 'downloading':
        return (
          <div className="flex items-center gap-3" data-testid="update-downloading">
            <Download className="w-5 h-5 text-blue-400 animate-bounce" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Downloading update...
              </p>
              <div className="mt-1 w-full bg-secondary rounded-full h-1.5" data-testid="update-progress">
                <div
                  className="bg-blue-500 h-1.5 rounded-full transition-all"
                  style={{ width: `${status.percent ?? 0}%` }}
                  data-testid="update-progress-bar"
                  data-percent={status.percent ?? 0}
                />
              </div>
              <p className="text-xs text-muted-foreground mt-1" data-testid="update-progress-text">
                {(status.percent ?? 0).toFixed(0)}% complete
              </p>
            </div>
          </div>
        );

      case 'ready':
        return (
          <div className="flex items-center gap-3" data-testid="update-ready">
            <Check className="w-5 h-5 text-green-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Update ready!
              </p>
              <p className="text-xs text-muted-foreground" data-testid="update-version">
                Version {status.version} downloaded
              </p>
            </div>
            <button
              onClick={handleInstall}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-md bg-green-600 hover:bg-green-500 text-white text-sm font-medium transition-colors"
              data-testid="update-restart-button"
            >
              <RefreshCw className="w-4 h-4" />
              Restart
            </button>
          </div>
        );

      case 'error':
        return (
          <div className="flex items-center gap-3" data-testid="update-error">
            <AlertCircle className="w-5 h-5 text-red-400" />
            <div className="flex-1">
              <p className="text-sm font-medium text-foreground">
                Update failed
              </p>
              <p className="text-xs text-muted-foreground truncate max-w-[200px]" data-testid="update-error-message">
                {status.error || 'Unknown error'}
              </p>
            </div>
          </div>
        );

      case 'not-available':
        return (
          <div className="flex items-center gap-3" data-testid="update-not-available">
            <Check className="w-5 h-5 text-green-400" />
            <p className="text-sm text-muted-foreground">
              You're up to date!
            </p>
          </div>
        );

      default:
        return null;
    }
  };

  const content = renderContent();
  if (!content) return null;

  return (
    <div
      className="fixed bottom-4 right-4 z-50 animate-in slide-in-from-bottom-4 fade-in"
      data-testid="update-notification"
    >
      <div className="bg-card border border-border rounded-lg shadow-lg p-4 min-w-[280px] max-w-[360px]">
        {/* Dismiss button */}
        {status.status !== 'downloading' && (
          <button
            onClick={handleDismiss}
            className="absolute top-2 right-2 p-1 rounded-md hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
            data-testid="update-dismiss"
          >
            <X className="w-4 h-4" />
          </button>
        )}

        {content}
      </div>
    </div>
  );
}

export default UpdateNotification;
