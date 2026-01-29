/**
 * Matrix Digital Rain Effect
 *
 * Authentic Matrix-style falling code animation.
 * Only renders when Matrix theme is active.
 * Uses half-width katakana + numbers like the original film.
 */
import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../stores/settings-store';

// Matrix characters: half-width katakana + numbers + some latin
const MATRIX_CHARS = 'ｱｲｳｴｵｶｷｸｹｺｻｼｽｾｿﾀﾁﾂﾃﾄﾅﾆﾇﾈﾉﾊﾋﾌﾍﾎﾏﾐﾑﾒﾓﾔﾕﾖﾗﾘﾙﾚﾛﾜﾝ0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

interface Drop {
  x: number;
  y: number;
  speed: number;
  chars: string[];
  length: number;
}

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useSettingsStore((s) => s.appSettings.theme);
  const rainOpacity = useSettingsStore((s) => s.appSettings.matrixRainOpacity);
  const animationRef = useRef<number | undefined>(undefined);
  const dropsRef = useRef<Drop[]>([]);
  const isMatrix = theme === 'matrix';

  useEffect(() => {
    // Only run animation for Matrix theme
    if (!isMatrix) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Store logical dimensions for calculations
    let logicalWidth = window.innerWidth;
    let logicalHeight = window.innerHeight;

    // Set canvas size with HiDPI support
    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      logicalWidth = window.innerWidth;
      logicalHeight = window.innerHeight;

      // Set actual canvas size scaled for device pixel ratio
      canvas.width = logicalWidth * dpr;
      canvas.height = logicalHeight * dpr;

      // Scale canvas back down with CSS for crisp rendering
      canvas.style.width = `${logicalWidth}px`;
      canvas.style.height = `${logicalHeight}px`;

      // Scale context to match DPR
      ctx.scale(dpr, dpr);

      initDrops();
    };

    // Initialize drops
    const initDrops = () => {
      const columns = Math.floor(logicalWidth / 20);
      dropsRef.current = [];

      for (let i = 0; i < columns; i++) {
        dropsRef.current.push(createDrop(i * 20));
      }
    };

    // Create a single drop
    const createDrop = (x: number): Drop => {
      const length = Math.floor(Math.random() * 15) + 5;
      const chars: string[] = [];
      for (let i = 0; i < length; i++) {
        chars.push(MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)]);
      }
      return {
        x,
        y: Math.random() * -500,
        speed: Math.random() * 2 + 1,
        chars,
        length,
      };
    };

    // Animation loop
    const animate = () => {
      // Semi-transparent black for trail effect
      ctx.fillStyle = 'rgba(13, 2, 8, 0.05)';
      ctx.fillRect(0, 0, logicalWidth, logicalHeight);

      ctx.font = '15px monospace';

      dropsRef.current.forEach((drop, index) => {
        // Draw each character in the drop
        drop.chars.forEach((char, charIndex) => {
          const y = drop.y - charIndex * 20;

          if (y > 0 && y < logicalHeight) {
            // Head character is brightest
            if (charIndex === 0) {
              ctx.fillStyle = '#FFFFFF';
            } else if (charIndex < 3) {
              ctx.fillStyle = '#00FF41';
            } else {
              // Fade out towards tail
              const alpha = Math.max(0.1, 1 - (charIndex / drop.length));
              ctx.fillStyle = `rgba(0, 255, 65, ${alpha})`;
            }

            ctx.fillText(char, drop.x, y);
          }

          // Randomly change characters
          if (Math.random() < 0.02) {
            drop.chars[charIndex] = MATRIX_CHARS[Math.floor(Math.random() * MATRIX_CHARS.length)];
          }
        });

        // Move drop down
        drop.y += drop.speed;

        // Reset drop when it goes off screen
        if (drop.y - drop.length * 20 > logicalHeight) {
          dropsRef.current[index] = createDrop(drop.x);
        }
      });

      animationRef.current = requestAnimationFrame(animate);
    };

    resize();
    window.addEventListener('resize', resize);
    animate();

    return () => {
      window.removeEventListener('resize', resize);
      if (animationRef.current) {
        cancelAnimationFrame(animationRef.current);
      }
    };
  }, [isMatrix]);

  // Only render canvas for Matrix theme
  if (!isMatrix) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ opacity: (rainOpacity || 40) / 100, zIndex: 1 }}
    />
  );
}
