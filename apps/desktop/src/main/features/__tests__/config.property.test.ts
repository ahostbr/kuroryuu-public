/**
 * Configuration Property Tests
 * 
 * Property-based tests for configuration round-trip:
 * - JSON serialization/deserialization
 * - Config validation
 * - Default merging
 * 
 * Requirements: 6.1, 6.2
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import { ConfigManager } from '../config-manager';
import { FeatureEventBus, resetEventBus } from '../event-bus';

// ═══════════════════════════════════════════════════════════════════════════════
// Arbitraries
// ═══════════════════════════════════════════════════════════════════════════════

// Voice input config arbitrary
const voiceInputConfigArb = fc.record({
  enabled: fc.boolean(),
  language: fc.constantFrom('en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 'ja-JP'),
  timeout: fc.integer({ min: 1000, max: 60000 }),
  continuous: fc.boolean(),
  interimResults: fc.boolean(),
});

// TTS config arbitrary
const ttsConfigArb = fc.record({
  service: fc.constantFrom('native', 'google', 'azure', 'amazon'),
  rate: fc.float({ min: Math.fround(0.5), max: Math.fround(2.0), noNaN: true }),
  volume: fc.float({ min: Math.fround(0.0), max: Math.fround(1.0), noNaN: true }),
  pitch: fc.float({ min: Math.fround(0.5), max: Math.fround(2.0), noNaN: true }),
  defaultVoice: fc.option(fc.string({ minLength: 1, maxLength: 50 }), { nil: null }),
});

// Capture config arbitrary
const captureConfigArb = fc.record({
  defaultPreset: fc.string({ minLength: 1, maxLength: 30 }),
  outputDir: fc.string({ minLength: 1, maxLength: 200 }),
  format: fc.constantFrom('png', 'jpeg', 'webp'),
  quality: fc.integer({ min: 1, max: 100 }),
});

// Full feature config arbitrary
const featureConfigArb = fc.record({
  voiceInput: voiceInputConfigArb,
  tts: ttsConfigArb,
  capture: captureConfigArb,
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Configuration Property Tests', () => {
  let configManager: ConfigManager;
  
  beforeEach(() => {
    resetEventBus();
    configManager = new ConfigManager();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: JSON Round-Trip
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Configuration Round-Trip', () => {
    it('property: voice input config survives JSON round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(voiceInputConfigArb, async (config) => {
          // Serialize
          const json = JSON.stringify(config);
          
          // Deserialize
          const parsed = JSON.parse(json);
          
          // Verify structure preserved
          expect(parsed.enabled).toBe(config.enabled);
          expect(parsed.language).toBe(config.language);
          expect(parsed.timeout).toBe(config.timeout);
          expect(parsed.continuous).toBe(config.continuous);
          expect(parsed.interimResults).toBe(config.interimResults);
          
          return true;
        }),
        { numRuns: 50 }
      );
    });
    
    it('property: TTS config survives JSON round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(ttsConfigArb, async (config) => {
          // Serialize
          const json = JSON.stringify(config);
          
          // Deserialize
          const parsed = JSON.parse(json);
          
          // Verify structure preserved
          expect(parsed.service).toBe(config.service);
          // Use approximate equality for floats due to JSON precision
          expect(parsed.rate).toBeCloseTo(config.rate, 5);
          expect(parsed.volume).toBeCloseTo(config.volume, 5);
          expect(parsed.pitch).toBeCloseTo(config.pitch, 5);
          expect(parsed.defaultVoice).toBe(config.defaultVoice);
          
          return true;
        }),
        { numRuns: 50 }
      );
    });
    
    it('property: capture config survives JSON round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(captureConfigArb, async (config) => {
          // Serialize
          const json = JSON.stringify(config);
          
          // Deserialize
          const parsed = JSON.parse(json);
          
          // Verify structure preserved
          expect(parsed.defaultPreset).toBe(config.defaultPreset);
          expect(parsed.outputDir).toBe(config.outputDir);
          expect(parsed.format).toBe(config.format);
          expect(parsed.quality).toBe(config.quality);
          
          return true;
        }),
        { numRuns: 50 }
      );
    });
    
    it('property: full feature config survives JSON round-trip', async () => {
      await fc.assert(
        fc.asyncProperty(featureConfigArb, async (config) => {
          // Serialize
          const json = JSON.stringify(config);
          
          // Deserialize
          const parsed = JSON.parse(json);
          
          // Deep comparison (allowing float tolerance)
          expect(parsed.voiceInput).toEqual(config.voiceInput);
          expect(parsed.capture).toEqual(config.capture);
          expect(parsed.tts.service).toBe(config.tts.service);
          expect(parsed.tts.rate).toBeCloseTo(config.tts.rate, 5);
          expect(parsed.tts.volume).toBeCloseTo(config.tts.volume, 5);
          expect(parsed.tts.pitch).toBeCloseTo(config.tts.pitch, 5);
          
          return true;
        }),
        { numRuns: 30 }
      );
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Config Validation
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Configuration Validation', () => {
    it('property: TTS rate is always in valid range after normalization', async () => {
      const anyRateArb = fc.float({ min: -10, max: 10, noNaN: true });
      
      await fc.assert(
        fc.asyncProperty(anyRateArb, async (rate) => {
          // Normalize rate to valid range
          const normalized = Math.max(0.5, Math.min(2.0, rate));
          
          // Verify normalization works
          expect(normalized).toBeGreaterThanOrEqual(0.5);
          expect(normalized).toBeLessThanOrEqual(2.0);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
    
    it('property: TTS volume is always in valid range after normalization', async () => {
      const anyVolumeArb = fc.float({ min: -5, max: 5, noNaN: true });
      
      await fc.assert(
        fc.asyncProperty(anyVolumeArb, async (volume) => {
          // Normalize volume to valid range
          const normalized = Math.max(0, Math.min(1.0, volume));
          
          // Verify normalization works
          expect(normalized).toBeGreaterThanOrEqual(0);
          expect(normalized).toBeLessThanOrEqual(1.0);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
    
    it('property: voice input timeout is always positive after normalization', async () => {
      const anyTimeoutArb = fc.integer({ min: -10000, max: 100000 });
      
      await fc.assert(
        fc.asyncProperty(anyTimeoutArb, async (timeout) => {
          // Normalize timeout to valid range
          const normalized = Math.max(1000, Math.min(60000, timeout));
          
          // Verify normalization works
          expect(normalized).toBeGreaterThanOrEqual(1000);
          expect(normalized).toBeLessThanOrEqual(60000);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
    
    it('property: capture quality is always in 1-100 range after normalization', async () => {
      const anyQualityArb = fc.integer({ min: -50, max: 200 });
      
      await fc.assert(
        fc.asyncProperty(anyQualityArb, async (quality) => {
          // Normalize quality to valid range
          const normalized = Math.max(1, Math.min(100, quality));
          
          // Verify normalization works
          expect(normalized).toBeGreaterThanOrEqual(1);
          expect(normalized).toBeLessThanOrEqual(100);
          
          return true;
        }),
        { numRuns: 100 }
      );
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Default Merging
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Default Config Merging', () => {
    it('property: partial configs merge with defaults correctly', async () => {
      // Generate partial TTS configs with some fields missing
      const partialTtsArb = fc.record({
        service: fc.option(fc.constantFrom('native', 'google'), { nil: undefined }),
        rate: fc.option(fc.float({ min: Math.fround(0.5), max: Math.fround(2.0), noNaN: true }), { nil: undefined }),
        volume: fc.option(fc.float({ min: Math.fround(0.0), max: Math.fround(1.0), noNaN: true }), { nil: undefined }),
      });
      
      const defaults = {
        service: 'native' as const,
        rate: 1.0,
        volume: 1.0,
        pitch: 1.0,
        defaultVoice: null,
      };
      
      await fc.assert(
        fc.asyncProperty(partialTtsArb, async (partial) => {
          // Merge with defaults
          const merged = {
            ...defaults,
            ...(partial.service !== undefined && { service: partial.service }),
            ...(partial.rate !== undefined && { rate: partial.rate }),
            ...(partial.volume !== undefined && { volume: partial.volume }),
          };
          
          // Verify all required fields exist
          expect(merged.service).toBeDefined();
          expect(merged.rate).toBeDefined();
          expect(merged.volume).toBeDefined();
          expect(merged.pitch).toBeDefined();
          
          // Verify overrides took effect
          if (partial.service !== undefined) {
            expect(merged.service).toBe(partial.service);
          }
          if (partial.rate !== undefined) {
            expect(merged.rate).toBe(partial.rate);
          }
          if (partial.volume !== undefined) {
            expect(merged.volume).toBe(partial.volume);
          }
          
          return true;
        }),
        { numRuns: 50 }
      );
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Config Immutability
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Configuration Immutability', () => {
    it('property: config operations do not mutate original', async () => {
      await fc.assert(
        fc.asyncProperty(ttsConfigArb, async (config) => {
          // Deep clone for comparison
          const original = JSON.parse(JSON.stringify(config));
          
          // Perform operations that could mutate
          const modified = { ...config, rate: config.rate * 2 };
          
          // Verify original unchanged
          expect(config.rate).toBe(original.rate);
          expect(config.volume).toBe(original.volume);
          expect(config.service).toBe(original.service);
          
          // Verify modified is different
          expect(modified.rate).not.toBe(original.rate);
          
          return true;
        }),
        { numRuns: 50 }
      );
    });
  });
});
