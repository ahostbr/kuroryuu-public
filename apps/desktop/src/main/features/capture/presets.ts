/**
 * Capture Presets - Default Configurations
 * 
 * Default preset configurations for video capture.
 * These match the presets defined in the config-manager but provide
 * standalone access for the capture module.
 * 
 * Requirements: 1.6
 */

import { CapturePreset } from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Default Presets
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * OPTIMAL_BALANCED_444
 * Full quality yuv444p for maximum color fidelity
 * Best for: Code/text capture where color accuracy matters
 */
export const OPTIMAL_BALANCED_444: CapturePreset = {
  key: 'OPTIMAL_BALANCED_444',
  name: 'Optimal Balanced (4:4:4)',
  description: 'Full color fidelity, ideal for code/text capture',
  fps: 30,
  codec: 'libx264',
  pixelFormat: 'yuv444p',
  crf: 18,
};

/**
 * CRISP_MAX_444
 * Maximum quality yuv444p for pristine output
 * Best for: Final recordings, presentations
 */
export const CRISP_MAX_444: CapturePreset = {
  key: 'CRISP_MAX_444',
  name: 'Crisp Maximum (4:4:4)',
  description: 'Maximum quality, larger files',
  fps: 60,
  codec: 'libx264',
  pixelFormat: 'yuv444p',
  crf: 12,
};

/**
 * BALANCED_420
 * Standard yuv420p for compatibility
 * Best for: Sharing, streaming, general use
 */
export const BALANCED_420: CapturePreset = {
  key: 'BALANCED_420',
  name: 'Balanced (4:2:0)',
  description: 'Standard quality, good compatibility',
  fps: 30,
  codec: 'libx264',
  pixelFormat: 'yuv420p',
  crf: 20,
};

/**
 * TINY_1080P
 * Forced 1080p for small file sizes
 * Best for: Long recordings, limited storage
 */
export const TINY_1080P: CapturePreset = {
  key: 'TINY_1080P',
  name: 'Tiny 1080p',
  description: 'Small files, forced 1080p resolution',
  fps: 24,
  codec: 'libx264',
  pixelFormat: 'yuv420p',
  crf: 28,
  resolution: '1920x1080',
};

/**
 * PRIMARY_ONLY
 * Primary monitor capture only
 * Best for: Single monitor focus
 */
export const PRIMARY_ONLY: CapturePreset = {
  key: 'PRIMARY_ONLY',
  name: 'Primary Monitor Only',
  description: 'Capture primary monitor at balanced quality',
  fps: 30,
  codec: 'libx264',
  pixelFormat: 'yuv420p',
  crf: 20,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Preset Collection
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * All default presets
 */
export const DEFAULT_PRESETS: CapturePreset[] = [
  OPTIMAL_BALANCED_444,
  CRISP_MAX_444,
  BALANCED_420,
  TINY_1080P,
  PRIMARY_ONLY,
];

/**
 * Get preset by key
 */
export function getPresetByKey(key: string): CapturePreset | undefined {
  return DEFAULT_PRESETS.find(p => p.key === key);
}

/**
 * Get default preset (OPTIMAL_BALANCED_444)
 */
export function getDefaultPreset(): CapturePreset {
  return OPTIMAL_BALANCED_444;
}

/**
 * Validate preset has all required fields
 */
export function validatePreset(preset: Partial<CapturePreset>): preset is CapturePreset {
  return !!(
    preset.key &&
    preset.name &&
    preset.description &&
    typeof preset.fps === 'number' &&
    preset.codec &&
    preset.pixelFormat &&
    typeof preset.crf === 'number'
  );
}
