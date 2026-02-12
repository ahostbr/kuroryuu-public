/**
 * IdentityEditorView — file tabs + CodeMirror editor for identity markdown files
 *
 * Includes identity file tabs (Soul, User, Memory, Heartbeat) and a "Daily" tab
 * for browsing daily running-context memory files.
 */

import { useEffect, useState } from 'react';
import { Save, FileText, User, BookOpen, Heart, Calendar, ChevronDown } from 'lucide-react';
import { useIdentityStore } from '../../stores/identity-store';
import { EditorPane } from '../editdoc/EditorPane';
import type { IdentityFileKey } from '../../types/identity';

const FILE_TABS: { key: IdentityFileKey; label: string; icon: typeof FileText }[] = [
    { key: 'soul', label: 'Soul', icon: Heart },
    { key: 'user', label: 'User', icon: User },
    { key: 'memory', label: 'Memory', icon: BookOpen },
    { key: 'heartbeat', label: 'Heartbeat', icon: FileText },
];

function getTodayDate(): string {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function IdentityEditorView() {
    const {
        profile,
        activeFile,
        editContent,
        isDirty,
        dailyMemory,
        dailyMemoryDates,
        dailySelectedDate,
        loadProfile,
        setActiveFile,
        setEditContent,
        saveFile,
        loadDailyMemory,
        loadDailyMemoryDates,
    } = useIdentityStore();

    const [showDaily, setShowDaily] = useState(false);
    const [datePickerOpen, setDatePickerOpen] = useState(false);

    useEffect(() => {
        if (!profile) {
            loadProfile();
        }
    }, [profile, loadProfile]);

    // Load daily memory dates when switching to daily view
    useEffect(() => {
        if (showDaily) {
            loadDailyMemoryDates();
            if (!dailyMemory) {
                loadDailyMemory(); // Load today by default
            }
        }
    }, [showDaily, loadDailyMemoryDates, loadDailyMemory, dailyMemory]);

    const handleSave = () => {
        saveFile(activeFile);
    };

    const handleSelectDate = (date: string) => {
        loadDailyMemory(date);
        setDatePickerOpen(false);
    };

    const activeFileData = profile?.[activeFile];
    const today = getTodayDate();
    const isToday = !dailySelectedDate || dailySelectedDate === today;

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
                                onClick={() => { setShowDaily(false); setActiveFile(tab.key); }}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                                    !showDaily && activeFile === tab.key
                                        ? 'bg-primary text-primary-foreground'
                                        : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                                }`}
                            >
                                <Icon className="w-3 h-3" />
                                {tab.label}
                            </button>
                        );
                    })}
                    {/* Daily Memory Tab */}
                    <button
                        onClick={() => setShowDaily(true)}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                            showDaily
                                ? 'bg-primary text-primary-foreground'
                                : 'text-muted-foreground hover:text-foreground hover:bg-secondary'
                        }`}
                    >
                        <Calendar className="w-3 h-3" />
                        Daily
                    </button>
                </div>
                <div className="flex items-center gap-2">
                    {showDaily ? (
                        /* Daily view: date picker */
                        <div className="relative">
                            <button
                                onClick={() => setDatePickerOpen(!datePickerOpen)}
                                className="flex items-center gap-1 px-2 py-1 rounded text-xs bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
                            >
                                <Calendar className="w-3 h-3" />
                                {dailySelectedDate ?? today}
                                <ChevronDown className="w-3 h-3" />
                            </button>
                            {datePickerOpen && (
                                <div className="absolute right-0 top-full mt-1 z-50 bg-card border border-border rounded-lg shadow-lg py-1 max-h-48 overflow-y-auto min-w-[140px]">
                                    <button
                                        onClick={() => handleSelectDate(today)}
                                        className={`w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors ${
                                            isToday ? 'text-primary font-medium' : 'text-foreground'
                                        }`}
                                    >
                                        {today} (today)
                                    </button>
                                    {dailyMemoryDates
                                        .filter(d => d !== today)
                                        .sort((a, b) => b.localeCompare(a))
                                        .map(date => (
                                            <button
                                                key={date}
                                                onClick={() => handleSelectDate(date)}
                                                className={`w-full text-left px-3 py-1.5 text-xs hover:bg-secondary transition-colors ${
                                                    dailySelectedDate === date ? 'text-primary font-medium' : 'text-foreground'
                                                }`}
                                            >
                                                {date}
                                            </button>
                                        ))
                                    }
                                    {dailyMemoryDates.length === 0 && (
                                        <div className="px-3 py-1.5 text-xs text-muted-foreground">No daily memories yet</div>
                                    )}
                                </div>
                            )}
                        </div>
                    ) : (
                        /* Identity file view: save controls */
                        <>
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
                        </>
                    )}
                </div>
            </div>

            {/* Editor */}
            <div className="flex-1 overflow-hidden">
                {showDaily ? (
                    <EditorPane
                        content={dailyMemory?.content ?? `# ${dailySelectedDate ?? today}\n\nNo entries yet.`}
                        onChange={() => {}} // readOnly for past days
                        language="markdown"
                        readOnly={!isToday}
                    />
                ) : (
                    <EditorPane
                        content={editContent}
                        onChange={setEditContent}
                        onSave={handleSave}
                        language="markdown"
                    />
                )}
            </div>
        </div>
    );
}
