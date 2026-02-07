import React, { useEffect, useMemo, useState } from 'react';
import { Save, Settings, X } from 'lucide-react';
import { useSchedulerStore } from '../../stores/scheduler-store';

interface SchedulerSettingsModalProps {
    onClose: () => void;
}

export function SchedulerSettingsModal({ onClose }: SchedulerSettingsModalProps) {
    const { settings, updateSettings } = useSchedulerStore();

    const [enabled, setEnabled] = useState(true);
    const [maxConcurrentJobs, setMaxConcurrentJobs] = useState(3);
    const [historyRetentionDays, setHistoryRetentionDays] = useState(30);
    const [defaultNotifyOnError, setDefaultNotifyOnError] = useState(true);
    const [isSaving, setIsSaving] = useState(false);

    useEffect(() => {
        if (!settings) return;
        setEnabled(settings.enabled);
        setMaxConcurrentJobs(settings.maxConcurrentJobs);
        setHistoryRetentionDays(settings.historyRetentionDays);
        setDefaultNotifyOnError(settings.defaultNotifyOnError);
    }, [settings]);

    const hasChanges = useMemo(() => {
        if (!settings) return false;
        return (
            enabled !== settings.enabled ||
            maxConcurrentJobs !== settings.maxConcurrentJobs ||
            historyRetentionDays !== settings.historyRetentionDays ||
            defaultNotifyOnError !== settings.defaultNotifyOnError
        );
    }, [defaultNotifyOnError, enabled, historyRetentionDays, maxConcurrentJobs, settings]);

    const handleSave = async () => {
        if (!settings || !hasChanges) {
            onClose();
            return;
        }

        setIsSaving(true);
        try {
            await updateSettings({
                enabled,
                maxConcurrentJobs: Math.max(1, Math.floor(maxConcurrentJobs)),
                historyRetentionDays: Math.max(0, Math.floor(historyRetentionDays)),
                defaultNotifyOnError,
            });
            onClose();
        } finally {
            setIsSaving(false);
        }
    };

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
            <div className="bg-card border border-border rounded-lg shadow-xl w-full max-w-xl max-h-[90vh] overflow-hidden flex flex-col">
                <div className="flex items-center justify-between px-6 py-4 border-b border-border">
                    <div className="flex items-center gap-3">
                        <Settings className="w-5 h-5 text-primary" />
                        <h2 className="text-lg font-semibold text-foreground">Scheduler Settings</h2>
                    </div>
                    <button
                        onClick={onClose}
                        className="p-2 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
                    >
                        <X className="w-5 h-5" />
                    </button>
                </div>

                <div className="flex-1 overflow-y-auto p-6 space-y-5">
                    {!settings ? (
                        <div className="text-sm text-muted-foreground">
                            Loading settings...
                        </div>
                    ) : (
                        <>
                            <label className="flex items-center justify-between gap-3 p-3 rounded-md border border-border bg-background">
                                <div>
                                    <div className="text-sm font-medium text-foreground">Enable Scheduler</div>
                                    <div className="text-xs text-muted-foreground">Globally enable or pause all scheduled execution.</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={enabled}
                                    onChange={(e) => setEnabled(e.target.checked)}
                                    className="w-4 h-4 rounded border-border"
                                />
                            </label>

                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                <label className="space-y-1.5">
                                    <span className="block text-sm font-medium text-foreground">Max Concurrent Jobs</span>
                                    <input
                                        type="number"
                                        min={1}
                                        step={1}
                                        value={maxConcurrentJobs}
                                        onChange={(e) => setMaxConcurrentJobs(parseInt(e.target.value, 10) || 1)}
                                        className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                    <span className="text-xs text-muted-foreground">Limit on simultaneously running jobs.</span>
                                </label>

                                <label className="space-y-1.5">
                                    <span className="block text-sm font-medium text-foreground">History Retention (Days)</span>
                                    <input
                                        type="number"
                                        min={0}
                                        step={1}
                                        value={historyRetentionDays}
                                        onChange={(e) => setHistoryRetentionDays(parseInt(e.target.value, 10) || 0)}
                                        className="w-full px-3 py-2 rounded-md border border-border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary/50"
                                    />
                                    <span className="text-xs text-muted-foreground">How long to keep run history (0 clears immediately).</span>
                                </label>
                            </div>

                            <label className="flex items-center justify-between gap-3 p-3 rounded-md border border-border bg-background">
                                <div>
                                    <div className="text-sm font-medium text-foreground">Default Error Notifications</div>
                                    <div className="text-xs text-muted-foreground">Enable notify-on-error by default for new jobs.</div>
                                </div>
                                <input
                                    type="checkbox"
                                    checked={defaultNotifyOnError}
                                    onChange={(e) => setDefaultNotifyOnError(e.target.checked)}
                                    className="w-4 h-4 rounded border-border"
                                />
                            </label>
                        </>
                    )}
                </div>

                <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border">
                    <button
                        onClick={onClose}
                        className="px-4 py-2 rounded-md bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                    >
                        Cancel
                    </button>
                    <button
                        onClick={handleSave}
                        disabled={!settings || isSaving || !hasChanges}
                        className="flex items-center gap-2 px-4 py-2 rounded-md bg-primary text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                        <Save className="w-4 h-4" />
                        {isSaving ? 'Saving...' : 'Save Settings'}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default SchedulerSettingsModal;
