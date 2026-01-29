/**
 * ThemedPanel - Theme-aware panel/section wrapper
 *
 * Wraps larger content areas with theme-specific styling:
 * - Kuroryuu: pillar borders for sidebar, parchment for main
 * - Grunge: textured dark surface
 * - Others: standard CSS panel styling
 */
import { ReactNode } from 'react';
import { useIsThemedStyle } from '../../hooks/useTheme';

// Asset imports
import pillarVertical from '../../assets/themes/kuroryuu/borders/pillar-vertical.png';
import dragonParchment from '../../assets/themes/kuroryuu/backgrounds/dragon-parchment.png';
import darkGrungeTexture from '../../assets/themes/grunge/textures/dark-grunge.png';

interface ThemedPanelProps {
  children: ReactNode;
  variant?: 'sidebar' | 'main' | 'floating' | 'simple';
  className?: string;
}

export function ThemedPanel({
  children,
  variant = 'main',
  className = '',
}: ThemedPanelProps) {
  const { isGrunge, isKuroryuu } = useIsThemedStyle();

  const baseClasses = `themed-panel relative ${className}`;

  // Kuroryuu sidebar: pillar borders
  if (variant === 'sidebar' && isKuroryuu) {
    return (
      <div className={`${baseClasses} flex`}>
        {/* Left pillar border */}
        <div
          className="w-6 flex-shrink-0 hidden lg:block"
          style={{
            backgroundImage: `url(${pillarVertical})`,
            backgroundSize: 'contain',
            backgroundRepeat: 'repeat-y',
            backgroundPosition: 'center',
            opacity: 0.6,
          }}
        />

        {/* Content area */}
        <div
          className="flex-1 relative"
          style={{
            backgroundColor: 'var(--sidebar-bg)',
          }}
        >
          {children}
        </div>

        {/* Right pillar border */}
        <div
          className="w-6 flex-shrink-0 hidden lg:block"
          style={{
            backgroundImage: `url(${pillarVertical})`,
            backgroundSize: 'contain',
            backgroundRepeat: 'repeat-y',
            backgroundPosition: 'center',
            opacity: 0.6,
            transform: 'scaleX(-1)',
          }}
        />
      </div>
    );
  }

  // Kuroryuu main panel: subtle parchment texture
  if (variant === 'main' && isKuroryuu) {
    return (
      <div className={`${baseClasses}`}>
        {/* Background texture */}
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            backgroundImage: `url(${dragonParchment})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.03,
          }}
        />
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  // Grunge panels: dark texture
  if (isGrunge && (variant === 'sidebar' || variant === 'main')) {
    return (
      <div className={`${baseClasses}`}>
        {/* Background texture */}
        <div
          className="absolute inset-0 pointer-events-none z-0"
          style={{
            backgroundImage: `url(${darkGrungeTexture})`,
            backgroundSize: 'cover',
            backgroundPosition: 'center',
            opacity: 0.06,
            mixBlendMode: 'overlay',
          }}
        />
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  // Floating panel (for modals/popovers)
  if (variant === 'floating') {
    return (
      <div
        className={`${baseClasses} bg-popover border border-border rounded-lg shadow-xl`}
        style={{
          boxShadow: isKuroryuu
            ? '0 8px 32px rgba(201, 162, 39, 0.15), 0 0 0 1px rgba(201, 162, 39, 0.1)'
            : isGrunge
            ? '0 8px 32px rgba(0, 0, 0, 0.5)'
            : undefined,
        }}
      >
        {children}
      </div>
    );
  }

  // Default simple panel
  return (
    <div className={`${baseClasses} bg-panel`}>
      {children}
    </div>
  );
}

export default ThemedPanel;
