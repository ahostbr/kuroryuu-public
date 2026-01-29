import { useEffect, useCallback } from 'react';
import type { View } from '../components/Sidebar';

interface ShortcutConfig {
  key: string;
  ctrl?: boolean;
  meta?: boolean;
  shift?: boolean;
  action: () => void;
}

/**
 * Global keyboard shortcuts for navigation
 * Matches Auto-Claude shortcuts: K, A, N, D, I, L, C, M, W
 */
export function useKeyboardShortcuts(
  onNavigate: (view: View) => void,
  onOpenSettings?: () => void,
  enabled = true
) {
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Don't trigger shortcuts when typing in inputs
    const target = e.target as HTMLElement;
    const tagName = target.tagName.toLowerCase();
    if (tagName === 'input' || tagName === 'textarea' || target.contentEditable === 'true') {
      return;
    }

    // Settings: Cmd+, (Mac) or Ctrl+, (Windows/Linux)
    if ((e.metaKey || e.ctrlKey) && e.key === ',') {
      e.preventDefault();
      onOpenSettings?.();
      return;
    }

    // Don't trigger single-key shortcuts if modifiers are pressed
    if (e.metaKey || e.ctrlKey || e.altKey) return;

    const shortcuts: Record<string, View> = {
      'k': 'kanban',
      'a': 'terminals',
      'n': 'insights',
      'd': 'dojo',
      'i': 'ideation',
      'l': 'changelog',
      'c': 'context',
      'y': 'memory',
      'm': 'command-center',
      'w': 'worktrees',
    };

    const view = shortcuts[e.key.toLowerCase()];
    if (view) {
      e.preventDefault();
      onNavigate(view);
    }
  }, [onNavigate, onOpenSettings]);

  useEffect(() => {
    if (!enabled) return;
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown, enabled]);
}

/**
 * Hook for registering custom shortcuts
 */
export function useShortcut(
  config: ShortcutConfig,
  deps: React.DependencyList = []
) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const tagName = target.tagName.toLowerCase();
      if (tagName === 'input' || tagName === 'textarea') return;

      const modifiersMatch = 
        (config.ctrl ? e.ctrlKey : !e.ctrlKey) &&
        (config.meta ? e.metaKey : !e.metaKey) &&
        (config.shift ? e.shiftKey : !e.shiftKey);

      if (modifiersMatch && e.key.toLowerCase() === config.key.toLowerCase()) {
        e.preventDefault();
        config.action();
      }
    };

    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [config.key, config.ctrl, config.meta, config.shift, ...deps]);
}
