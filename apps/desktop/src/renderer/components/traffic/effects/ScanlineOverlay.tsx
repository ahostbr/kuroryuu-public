/**
 * ScanlineOverlay - CRT scanline effect for retro theme
 * Creates authentic retro terminal atmosphere with:
 * - Horizontal scanlines
 * - Subtle flicker animation
 * - CRT screen curvature vignette
 *
 * Only renders when vizTheme is 'retro'
 */
import React from 'react';
import { useTrafficStore } from '../../../stores/traffic-store';

export function ScanlineOverlay() {
  const vizTheme = useTrafficStore((s) => s.vizTheme);

  // Only render for retro theme
  if (vizTheme !== 'retro') {
    return null;
  }

  return (
    <>
      {/* Scanlines */}
      <div className="scanline-overlay" />
      {/* CRT curvature vignette */}
      <div className="crt-effect" />
    </>
  );
}
