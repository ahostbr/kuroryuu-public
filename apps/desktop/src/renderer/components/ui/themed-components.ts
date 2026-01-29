/**
 * Themed Components - Re-exports
 *
 * Theme-aware UI components that render differently based on current theme:
 * - Kuroryuu: Dragon/scroll frames, gold accents, parchment textures
 * - Grunge: Brush stroke textures, distressed frames, weathered look
 * - Others: Standard CSS styling
 */

export { ThemedDivider } from './ThemedDivider';
export { ThemedBackground, ThemedBackgroundOverlay } from './ThemedBackground';
export { ThemedCard, ThemedCardHeader } from './ThemedCard';
export { ThemedPanel } from './ThemedPanel';
export { ThemedFrame, ThemedDialogFrame } from './ThemedFrame';

// Re-export theme hook
export { useIsThemedStyle } from '../../hooks/useTheme';
