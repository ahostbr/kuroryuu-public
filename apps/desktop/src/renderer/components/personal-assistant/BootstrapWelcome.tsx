/**
 * BootstrapWelcome — First Book welcome screen
 *
 * Shown when identity has not been bootstrapped yet.
 * Offers to launch an interactive Claude CLI session for the "First Book" interview.
 */

import { useEffect } from 'react';
import { BookOpen, Play, SkipForward, Loader2 } from 'lucide-react';
import { useIdentityStore } from '../../stores/identity-store';

export function BootstrapWelcome() {
    const {
        bootstrapRunning,
        runBootstrap,
        skipBootstrap,
        checkBootstrap,
        loadProfile,
    } = useIdentityStore();

    // Listen for bootstrap completion via file watcher
    useEffect(() => {
        const unsub = window.electronAPI.identity.onBootstrapCompleted(() => {
            // Bootstrap complete — reload state
            useIdentityStore.setState({ bootstrapRunning: false });
            checkBootstrap();
            loadProfile();
        });
        return unsub;
    }, [checkBootstrap, loadProfile]);

    return (
        <div className="h-full flex items-center justify-center p-8">
            <div className="max-w-lg text-center space-y-6">
                <div className="flex justify-center">
                    <div className="w-16 h-16 rounded-2xl bg-primary/20 flex items-center justify-center">
                        <BookOpen className="w-8 h-8 text-primary" />
                    </div>
                </div>

                <div className="space-y-2">
                    <h2 className="text-2xl font-bold text-foreground">First Book</h2>
                    <p className="text-sm text-muted-foreground leading-relaxed">
                        I'd like to get to know you. Let's have a conversation so I can build my understanding
                        of who you are, how you work, and what matters to you.
                    </p>
                    <p className="text-xs text-muted-foreground/70">
                        This will open an interactive terminal where I'll ask you a few questions.
                        Afterwards, I'll create personalized identity files based on our conversation.
                    </p>
                </div>

                {bootstrapRunning ? (
                    <div className="space-y-3">
                        <div className="flex items-center justify-center gap-2 text-primary">
                            <Loader2 className="w-5 h-5 animate-spin" />
                            <span className="text-sm font-medium">First Book in progress...</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                            Complete the conversation in the terminal window.
                            This panel will update automatically when done.
                        </p>
                    </div>
                ) : (
                    <div className="flex items-center justify-center gap-3">
                        <button
                            onClick={runBootstrap}
                            className="flex items-center gap-2 px-6 py-3 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 transition-colors text-sm font-medium"
                        >
                            <Play className="w-4 h-4" />
                            Begin First Book
                        </button>
                        <button
                            onClick={skipBootstrap}
                            className="flex items-center gap-2 px-4 py-3 rounded-lg bg-secondary text-muted-foreground hover:text-foreground hover:bg-secondary/80 transition-colors text-xs"
                        >
                            <SkipForward className="w-3.5 h-3.5" />
                            Skip
                        </button>
                    </div>
                )}
            </div>
        </div>
    );
}
