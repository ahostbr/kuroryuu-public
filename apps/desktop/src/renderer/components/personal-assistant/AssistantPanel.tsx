/**
 * AssistantPanel — container with 3 sub-view tabs (Dashboard, Editor, Activity)
 */

import { useEffect } from 'react';
import { LayoutDashboard, FileEdit, Clock } from 'lucide-react';
import { useIdentityStore } from '../../stores/identity-store';
import { AssistantDashboard } from './AssistantDashboard';
import { IdentityEditorView } from './IdentityEditorView';
import { ActivityView } from './ActivityView';

const VIEWS = [
    { key: 'dashboard' as const, label: 'Dashboard', icon: LayoutDashboard },
    { key: 'editor' as const, label: 'Editor', icon: FileEdit },
    { key: 'activity' as const, label: 'Activity', icon: Clock },
];

export function AssistantPanel() {
    const { activeView, setActiveView, loadProfile } = useIdentityStore();

    useEffect(() => {
        loadProfile();
    }, [loadProfile]);

    return (
        <div className="h-full flex flex-col">
            {/* Sub-view tabs */}
            <div className="flex items-center gap-1 px-4 py-2 border-b border-border">
                {VIEWS.map(view => {
                    const Icon = view.icon;
                    return (
                        <button
                            key={view.key}
                            onClick={() => setActiveView(view.key)}
                            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                activeView === view.key
                                    ? 'bg-primary text-primary-foreground'
                                    : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                            }`}
                        >
                            <Icon className="w-3.5 h-3.5" />
                            {view.label}
                        </button>
                    );
                })}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-hidden">
                {activeView === 'dashboard' && <AssistantDashboard />}
                {activeView === 'editor' && <IdentityEditorView />}
                {activeView === 'activity' && <ActivityView />}
            </div>
        </div>
    );
}
