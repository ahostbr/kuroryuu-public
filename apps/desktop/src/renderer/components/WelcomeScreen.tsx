import React from 'react';
import { WelcomeHub } from './welcome';

/**
 * WelcomeScreen - Home Screen / Encyclopedia
 *
 * This component renders the interactive encyclopedia/help center that showcases
 * Kuroryuu's features and guides users through setup.
 *
 * Features:
 * - Guided Tour with hotspot overlays on screenshots
 * - Interactive Architecture Diagram
 * - LMStudio Setup Wizard
 * - Hero Video Montage (when available)
 * - Feature Deep-Dives
 *
 * See: Docs/Plans/atomic-twirling-parnas.md for implementation details
 */
export function WelcomeScreen() {
  return <WelcomeHub />;
}
