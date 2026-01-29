/**
 * ThemedFrame - Theme-aware decorative frame wrapper
 *
 * Renders ornate image-based frames for themed content:
 * - Kuroryuu: dragon frames (opt-in, modal-optimized 1000x1000 square images)
 * - Grunge: distressed square frames using background-image
 * - Others: standard CSS borders
 *
 * Kuroryuu frames use background-size: cover with square-cropped images
 * Grunge frames use background-size: 100% 100% (simpler frames)
 */
import { ReactNode } from 'react';
import { useIsThemedStyle } from '../../hooks/useTheme';
import { useSettingsStore } from '../../stores/settings-store';

// Asset imports - Kuroryuu frames (modal-optimized square versions)
import dialogFrame from '../../assets/themes/kuroryuu/frames/dialog-frame-modal.png';
import cardFrameWood from '../../assets/themes/kuroryuu/frames/card-frame-wood-modal.png';

// Asset imports - Grunge frames
import grungeSquareFrame from '../../assets/themes/grunge/frames/square-frame.png';
import grungeCircleFrame from '../../assets/themes/grunge/frames/circle-frame.png';

type FrameVariant = 'dragon' | 'wood' | 'scroll' | 'grunge-square' | 'grunge-circle' | 'simple';
type FrameSize = 'sm' | 'md' | 'lg' | 'full';

interface ThemedFrameProps {
  children: ReactNode;
  variant?: FrameVariant;
  size?: FrameSize;
  className?: string;
  contentClassName?: string;
}

// Padding presets for different frame sizes (accounts for frame border thickness)
const FRAME_PADDING: Record<FrameSize, string> = {
  sm: '16px 12px',
  md: '24px 20px',
  lg: '32px 28px',
  full: '40px 36px',
};

// Content padding inside frame (inner area) - reduced for border-image approach
const CONTENT_PADDING: Record<FrameVariant, Record<FrameSize, string>> = {
  dragon: { sm: '16px', md: '20px', lg: '24px', full: '28px' },
  wood: { sm: '12px', md: '16px', lg: '20px', full: '24px' },
  scroll: { sm: '12px', md: '16px', lg: '20px', full: '24px' },
  'grunge-square': { sm: '20px', md: '28px', lg: '36px', full: '44px' },
  'grunge-circle': { sm: '30px', md: '40px', lg: '50px', full: '60px' },
  simple: { sm: '12px', md: '16px', lg: '20px', full: '24px' },
};

export function ThemedFrame({
  children,
  variant = 'dragon',
  size = 'md',
  className = '',
  contentClassName = '',
}: ThemedFrameProps) {
  const { isGrunge, isKuroryuu } = useIsThemedStyle();
  const { appSettings } = useSettingsStore();

  // Check if Kuroryuu decorative frames are enabled (opt-in)
  const kuroryuuFramesEnabled = isKuroryuu && appSettings.kuroryuuDecorativeFrames;

  // Determine which frame to use based on theme and variant
  const getFrameImage = (): string | null => {
    if (kuroryuuFramesEnabled) {
      switch (variant) {
        case 'dragon':
          return dialogFrame;
        case 'wood':
        case 'scroll':
          return cardFrameWood;
        default:
          return dialogFrame;
      }
    }

    if (isGrunge) {
      switch (variant) {
        case 'grunge-square':
        case 'dragon':
        case 'wood':
          return grungeSquareFrame;
        case 'grunge-circle':
          return grungeCircleFrame;
        default:
          return grungeSquareFrame;
      }
    }

    return null; // No image frame for other themes
  };

  const frameImage = getFrameImage();
  const padding = CONTENT_PADDING[variant]?.[size] || CONTENT_PADDING.simple[size];

  // Render Kuroryuu frame - artistic frames with preserved aspect ratio
  // These are full artistic compositions, not 9-slice tiles, so we use cover/contain
  if (frameImage && kuroryuuFramesEnabled) {
    return (
      <div
        className={`themed-frame ${variant} ${className}`}
        style={{
          position: 'relative',
          backgroundImage: `url(${frameImage})`,
          backgroundSize: 'cover',
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          padding,
        }}
      >
        <div className={`themed-frame-content ${contentClassName}`}>
          {children}
        </div>
      </div>
    );
  }

  // Render Grunge frame with background-image (simpler frames)
  if (frameImage && isGrunge) {
    return (
      <div
        className={`themed-frame ${variant} ${className}`}
        style={{
          backgroundImage: `url(${frameImage})`,
          backgroundSize: '100% 100%',
          backgroundRepeat: 'no-repeat',
          backgroundPosition: 'center',
          padding,
        }}
      >
        <div className={`themed-frame-content ${contentClassName}`}>
          {children}
        </div>
      </div>
    );
  }

  // Default CSS frame for other themes
  return (
    <div
      className={`themed-frame simple bg-card border border-border rounded-lg ${className}`}
      style={{ padding: FRAME_PADDING[size] }}
    >
      <div className={contentClassName}>{children}</div>
    </div>
  );
}

/**
 * ThemedDialogFrame - Pre-configured frame for modal dialogs
 */
interface ThemedDialogFrameProps {
  children: ReactNode;
  className?: string;
  onClose?: () => void;
}

export function ThemedDialogFrame({
  children,
  className = '',
  onClose,
}: ThemedDialogFrameProps) {
  const { isKuroryuu, isGrunge } = useIsThemedStyle();

  return (
    <ThemedFrame
      variant={isKuroryuu ? 'dragon' : isGrunge ? 'grunge-square' : 'simple'}
      size="lg"
      className={`themed-dialog-frame min-w-[400px] max-w-[90vw] ${className}`}
    >
      {onClose && (
        <button
          onClick={onClose}
          className="absolute top-4 right-4 p-2 rounded-full hover:bg-secondary transition-colors"
          style={{
            color: isKuroryuu ? '#c9a227' : 'var(--muted-foreground)',
          }}
        >
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M18 6L6 18M6 6l12 12" />
          </svg>
        </button>
      )}
      {children}
    </ThemedFrame>
  );
}

export default ThemedFrame;
