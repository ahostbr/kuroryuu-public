/**
 * Error Response Property Tests
 * 
 * Property-based tests for error response structure:
 * - All error responses have required fields
 * - Error codes are valid
 * - Context is properly structured
 * 
 * Requirements: 7.2, 7.6
 */

import { describe, it, expect } from 'vitest';
import * as fc from 'fast-check';
import {
  FeatureErrorCode,
  createFeatureError,
  isFeatureError,
  isModuleError,
  getErrorSuggestion,
  type FeatureError,
} from '../errors';

// ═══════════════════════════════════════════════════════════════════════════════
// Arbitraries
// ═══════════════════════════════════════════════════════════════════════════════

// Generate valid error codes
const errorCodeArb = fc.constantFrom(
  ...Object.values(FeatureErrorCode)
);

// Generate module names
const moduleNameArb = fc.constantFrom(
  'capture', 'voice-input', 'tts', 'config-manager', 'feature-manager'
);

// Generate action names
const actionNameArb = fc.constantFrom(
  'capture', 'start_listening', 'stop_listening', 'speak', 'stop', 'pause',
  'resume', 'get_status', 'list_voices', 'load', 'save'
);

// Generate error messages
const errorMessageArb = fc.string({ minLength: 1, maxLength: 200 })
  .filter(s => s.trim().length > 0);

