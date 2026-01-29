/**
 * Voice Input Events Property Tests
 * 
 * Tests:
 * - Event ordering guarantees
 * - State transitions
 * - Error handling invariants
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.9
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { VoiceInputModule } from '../module';
import { FeatureEventBus, resetEventBus } from '../../event-bus';
import { ConfigManager } from '../../config-manager';
import { VoiceInputAction } from '../types';

// ═══════════════════════════════════════════════════════════════════════════════
// Test Setup
// ═══════════════════════════════════════════════════════════════════════════════

describe('Voice Input Events Property Tests', () => {
  let voiceModule: VoiceInputModule;
  let eventBus: FeatureEventBus;
  let configManager: ConfigManager;
  
  beforeEach(async () => {
    resetEventBus();
    eventBus = new FeatureEventBus();
    configManager = new ConfigManager();
    voiceModule = new VoiceInputModule(eventBus, configManager);
    await voiceModule.initialize();
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Action Arbitraries
  // ─────────────────────────────────────────────────────────────────────────────
  
  // Exclude start_listening as it blocks waiting for speech
  const safeActionArb = fc.constantFrom<VoiceInputAction>(
    'stop_listening',
    'get_status',
    'check_microphone'
  );
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Module Always Returns Valid Result Structure
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: Execute always returns valid result structure', async () => {
    await fc.assert(
      fc.asyncProperty(safeActionArb, async (action) => {
        const result = await voiceModule.execute(action, {});

        // Result must have ok property
        expect(result).toHaveProperty('ok');
        expect(typeof result.ok).toBe('boolean');

        // If failed, must have error
        if (!result.ok) {
          expect(result.error).toBeDefined();
          expect(result.errorCode).toBeDefined();
        }
      }),
      { numRuns: 50 }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: get_status Always Succeeds
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: get_status always succeeds after initialization', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10 }), async (times) => {
        for (let i = 0; i < times; i++) {
          const result = await voiceModule.execute('get_status', {});

          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.result).toHaveProperty('isListening');
          }
        }
      }),
      { numRuns: 20 }
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Property: check_microphone Always Succeeds
  // ─────────────────────────────────────────────────────────────────────────────

  it('Property: check_microphone always succeeds', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 10 }), async (times) => {
        for (let i = 0; i < times; i++) {
          const result = await voiceModule.execute('check_microphone', {});

          expect(result.ok).toBe(true);
          if (result.ok) {
            expect(result.result).toHaveProperty('available');
          }
        }
      }),
      { numRuns: 20 }
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Property: stop_listening Without Start Fails Gracefully
  // ─────────────────────────────────────────────────────────────────────────────

  it('Property: stop_listening without active session fails with correct error', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 5 }), async (times) => {
        for (let i = 0; i < times; i++) {
          const result = await voiceModule.execute('stop_listening', {});

          expect(result.ok).toBe(false);
          if (!result.ok) {
            expect(result.errorCode).toBe('NO_ACTIVE_VOICE_INPUT');
          }
        }
      }),
      { numRuns: 10 }
    );
  });

  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Invalid Actions Always Fail
  // ─────────────────────────────────────────────────────────────────────────────

  it('Property: Invalid actions always fail with ACTION_NOT_SUPPORTED', async () => {
    const invalidActionArb = fc.string({ minLength: 1, maxLength: 50 })
      .filter(s => !['start_listening', 'stop_listening', 'get_status', 'check_microphone'].includes(s));

    await fc.assert(
      fc.asyncProperty(invalidActionArb, async (action) => {
        const result = await voiceModule.execute(action, {});

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errorCode).toBe('ACTION_NOT_SUPPORTED');
        }
      }),
      { numRuns: 50 }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Status Reflects Module State
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: Status reflects current module state consistently', async () => {
    // Multiple status checks should return consistent state
    const results = [];
    
    for (let i = 0; i < 5; i++) {
      const result = await voiceModule.execute('get_status', {});
      results.push(result);
    }
    
    // All should have same isListening value
    const isListeningValues = results.map(r => r.ok ? (r.result as any)?.isListening : undefined);
    const allSame = isListeningValues.every(v => v === isListeningValues[0]);
    
    expect(allSame).toBe(true);
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Module Metadata Never Changes
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: Module metadata is immutable', async () => {
    const metadata1 = voiceModule.getMetadata();
    
    // Execute some actions
    await voiceModule.execute('get_status', {});
    await voiceModule.execute('check_microphone', {});
    
    const metadata2 = voiceModule.getMetadata();
    
    expect(metadata1.id).toBe(metadata2.id);
    expect(metadata1.name).toBe(metadata2.name);
    expect(metadata1.version).toBe(metadata2.version);
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Supported Actions Are Fixed
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: Supported actions list is fixed', () => {
    const actions1 = voiceModule.getSupportedActions();
    const actions2 = voiceModule.getSupportedActions();
    
    expect(actions1.length).toBe(actions2.length);
    expect(actions1.sort()).toEqual(actions2.sort());
    
    // Must include all expected actions
    expect(actions1).toContain('start_listening');
    expect(actions1).toContain('stop_listening');
    expect(actions1).toContain('get_status');
    expect(actions1).toContain('check_microphone');
  });
});
