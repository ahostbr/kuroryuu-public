/**
 * Matrix Digital Rain Effect (from LiteSuite)
 *
 * Column-based falling code with fade trails.
 * Uses half-width katakana + hex like the original film.
 * Only renders when Matrix theme is active.
 * Opacity controlled via settings store matrixRainOpacity (0-100).
 */
import { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../stores/settings-store';

const CHARS =
  'アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン0123456789ABCDEF';
const FONT_SIZE = 14;
const FADE_ALPHA = 0.05;

export function MatrixRain() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const theme = useSettingsStore((s) => s.appSettings.theme);
  const rainOpacity = useSettingsStore((s) => s.appSettings.matrixRainOpacity);
  const isMatrix = theme === 'matrix';

  useEffect(() => {
    if (!isMatrix) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    let animId: number;
    let columns: number[] = [];

    const resize = () => {
      const dpr = window.devicePixelRatio || 1;
      const w = window.innerWidth;
      const h = window.innerHeight;
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const colCount = Math.floor(w / FONT_SIZE);
      const newColumns = new Array(colCount);
      for (let i = 0; i < colCount; i++) {
        newColumns[i] = columns[i] ?? Math.random() * -100;
      }
      columns = newColumns as number[];
    };

    resize();
    window.addEventListener('resize', resize);

    const draw = () => {
      const w = window.innerWidth;
      const h = window.innerHeight;

      ctx.fillStyle = `rgba(0, 0, 0, ${FADE_ALPHA})`;
      ctx.fillRect(0, 0, w, h);

      ctx.font = `${FONT_SIZE}px monospace`;

      for (let i = 0; i < columns.length; i++) {
        const char = CHARS.charAt(Math.floor(Math.random() * CHARS.length));
        const x = i * FONT_SIZE;
        const column = columns[i] ?? 0;
        const y = column * FONT_SIZE;

        if (y > 0) {
          ctx.fillStyle = '#aaffaa';
          ctx.fillText(char, x, y);

          if (y - FONT_SIZE > 0) {
            const trailChar = CHARS.charAt(Math.floor(Math.random() * CHARS.length));
            ctx.fillStyle = '#33ff33';
            ctx.fillText(trailChar, x, y - FONT_SIZE);
          }
        }

        columns[i] = column + 1;

        if (y > h && Math.random() > 0.975) {
          columns[i] = Math.random() * -20;
        }
      }

      animId = requestAnimationFrame(draw);
    };

    animId = requestAnimationFrame(draw);

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, [isMatrix]);

  if (!isMatrix) return null;

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none"
      style={{ opacity: (rainOpacity || 40) / 100, zIndex: 1 }}
    />
  );
}
