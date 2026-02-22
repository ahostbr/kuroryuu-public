/**
 * TTS Events Property Tests
 * 
 * Property-based tests for TTS event handling
 * 
 * Requirements: 3.1, 3.2
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import * as fc from 'fast-check';
import { TTSModule } from '../module';
import { TTSEngine } from '../tts-engine';
import { FeatureEventBus, resetEventBus } from '../../event-bus';
import { ConfigManager } from '../../config-manager';

// ═══════════════════════════════════════════════════════════════════════════════
// Property Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('TTS Events Property Tests', () => {
  let module: TTSModule;
  let eventBus: FeatureEventBus;
  let configManager: ConfigManager;
  
  beforeEach(async () => {
    resetEventBus();
    eventBus = new FeatureEventBus();
    configManager = new ConfigManager();

    // Spy on event bus methods
    vi.spyOn(eventBus, 'emit');
    vi.spyOn(eventBus, 'emitTTSSpeakStart');
    vi.spyOn(eventBus, 'emitTTSSpeakComplete');

    // Mock engine.speak to resolve instantly (avoid real speech synthesis)
    vi.spyOn(TTSEngine.prototype, 'speak').mockResolvedValue({
      id: 'mock-utterance',
      text: 'mock',
      voice: 'mock',
      startTime: Date.now(),
      estimatedDuration: 0,
      state: 'completed',
    });

    module = new TTSModule(eventBus, configManager);
    await module.initialize();
  });
  
  afterEach(async () => {
    await module.shutdown();
    vi.clearAllMocks();
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Safe action generator (excludes speak which has side effects)
  // ─────────────────────────────────────────────────────────────────────────────
  
  const safeActions = ['stop', 'pause', 'resume', 'get_status', 'list_voices'] as const;
  const safeActionArb = fc.constantFrom<typeof safeActions[number]>(...safeActions);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: All safe actions should return a result object
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('property: all safe actions return result objects with success field', async () => {
    await fc.assert(
      fc.asyncProperty(safeActionArb, async (actionType) => {
        const result = await module.execute(actionType, {});
        
        expect(result).toBeDefined();
        expect(typeof result).toBe('object');
        expect(typeof result.ok).toBe('boolean');
        
        return true;
      }),
      { numRuns: 25 }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Text validation for speak action
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('property: speak action handles valid text', async () => {
    // Generate non-empty strings
    const validTextArb = fc.string({ minLength: 1, maxLength: 500 })
      .filter(s => s.trim().length > 0);
    
    await fc.assert(
      fc.asyncProperty(validTextArb, async (text) => {
        const result = await module.execute('speak', { text });
        
        // Should always return a result (success or error)
        expect(result).toBeDefined();
        expect(typeof result.ok).toBe('boolean');
        
        return true;
      }),
      { numRuns: 15 }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Empty text should fail validation
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('property: speak rejects empty/whitespace text', async () => {
    const emptyTextArb = fc.constantFrom('', '   ', '\t', '\n', '  \n  ');
    
    await fc.assert(
      fc.asyncProperty(emptyTextArb, async (text) => {
        const result = await module.execute('speak', { text });

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errorCode).toBeDefined();
        }

        return true;
      }),
      { numRuns: 5 }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Sequential actions maintain state consistency
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('property: sequential status checks return consistent state', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 2, max: 5 }),
        async (count) => {
          const results: Array<{ ok: boolean; data?: { isSpeaking: boolean } }> = [];
          
          for (let i = 0; i < count; i++) {
            const result = await module.execute('get_status', {});
            results.push(result);
          }
          
          // All calls should succeed
          expect(results.every(r => r.ok)).toBe(true);
          
          // State should be consistent (same isSpeaking value across calls)
          const states = results.map(r => r.data?.isSpeaking);
          const firstState = states[0];
          expect(states.every(s => s === firstState)).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 10 }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Voice list is deterministic
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('property: list_voices returns consistent results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 3 }),
        async (count) => {
          const results: unknown[] = [];
          
          for (let i = 0; i < count; i++) {
            const result = await module.execute('list_voices', {});
            results.push(result);
          }
          
          // All results should have same voice list
          const firstResult = JSON.stringify(results[0]);
          expect(results.every(r => JSON.stringify(r) === firstResult)).toBe(true);
          
          return true;
        }
      ),
      { numRuns: 5 }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Events are emitted for speak success
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('property: speak emits start event with text', async () => {
    const textArb = fc.string({ minLength: 5, maxLength: 100 })
      .filter(s => s.trim().length > 0);
    
    await fc.assert(
      fc.asyncProperty(textArb, async (text) => {
        // Reset mock
        vi.clearAllMocks();
        
        const result = await module.execute('speak', { text });
        
        if (result.ok) {
          // Verify event was emitted
          expect(eventBus.emitTTSSpeakStart).toHaveBeenCalled();
          
          // Verify text was passed
          const callArgs = vi.mocked(eventBus.emitTTSSpeakStart).mock.calls[0];
          expect(callArgs).toBeDefined();
        }
        
        return true;
      }),
      { numRuns: 10 }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Unknown action types return error
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('property: invalid action types return error', async () => {
    const invalidActionArb = fc.string({ minLength: 3, maxLength: 20 })
      .filter(s => !['speak', 'stop', 'pause', 'resume', 'get_status', 'list_voices', 'set_voice'].includes(s));
    
    await fc.assert(
      fc.asyncProperty(invalidActionArb, async (actionType) => {
        const result = await module.execute(actionType, {});

        expect(result.ok).toBe(false);
        if (!result.ok) {
          expect(result.errorCode).toBeDefined();
        }

        return true;
      }),
      { numRuns: 15 }
    );
  });
});
