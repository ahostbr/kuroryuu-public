/**
 * IdentityEditorView — file tabs + CodeMirror editor for identity markdown files
 */

import { useEffect } from 'react';
import { Save, FileText, User, BookOpen, Heart } from 'lucide-react';
import { useIdentityStore } from '../../stores/identity-store';
import { EditorPane } from '../editdoc/EditorPane';
import type { IdentityFileKey } from '../../types/identity';

const FILE_TABS: { key: IdentityFileKey; label: string; icon: typeof FileText }[] = [
    { key: 'soul', label: 'Soul', icon: Heart },
    { key: 'user', label: 'User', icon: User },
    { key: 'memory', label: 'Memory', icon: BookOpen },
    { key: 'heartbeat', label: 'Heartbeat', icon: FileText },
];

export function IdentityEditorView() {
    const {
        profile,
        activeFile,
        editContent,
        isDirty,
        loadProfile,
        setActiveFile,
        setEditContent,
        saveFile,
    } = useIdentityStore();

    useEffect(() => {
        if (!profile) {
            loadProfile();
        }
    }, [profile, loadProfile]);

    const handleSave = () => {
        saveFile(activeFile);
    };

    const activeFileData = profile?.[activeFile];

    return (
        <div className="h-full flex flex-col">
            {/* File Tabs */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <div className="flex items-center gap-1">
                    {FILE_TABS.map(tab => {
                        const Icon = tab.icon;
                        return (
                            <button
                                key={tab.key}
                                onClick={() => setActiveFile(tab.key)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                    activeFile === tab.key
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                                }`}
                            >
                                <Icon className="w-3 h-3" />
                                {tab.label}
                            </button>
                        );
                    })}
                </div>
                <div className="flex items-center gap-2">
                    {isDirty && (
                        <span className="text-[10px] text-yellow-400">unsaved</span>
                    )}
                    {activeFileData && (
                        <span className="text-[10px] text-muted-foreground/60">
                            Last modified: {new Date(activeFileData.lastModified).toLocaleString()}
                        </span>
                    )}
                    <button
                        onClick={handleSave}
                        disabled={!isDirty}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium transition-colors ${
                            isDirty
                                ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                : 'bg-secondary text-muted-foreground cursor-not-allowed'
                        }`}
                    >
                        <Save className="w-3 h-3" />
                        Save
                    </button>
                </div>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-hidden">
                <EditorPane
                    content={editContent}
                    onChange={setEditContent}
                    onSave={handleSave}
                    language="markdown"
                />
            </div>
        </div>
    );
}
