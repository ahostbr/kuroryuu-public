/**
 * MatrixParticles - Matrix rain background effect
 * Creates ambient cyberpunk atmosphere with falling characters
 *
 * Only renders when:
 * - vizTheme is 'cyberpunk'
 * - Global app theme is NOT 'matrix' (avoid double matrix rain)
 */
import React, { useEffect, useRef } from 'react';
import { useSettingsStore } from '../../../stores/settings-store';
import { useTrafficStore } from '../../../stores/traffic-store';

export function MatrixParticles() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const appTheme = useSettingsStore((s) => s.appSettings.theme);
  const vizTheme = useTrafficStore((s) => s.vizTheme);

  // Determine if effect should be active
  const isActive = appTheme !== 'matrix' && vizTheme === 'cyberpunk';

  useEffect(() => {
    // Skip effect if not active
    if (!isActive) return;

    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    // Set canvas size to window size
    const resizeCanvas = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
    };
    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    // Matrix characters (binary + Japanese katakana)
    const chars = '01アイウエオカキクケコサシスセソタチツテトナニヌネノハヒフヘホマミムメモヤユヨラリルレロワヲン';
    const fontSize = 14;
    const columns = Math.floor(canvas.width / fontSize);
    const drops: number[] = Array(columns).fill(0);

    // Initialize drops at random positions
    for (let i = 0; i < drops.length; i++) {
      drops[i] = Math.floor(Math.random() * -100);
    }

    function draw() {
      if (!ctx || !canvas) return;

      // Semi-transparent black to create fade effect
      ctx.fillStyle = 'rgba(0, 0, 0, 0.05)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Green text
      ctx.fillStyle = '#0f0';
      ctx.font = `${fontSize}px monospace`;

      for (let i = 0; i < drops.length; i++) {
        // Pick random character
        const char = chars[Math.floor(Math.random() * chars.length)];

        // Draw character
        ctx.fillText(char, i * fontSize, drops[i] * fontSize);

        // Reset drop to top when it reaches bottom
        if (drops[i] * fontSize > canvas.height && Math.random() > 0.975) {
          drops[i] = 0;
        }

        // Move drop down
        drops[i]++;
      }
    }

    // Animation loop
    const interval = setInterval(draw, 50);

    return () => {
      clearInterval(interval);
      window.removeEventListener('resize', resizeCanvas);
    };
  }, [isActive]);

  // Don't render if global Matrix theme is active or not cyberpunk viz theme
  if (!isActive) {
    return null;
  }

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none opacity-10"
      style={{ zIndex: 0 }}
    />
  );
}
