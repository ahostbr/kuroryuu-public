/**
 * ThemedBackground - Theme-specific background texture overlay
 *
 * Renders subtle background textures/patterns for immersive themes:
 * - Kuroryuu: dragon parchment pattern
 * - Grunge: dark texture overlay
 * - Others: no overlay (CSS background only)
 */
import { useIsThemedStyle } from '../../hooks/useTheme';

// Asset imports
import darkGrungeTexture from '../../assets/themes/grunge/textures/dark-grunge.png';
import dragonParchment from '../../assets/themes/kuroryuu/backgrounds/dragon-parchment.png';

interface ThemedBackgroundProps {
  children: React.ReactNode;
  variant?: 'full' | 'panel' | 'subtle';
  className?: string;
}

export function ThemedBackground({
  children,
  variant = 'subtle',
  className = '',
}: ThemedBackgroundProps) {
  const { isGrunge, isKuroryuu } = useIsThemedStyle();

  const getOpacity = () => {
    switch (variant) {
      case 'full': return 0.15;
      case 'panel': return 0.08;
      case 'subtle': return 0.04;
      default: return 0.04;
    }
  };

  return (
    <div className={`themed-background relative ${className}`}>
      {/* Background texture overlay */}
      {isGrunge && (
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            backgroundImage: `url(${darkGrungeTexture})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: getOpacity(),
            mixBlendMode: 'overlay',
          }}
        />
      )}

      {isKuroryuu && variant !== 'subtle' && (
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            backgroundImage: `url(${dragonParchment})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: getOpacity() * 0.6,
            mixBlendMode: 'soft-light',
          }}
        />
      )}

      {/* Content */}
      <div className="relative z-10">{children}</div>
    </div>
  );
}

/**
 * ThemedBackgroundOverlay - Full-screen overlay that sits on TOP of all content
 * Uses fixed positioning and high z-index with pointer-events-none
 */
export function ThemedBackgroundOverlay() {
  const { isGrunge, isKuroryuu } = useIsThemedStyle();

  // Debug: Log the imported image paths
  if (isKuroryuu) {
    console.log('[ThemedBackground] Dragon parchment URL:', dragonParchment);
  }
  if (isGrunge) {
    console.log('[ThemedBackground] Grunge texture URL:', darkGrungeTexture);
  }

  if (!isGrunge && !isKuroryuu) return null;

  // Grunge: dark texture overlay on top of everything
  if (isGrunge) {
    return (
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${darkGrungeTexture})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.25,
          mixBlendMode: 'overlay',
          zIndex: 9999,
        }}
      />
    );
  }

  // Kuroryuu: dragon parchment texture + golden vignette on top
  return (
    <>
      {/* Dragon parchment texture - HIGH OPACITY for testing */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          backgroundImage: `url(${dragonParchment})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          opacity: 0.35,
          mixBlendMode: 'overlay',
          zIndex: 9999,
        }}
      />
      {/* Golden edge vignette - REMOVED since CSS handles it */}
    </>
  );
}

export default ThemedBackground;
