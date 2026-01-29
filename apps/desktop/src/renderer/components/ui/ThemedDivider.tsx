/**
 * ThemedDivider - Theme-aware horizontal divider
 *
 * Renders theme-specific divider images when available:
 * - Kuroryuu: ornate gold divider
 * - Grunge: brush stroke divider
 * - Others: standard CSS border
 */
import { useIsThemedStyle } from '../../hooks/useTheme';

// Asset imports
import grungeBrushStroke from '../../assets/themes/grunge/dividers/brush-stroke.png';
import grungeLine from '../../assets/themes/grunge/dividers/grunge-line.png';

interface ThemedDividerProps {
  variant?: 'default' | 'brush' | 'subtle';
  className?: string;
}

export function ThemedDivider({ variant = 'default', className = '' }: ThemedDividerProps) {
  const { isGrunge, isKuroryuu } = useIsThemedStyle();

  // Grunge theme: use image dividers
  if (isGrunge) {
    const imageSrc = variant === 'brush' ? grungeBrushStroke : grungeLine;
    return (
      <div className={`themed-divider grunge ${className}`}>
        <img
          src={imageSrc}
          alt=""
          className="w-full h-auto opacity-60 object-contain"
          style={{ maxHeight: '12px' }}
        />
      </div>
    );
  }

  // Kuroryuu theme: gold ornate line (CSS for now, can add image later)
  if (isKuroryuu) {
    return (
      <div className={`themed-divider kuroryuu ${className}`}>
        <div
          className="w-full h-px"
          style={{
            background: 'linear-gradient(90deg, transparent 0%, #c9a227 20%, #c9a227 80%, transparent 100%)',
            boxShadow: '0 0 4px rgba(201, 162, 39, 0.3)',
          }}
        />
      </div>
    );
  }

  // Default: CSS border
  return (
    <hr className={`themed-divider border-t border-border ${className}`} />
  );
}

export default ThemedDivider;
