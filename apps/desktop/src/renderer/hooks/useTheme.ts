import { useEffect } from 'react';
import { useSettingsStore } from '../stores/settings-store';
import { useSettings } from './useSettings';
import type { ThemeId } from '../types/settings';

/**
 * Hook to apply theme CSS variables
 * Applies data-theme and data-mode attributes to document root
 * Uses Zustand for immediate UI updates, electron-store for persistence
 */
export function useTheme() {
  // Read from Zustand store (immediate UI updates when user changes theme)
  const zustandTheme = useSettingsStore((s) => s.appSettings.theme);
  const setZustandTheme = useSettingsStore((s) => s.setTheme);

  // Read persisted theme from electron-store (for initial load)
  const [persistedTheme, , { loading }] = useSettings<string>('ui.theme');

  // On initial load, sync persisted theme to Zustand (only once when loaded)
  useEffect(() => {
    if (!loading && persistedTheme && persistedTheme !== zustandTheme) {
      // Use internal set to avoid re-persisting
      useSettingsStore.setState((s) => ({
        appSettings: { ...s.appSettings, theme: persistedTheme as ThemeId }
      }));
    }
  }, [loading, persistedTheme]); // Intentionally exclude zustandTheme to prevent loops

  // Apply theme to DOM
  useEffect(() => {
    const root = document.documentElement;

    // Theme includes both color theme and mode (e.g., 'default-dark', 'ocean-light')
    const [colorTheme, mode] = parseTheme(zustandTheme);

    // Apply color theme
    root.setAttribute('data-theme', colorTheme);

    // Apply mode
    if (mode === 'light') {
      root.classList.add('light');
      root.setAttribute('data-mode', 'light');
    } else {
      root.classList.remove('light');
      root.setAttribute('data-mode', 'dark');
    }
  }, [zustandTheme]);

  return { theme: zustandTheme };
}

/**
 * Parse theme ID into color theme and mode
 */
function parseTheme(themeId: ThemeId): [string, 'dark' | 'light'] {
  // Handle system preference
  if (themeId.endsWith('-system')) {
    const colorTheme = themeId.replace('-system', '');
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    return [colorTheme, prefersDark ? 'dark' : 'light'];
  }
  
  // Handle explicit dark/light
  if (themeId.endsWith('-dark')) {
    return [themeId.replace('-dark', ''), 'dark'];
  }
  if (themeId.endsWith('-light')) {
    return [themeId.replace('-light', ''), 'light'];
  }
  
  // Default to dark mode
  return [themeId, 'dark'];
}

/**
 * Get available themes
 */
export function getAvailableThemes() {
  return [
    { id: 'oscura-midnight', name: 'Oscura Midnight', description: 'Oscura-inspired with pale yellow accent' },
    { id: 'dusk', name: 'Dusk', description: 'Warmer variant with lighter dark mode' },
    { id: 'lime', name: 'Lime', description: 'Fresh, energetic lime with purple accents' },
    { id: 'ocean', name: 'Ocean', description: 'Calm, professional blue' },
    { id: 'retro', name: 'Retro', description: 'Warm, nostalgic amber' },
    { id: 'neo', name: 'Neo', description: 'Modern cyberpunk' },
    { id: 'forest', name: 'Forest', description: 'Deep greens, natural feel' },
    { id: 'matrix', name: 'Matrix', description: 'Classic hacker green-on-black' },
    { id: 'grunge', name: 'Grunge', description: 'Raw, distressed, weathered aesthetic' },
    { id: 'kuroryuu', name: 'Kuroryuu', description: 'Imperial dragon - gold/black/red' },
  ] as const;
}

/**
 * Check if current theme is a specific themed style
 * Useful for conditional rendering of themed image assets
 * Uses Zustand store for immediate reactivity
 */
export function useIsThemedStyle() {
  const theme = useSettingsStore((s) => s.appSettings.theme);
  const [colorTheme] = parseTheme(theme);

  return {
    isKuroryuu: colorTheme === 'kuroryuu',
    isGrunge: colorTheme === 'grunge',
    isMatrix: colorTheme === 'matrix',
    hasImageAssets: colorTheme === 'kuroryuu' || colorTheme === 'grunge',
    currentTheme: colorTheme as ThemeId,
  };
}

/**
 * Get available modes
 */
export function getAvailableModes() {
  return [
    { id: 'dark', name: 'Dark' },
    { id: 'light', name: 'Light' },
    { id: 'system', name: 'System' },
  ] as const;
}
