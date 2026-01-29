/**
 * ThemedCard - Theme-aware card component
 *
 * Wraps content with theme-specific styling:
 * - Kuroryuu: wooden scroll frame background
 * - Grunge: textured dark surface with grunge frame
 * - Others: standard CSS card styling
 */
import { ReactNode } from 'react';
import { useIsThemedStyle } from '../../hooks/useTheme';

// Asset imports
import cardFrameWood from '../../assets/themes/kuroryuu/frames/card-frame-wood.png';
import grungeSquareFrame from '../../assets/themes/grunge/frames/square-frame.png';
import grungePanelRect from '../../assets/themes/grunge/panels/panel-rect.png';

interface ThemedCardProps {
  children: ReactNode;
  variant?: 'default' | 'wood' | 'grunge' | 'simple';
  className?: string;
  onClick?: () => void;
  interactive?: boolean;
}

export function ThemedCard({
  children,
  variant = 'default',
  className = '',
  onClick,
  interactive = false,
}: ThemedCardProps) {
  const { isGrunge, isKuroryuu } = useIsThemedStyle();

  // Determine which variant to use based on theme
  const effectiveVariant = variant === 'default'
    ? (isKuroryuu ? 'wood' : isGrunge ? 'grunge' : 'simple')
    : variant;

  const baseClasses = `themed-card relative overflow-hidden ${className}`;
  const interactiveClasses = interactive
    ? 'cursor-pointer transition-transform hover:scale-[1.02] active:scale-[0.98]'
    : '';

  // Kuroryuu wooden frame variant
  if (effectiveVariant === 'wood' && isKuroryuu) {
    return (
      <div
        className={`${baseClasses} ${interactiveClasses}`}
        onClick={onClick}
        style={{
          backgroundImage: `url(${cardFrameWood})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          padding: '24px 20px',
        }}
      >
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  // Grunge textured variant
  if (effectiveVariant === 'grunge' && isGrunge) {
    return (
      <div
        className={`${baseClasses} ${interactiveClasses}`}
        onClick={onClick}
        style={{
          backgroundImage: `url(${grungePanelRect})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          padding: '16px',
        }}
      >
        <div className="relative z-10">{children}</div>
      </div>
    );
  }

  // Default CSS card
  return (
    <div
      className={`${baseClasses} ${interactiveClasses} bg-card border border-border rounded-lg p-4`}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

/**
 * ThemedCardHeader - Optional header for themed cards
 */
interface ThemedCardHeaderProps {
  children: ReactNode;
  className?: string;
}

export function ThemedCardHeader({ children, className = '' }: ThemedCardHeaderProps) {
  const { isKuroryuu } = useIsThemedStyle();

  return (
    <div
      className={`themed-card-header mb-3 pb-2 border-b ${className}`}
      style={{
        borderColor: isKuroryuu ? '#c9a227' : 'var(--border)',
        borderBottomWidth: isKuroryuu ? '2px' : '1px',
      }}
    >
      {children}
    </div>
  );
}

export default ThemedCard;
