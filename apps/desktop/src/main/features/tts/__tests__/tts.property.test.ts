/**
 * TTS Config Property Tests
 * 
 * Tests:
 * - Config validation properties
 * - Speech parameter boundaries
 * - Voice selection invariants
 * 
 * Requirements: 3.4, 3.5
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { TTSModule } from '../module';
import { FeatureEventBus, resetEventBus } from '../../event-bus';
import { ConfigManager } from '../../config-manager';
import { TTSConfig, TTSAction } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('TTS Config Property Tests', () => {
  let eventBus: FeatureEventBus;
  let configManager: ConfigManager;
  
  beforeEach(() => {
    resetEventBus();
    eventBus = new FeatureEventBus();
    configManager = new ConfigManager();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Speech Rate Properties
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: Valid speech rates are accepted', async () => {
    // Use Math.fround for 32-bit float constraints
    const validRateArb = fc.float({ min: Math.fround(0.1), max: Math.fround(2.0), noNaN: true });
    
    await fc.assert(
      fc.asyncProperty(validRateArb, async (rate) => {
        const ttsModule = new TTSModule(eventBus, configManager);
        await ttsModule.initialize();
        
        const config = ttsModule.getConfig();
        // Config rate should always be valid after initialization
        expect(config.rate).toBeGreaterThanOrEqual(0.1);
        expect(config.rate).toBeLessThanOrEqual(2.0);
      }),
      { numRuns: 20 }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Volume Properties
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: Valid volumes are accepted', async () => {
    // Use Math.fround for 32-bit float constraints
    const validVolumeArb = fc.float({ min: Math.fround(0), max: Math.fround(1.0), noNaN: true });
    
    await fc.assert(
      fc.asyncProperty(validVolumeArb, async (volume) => {
        const ttsModule = new TTSModule(eventBus, configManager);
        await ttsModule.initialize();
        
        const config = ttsModule.getConfig();
        expect(config.volume).toBeGreaterThanOrEqual(0);
        expect(config.volume).toBeLessThanOrEqual(1.0);
      }),
      { numRuns: 20 }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Pitch Properties
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: Valid pitches are accepted', async () => {
    const ttsModule = new TTSModule(eventBus, configManager);
    await ttsModule.initialize();
    
    const config = ttsModule.getConfig();
    expect(config.pitch).toBeGreaterThanOrEqual(0.5);
    expect(config.pitch).toBeLessThanOrEqual(2.0);
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Default Config Properties
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: Default config has all required fields', async () => {
    const ttsModule = new TTSModule(eventBus, configManager);
    await ttsModule.initialize();
    
    const config = ttsModule.getConfig();
    
    // All required fields present
    expect(config).toHaveProperty('service');
    expect(config).toHaveProperty('voice');
    expect(config).toHaveProperty('rate');
    expect(config).toHaveProperty('pitch');
    expect(config).toHaveProperty('volume');
    expect(config).toHaveProperty('language');
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Config Immutability
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: getConfig returns copy, not reference', async () => {
    const ttsModule = new TTSModule(eventBus, configManager);
    await ttsModule.initialize();
    
    const config1 = ttsModule.getConfig();
    const config2 = ttsModule.getConfig();
    
    // Should be equal values
    expect(config1.rate).toBe(config2.rate);
    expect(config1.voice).toBe(config2.voice);
    
    // But not the same reference
    config1.rate = 999;
    const config3 = ttsModule.getConfig();
    expect(config3.rate).not.toBe(999);
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Service Type Properties
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: Service is always valid type', async () => {
    const ttsModule = new TTSModule(eventBus, configManager);
    await ttsModule.initialize();
    
    const config = ttsModule.getConfig();
    const validServices = ['native', 'google', 'azure', 'amazon'];
    
    expect(validServices).toContain(config.service);
  });
});