// Generate params object
const paramsArb = fc.record({
  text: fc.option(fc.string({ maxLength: 1000 }), { nil: undefined }),
  timeout: fc.option(fc.integer({ min: 0, max: 60000 }), { nil: undefined }),
  preset: fc.option(fc.string({ maxLength: 50 }), { nil: undefined }),
  voice: fc.option(fc.string({ maxLength: 100 }), { nil: undefined }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Error Response Property Tests', () => {
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Required Fields
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Error Response Structure', () => {
    it('property: all created errors have required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          errorCodeArb,
          errorMessageArb,
          moduleNameArb,
          async (code, message, module) => {
            const error = createFeatureError(code, message, module);
            
            // Required fields exist
            expect(error.code).toBeDefined();
            expect(error.message).toBeDefined();
            expect(error.context).toBeDefined();
            expect(error.recoverable).toBeDefined();
            
            // Types are correct
            expect(typeof error.code).toBe('string');
            expect(typeof error.message).toBe('string');
            expect(typeof error.context).toBe('object');
            expect(typeof error.recoverable).toBe('boolean');
            
            return true;
          }
        ),
        { numRuns: 100 }
      );
    });
    
    it('property: error context has required fields', async () => {
      await fc.assert(
        fc.asyncProperty(
          errorCodeArb,
          errorMessageArb,
          moduleNameArb,
          actionNameArb,
          async (code, message, module, action) => {
            const error = createFeatureError(code, message, module, { action });
            
            // Context required fields
            expect(error.context.module).toBeDefined();
            expect(error.context.timestamp).toBeDefined();
            
            // Module matches
            expect(error.context.module).toBe(module);
            
            // Timestamp is valid ISO string
            const timestamp = new Date(error.context.timestamp);
            expect(timestamp.toString()).not.toBe('Invalid Date');
            
            // Action is preserved
            expect(error.context.action).toBe(action);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
    
    it('property: params are preserved in context', async () => {
      await fc.assert(
        fc.asyncProperty(
          errorCodeArb,
          errorMessageArb,
          moduleNameArb,
          paramsArb,
          async (code, message, module, params) => {
            const error = createFeatureError(code, message, module, { params });
            
            // Params exist if provided
            if (Object.keys(params).some(k => params[k as keyof typeof params] !== undefined)) {
              expect(error.context.params).toBeDefined();
            }
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Error Code Validity
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Error Code Validity', () => {
    it('property: error code is preserved exactly', async () => {
      await fc.assert(
        fc.asyncProperty(errorCodeArb, async (code) => {
          const error = createFeatureError(code, 'Test message', 'test-module');
          
          expect(error.code).toBe(code);
          
          return true;
        }),
        { numRuns: Object.keys(FeatureErrorCode).length }
      );
    });
    
    it('property: all error codes are non-empty strings', async () => {
      for (const code of Object.values(FeatureErrorCode)) {
        expect(typeof code).toBe('string');
        expect(code.length).toBeGreaterThan(0);
      }
    });
    
    it('property: error codes follow naming convention', async () => {
      for (const code of Object.values(FeatureErrorCode)) {
        // Should be UPPER_SNAKE_CASE
        expect(code).toMatch(/^[A-Z][A-Z0-9_]*$/);
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: isFeatureError Predicate
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Error Predicate', () => {
    it('property: created errors pass isFeatureError check', async () => {
      await fc.assert(
        fc.asyncProperty(
          errorCodeArb,
          errorMessageArb,
          moduleNameArb,
          async (code, message, module) => {
            const error = createFeatureError(code, message, module);
            
            expect(isFeatureError(error)).toBe(true);
            
            return true;
          }
        ),
        { numRuns: 50 }
      );
    });
    
    it('property: non-errors fail isFeatureError check', async () => {
      const nonErrorArb = fc.oneof(
        fc.string(),
        fc.integer(),
        fc.boolean(),
        fc.constant(null),
        fc.constant(undefined),
        fc.record({ foo: fc.string() }),
        fc.record({ code: fc.string() }), // Missing other fields
        fc.record({ code: fc.string(), message: fc.string() }), // Missing context
      );
      
      await fc.assert(
        fc.asyncProperty(nonErrorArb, async (value) => {
          expect(isFeatureError(value)).toBe(false);
          
          return true;
        }),
        { numRuns: 50 }
      );
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Module Error Detection
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Module Error Detection', () => {
    it('property: capture errors detected correctly', async () => {
      const captureErrors = Object.values(FeatureErrorCode)
        .filter(code => code.startsWith('CAPTURE_'));
      
      for (const code of captureErrors) {
        expect(isModuleError(code, 'capture')).toBe(true);
        expect(isModuleError(code, 'voice')).toBe(false);
        expect(isModuleError(code, 'tts')).toBe(false);
      }
    });
    
    it('property: voice errors detected correctly', async () => {
      const voiceErrors = Object.values(FeatureErrorCode)
        .filter(code => code.startsWith('VOICE_INPUT_'));
      
      for (const code of voiceErrors) {
        expect(isModuleError(code, 'voice')).toBe(true);
        expect(isModuleError(code, 'capture')).toBe(false);
        expect(isModuleError(code, 'tts')).toBe(false);
      }
    });
    
    it('property: tts errors detected correctly', async () => {
      const ttsErrors = Object.values(FeatureErrorCode)
        .filter(code => code.startsWith('TTS_'));
      
      for (const code of ttsErrors) {
        expect(isModuleError(code, 'tts')).toBe(true);
        expect(isModuleError(code, 'capture')).toBe(false);
        expect(isModuleError(code, 'voice')).toBe(false);
      }
    });
    
    it('property: config errors detected correctly', async () => {
      const configErrors = Object.values(FeatureErrorCode)
        .filter(code => code.startsWith('CONFIG_'));
      
      for (const code of configErrors) {
        expect(isModuleError(code, 'config')).toBe(true);
        expect(isModuleError(code, 'capture')).toBe(false);
        expect(isModuleError(code, 'voice')).toBe(false);
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Error Suggestions
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Error Suggestions', () => {
    it('property: suggestions are non-empty strings when provided', async () => {
      for (const code of Object.values(FeatureErrorCode)) {
        const suggestion = getErrorSuggestion(code);
        
        if (suggestion !== undefined) {
          expect(typeof suggestion).toBe('string');
          expect(suggestion.length).toBeGreaterThan(0);
        }
      }
    });
    
    it('property: recoverable errors have suggestions', async () => {
      const recoverableErrors = [
        FeatureErrorCode.CAPTURE_PERMISSION_DENIED,
        FeatureErrorCode.VOICE_INPUT_NO_MICROPHONE,
        FeatureErrorCode.VOICE_INPUT_PERMISSION_DENIED,
        FeatureErrorCode.TTS_BACKEND_UNAVAILABLE,
        FeatureErrorCode.TTS_VOICE_NOT_FOUND,
        FeatureErrorCode.CONFIG_FILE_NOT_FOUND,
        FeatureErrorCode.RESOURCE_BUSY,
      ];
      
      for (const code of recoverableErrors) {
        const suggestion = getErrorSuggestion(code);
        expect(suggestion).toBeDefined();
        expect(suggestion!.length).toBeGreaterThan(0);
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Error Chaining
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Error Chaining', () => {
    it('property: cause is preserved in context', async () => {
      await fc.assert(
        fc.asyncProperty(
          errorCodeArb,
          errorMessageArb,
          moduleNameArb,
          async (code, message, module) => {
            const cause = new Error('Original error');
            const error = createFeatureError(code, message, module, { cause });
            
            // Cause should be in context
            expect(error.context.cause).toBeDefined();
            expect(error.context.cause?.module).toBe('unknown');
            
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
    
    it('property: feature error cause preserves context', async () => {
      const innerError = createFeatureError(
        FeatureErrorCode.TTS_FAILED,
        'Inner error',
        'tts'
      );
      
      const outerError = createFeatureError(
        FeatureErrorCode.UNKNOWN_ERROR,
        'Outer error',
        'orchestrator',
        { cause: innerError }
      );
      
      expect(outerError.context.cause).toBeDefined();
      expect(outerError.context.cause?.module).toBe('tts');
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Sensitive Data Sanitization
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Data Sanitization', () => {
    it('property: sensitive params are redacted', async () => {
      const sensitiveParamsArb = fc.record({
        password: fc.string({ minLength: 1 }),
        apiKey: fc.string({ minLength: 1 }),
        token: fc.string({ minLength: 1 }),
        secret: fc.string({ minLength: 1 }),
        normalParam: fc.string(),
      });
      
      await fc.assert(
        fc.asyncProperty(sensitiveParamsArb, async (params) => {
          const error = createFeatureError(
            FeatureErrorCode.UNKNOWN_ERROR,
            'Test',
            'test',
            { params }
          );
          
          // Sensitive fields should be redacted
          if (error.context.params) {
            expect(error.context.params.password).toBe('[REDACTED]');
            expect(error.context.params.apiKey).toBe('[REDACTED]');
            expect(error.context.params.token).toBe('[REDACTED]');
            expect(error.context.params.secret).toBe('[REDACTED]');
            // Normal params preserved
            expect(error.context.params.normalParam).toBe(params.normalParam);
          }
          
          return true;
        }),
        { numRuns: 20 }
      );
    });
    
    it('property: long strings are truncated in params', async () => {
      const longStringArb = fc.string({ minLength: 1001, maxLength: 2000 });
      
      await fc.assert(
        fc.asyncProperty(longStringArb, async (longValue) => {
          const error = createFeatureError(
            FeatureErrorCode.UNKNOWN_ERROR,
            'Test',
            'test',
            { params: { longField: longValue } }
          );
          
          // Long string should be truncated
          if (error.context.params) {
            const value = error.context.params.longField as string;
            expect(value).toMatch(/^\[STRING:\d+ chars\]$/);
          }
          
          return true;
        }),
        { numRuns: 10 }
      );
    });
  });
});
