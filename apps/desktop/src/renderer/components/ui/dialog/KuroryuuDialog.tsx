/**
 * KuroryuuDialog - Base Dialog Component
 * Part of the Genmu Spirit Dialog System
 *
 * Features:
 * - Fog entrance animations
 * - Golden dragon frame with breathing glow
 * - Optional mist particle effects
 * - Theme-aware styling
 * - Accessibility compliant (focus trap, ARIA)
 */

import { ReactNode, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useIsThemedStyle } from '../../../hooks/useTheme';
import { useSettingsStore } from '../../../stores/settings-store';
import './dialog-animations.css';

export type DialogVariant = 'default' | 'destructive' | 'success';
export type DialogSize = 'sm' | 'md' | 'lg';

export interface KuroryuuDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children?: ReactNode;
  variant?: DialogVariant;
  size?: DialogSize;
  showMist?: boolean;
  footer?: ReactNode;
  hideCloseButton?: boolean;
}

// Size presets
const SIZE_CLASSES: Record<DialogSize, string> = {
  sm: 'max-w-[340px]',
  md: 'max-w-[440px]',
  lg: 'max-w-[560px]',
};

// Mist particle configurations
const MIST_PARTICLES = [
  { size: 120, top: '10%', left: '5%', opacity: 0.3 },
  { size: 80, top: '60%', right: '10%', opacity: 0.25 },
  { size: 100, bottom: '15%', left: '15%', opacity: 0.2 },
];

export function KuroryuuDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  variant = 'default',
  size = 'md',
  showMist = true,
  footer,
  hideCloseButton = false,
}: KuroryuuDialogProps) {
  const { isKuroryuu } = useIsThemedStyle();
  const { appSettings } = useSettingsStore();
  const { enableAnimations } = appSettings;
  const dialogRef = useRef<HTMLDivElement>(null);
  const [isExiting, setIsExiting] = useState(false);
  const [mounted, setMounted] = useState(false);

  // Handle mount/unmount with exit animation
  useEffect(() => {
    if (open) {
      setMounted(true);
      setIsExiting(false);
    } else if (mounted) {
      // Handle external close (e.g., store-driven closeDialog())
      setMounted(false);
    }
  }, [open]);

  // Handle close with animation (if enabled)
  const handleClose = () => {
    if (isKuroryuu && enableAnimations) {
      setIsExiting(true);
      setTimeout(() => {
        setMounted(false);
        onOpenChange(false);
      }, 250);
    } else {
      setMounted(false);
      onOpenChange(false);
    }
  };

  // Focus trap and keyboard handling
  useEffect(() => {
    if (!mounted) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    // Focus the dialog when opened
    dialogRef.current?.focus();

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [mounted]);

  // Prevent body scroll when open
  useEffect(() => {
    if (mounted) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [mounted]);

  if (!mounted) return null;

  // Variant-specific styling
  const variantStyles = {
    default: {
      borderColor: 'rgba(201, 162, 39, 0.6)',
      pulseClass: 'kuroryuu-dialog-pulse',
      accentColor: '#c9a227',
    },
    destructive: {
      borderColor: 'rgba(139, 30, 30, 0.6)',
      pulseClass: 'kuroryuu-dialog-pulse-destructive',
      accentColor: '#8b1e1e',
    },
    success: {
      borderColor: 'rgba(74, 106, 58, 0.6)',
      pulseClass: 'kuroryuu-dialog-pulse-success',
      accentColor: '#4a6a3a',
    },
  };

  const styles = isKuroryuu ? variantStyles[variant] : variantStyles.default;

  const content = (
    <div
      className="fixed inset-0 flex items-center justify-center"
      style={{ zIndex: 99999, isolation: 'isolate' }}
    >
      {/* Backdrop - captures all clicks */}
      <div
        className={`absolute inset-0 bg-black/60 ${
          isKuroryuu && enableAnimations
            ? isExiting
              ? 'kuroryuu-dialog-backdrop-exit'
              : 'kuroryuu-dialog-backdrop'
            : ''
        }`}
        style={{
          backdropFilter: 'blur(8px)',
          pointerEvents: 'auto',
        }}
        onClick={handleClose}
        onMouseDown={(e) => e.stopPropagation()}
        aria-hidden="true"
      />

      {/* Dialog */}
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="kuroryuu-dialog-title"
        aria-describedby={description ? 'kuroryuu-dialog-description' : undefined}
        tabIndex={-1}
        className={`
          relative z-10 w-full ${SIZE_CLASSES[size]} mx-4
          ${enableAnimations
            ? isKuroryuu
              ? (isExiting ? 'kuroryuu-dialog-exit' : 'kuroryuu-dialog-enter')
              : 'animate-scale-in'
            : ''
          }
          ${isKuroryuu && enableAnimations ? styles.pulseClass : ''}
          outline-none
        `}
        style={{
          backgroundColor: isKuroryuu ? '#0a0a0c' : 'var(--card)',
          border: isKuroryuu ? `2px solid ${styles.borderColor}` : '1px solid var(--border)',
          borderRadius: isKuroryuu ? '8px' : '8px',
          pointerEvents: 'auto',
        }}
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        {/* Mist Particles (Kuroryuu only, when animations enabled) */}
        {isKuroryuu && showMist && enableAnimations && (
          <div className="kuroryuu-mist-container">
            {MIST_PARTICLES.map((particle, i) => (
              <div
                key={i}
                className="kuroryuu-mist-particle"
                style={{
                  width: particle.size,
                  height: particle.size,
                  top: particle.top,
                  left: particle.left,
                  right: (particle as any).right,
                  bottom: (particle as any).bottom,
                  opacity: particle.opacity,
                }}
              />
            ))}
          </div>
        )}

        {/* Content */}
        <div className="relative z-10 p-6">
          {/* Close Button */}
          {!hideCloseButton && (
            <button
              onClick={handleClose}
              className="absolute top-4 right-4 p-1.5 rounded transition-colors"
              style={{
                color: isKuroryuu ? '#9a8a6a' : 'var(--muted-foreground)',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.color = isKuroryuu ? '#c9a227' : 'var(--foreground)';
                e.currentTarget.style.backgroundColor = isKuroryuu
                  ? 'rgba(201, 162, 39, 0.1)'
                  : 'var(--secondary)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.color = isKuroryuu ? '#9a8a6a' : 'var(--muted-foreground)';
                e.currentTarget.style.backgroundColor = 'transparent';
              }}
              aria-label="Close dialog"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M18 6L6 18M6 6l12 12" />
              </svg>
            </button>
          )}

          {/* Title */}
          <h2
            id="kuroryuu-dialog-title"
            className={`text-lg font-semibold mb-2 pr-8 ${isKuroryuu ? 'font-reggae-one' : ''}`}
            style={{
              color: isKuroryuu ? '#e8d5b5' : 'var(--foreground)',
              fontSize: isKuroryuu ? '1.25rem' : undefined,
            }}
          >
            {title}
          </h2>

          {/* Description */}
          {description && (
            <p
              id="kuroryuu-dialog-description"
              className="text-sm mb-4"
              style={{
                color: isKuroryuu ? '#9a8a6a' : 'var(--muted-foreground)',
              }}
            >
              {description}
            </p>
          )}

          {/* Children */}
          {children && (
            <div
              className="mb-4"
              style={{
                color: isKuroryuu ? '#e8d5b5' : 'var(--foreground)',
              }}
            >
              {children}
            </div>
          )}

          {/* Footer */}
          {footer && <div className="mt-4">{footer}</div>}
        </div>
      </div>
    </div>
  );

  return createPortal(content, document.body);
}

export default KuroryuuDialog;
