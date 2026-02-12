/**
 * PromptPreview — read-only view of the exact heartbeat prompt
 *
 * Shows the fully rendered prompt that will be sent to the agent
 * on the next heartbeat run. Refreshes on tab switch.
 */

import { RefreshCw, Copy, Check } from 'lucide-react';
import { useState } from 'react';
import { useIdentityStore } from '../../stores/identity-store';
import { EditorPane } from '../editdoc/EditorPane';

export function PromptPreview() {
    const { heartbeatPromptPreview, loadHeartbeatPrompt } = useIdentityStore();
    const [copied, setCopied] = useState(false);

    const handleCopy = async () => {
        if (!heartbeatPromptPreview) return;
        await navigator.clipboard.writeText(heartbeatPromptPreview);
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
    };

    return (
        <div className="h-full flex flex-col">
            {/* Toolbar */}
            <div className="flex items-center justify-between px-4 py-2 border-b border-border">
                <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">
                        Exact prompt sent to the agent on each heartbeat run
                    </span>
                </div>
                <div className="flex items-center gap-2">
                    {heartbeatPromptPreview && (
                        <span className="text-[10px] text-muted-foreground/60">
                            {heartbeatPromptPreview.split('\n').length} lines
                        </span>
                    )}
                    <button
                        onClick={handleCopy}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors text-foreground"
                    >
                        {copied ? <Check className="w-3 h-3 text-green-400" /> : <Copy className="w-3 h-3" />}
                        {copied ? 'Copied' : 'Copy'}
                    </button>
                    <button
                        onClick={loadHeartbeatPrompt}
                        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium bg-secondary hover:bg-secondary/80 transition-colors text-foreground"
                    >
                        <RefreshCw className="w-3 h-3" />
                        Refresh
                    </button>
                </div>
            </div>

            {/* Prompt Content */}
            <div className="flex-1 overflow-hidden">
                {heartbeatPromptPreview ? (
                    <EditorPane
                        content={heartbeatPromptPreview}
                        onChange={() => {}}
                        language="markdown"
                        readOnly
                    />
                ) : (
                    <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
                        Loading prompt...
                    </div>
                )}
            </div>
        </div>
    );
}
