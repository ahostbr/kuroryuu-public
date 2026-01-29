/**
 * Property-Based Tests for Voice Transcript Persistence
 * 
 * Tests:
 * - Any transcript saved to disk loads back identically
 * - Handles edge cases (empty strings, special characters, long transcripts)
 * - Timestamps preserved correctly
 * 
 * Requirements: 2.4
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import fc from 'fast-check';
import { saveTranscript, loadTranscript } from '../speech-recognizer';
import { TranscriptionResult } from '../types';
import * as fs from 'fs/promises';
import * as path from 'path';

// ═══════════════════════════════════════════════════════════════════════════════
// Mocks
// ═══════════════════════════════════════════════════════════════════════════════

vi.mock('fs/promises', () => ({
  writeFile: vi.fn(),
  readFile: vi.fn(),
  mkdir: vi.fn(),
}));

// ═══════════════════════════════════════════════════════════════════════════════
// Arbitraries
// ═══════════════════════════════════════════════════════════════════════════════

// Generate arbitrary transcription text (excluding control characters that break JSON)
const transcriptTextArb = fc.string({ 
  minLength: 0, 
  maxLength: 5000 
}).filter(s => !s.includes('\x00')); // Exclude null bytes

// Generate arbitrary confidence (0-1)
const confidenceArb = fc.float({ min: 0, max: 1, noNaN: true });

// Generate arbitrary language codes
const languageArb = fc.constantFrom(
  'en-US', 'en-GB', 'es-ES', 'fr-FR', 'de-DE', 
  'ja-JP', 'zh-CN', 'ko-KR', 'pt-BR', 'ru-RU'
);

// Generate arbitrary audio duration (0-3600000 ms = 1 hour max)
const audioDurationArb = fc.integer({ min: 0, max: 3600000 });

// Generate arbitrary timestamp (reasonable range)
const timestampArb = fc.integer({ min: 0, max: Date.now() + 86400000 });

// Generate full TranscriptionResult
const transcriptionResultArb = fc.record({
  transcript: transcriptTextArb,
  confidence: confidenceArb,
  isFinal: fc.boolean(),
  audioDuration: audioDurationArb,
  language: languageArb,
  timestamp: timestampArb,
}) as fc.Arbitrary<TranscriptionResult>;

// ═══════════════════════════════════════════════════════════════════════════════
// Property Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Voice Transcript Persistence Property Tests', () => {
  let storedData: string = '';
  
  beforeEach(() => {
    storedData = '';
    
    // Mock writeFile to store data in memory
    vi.mocked(fs.writeFile).mockImplementation(async (_path, data, _encoding) => {
      storedData = data as string;
    });
    
    // Mock readFile to return stored data
    vi.mocked(fs.readFile).mockImplementation(async () => {
      return storedData;
    });
    
    vi.mocked(fs.mkdir).mockResolvedValue(undefined);
  });
  
  afterEach(() => {
    vi.clearAllMocks();
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Core Round-Trip Property
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: Any transcript saved to disk loads back identically', async () => {
    await fc.assert(
      fc.asyncProperty(transcriptionResultArb, async (original) => {
        const filePath = '/tmp/test-transcript.json';
        
        // Save transcript
        await saveTranscript(filePath, original);
        
        // Load transcript back
        const loaded = await loadTranscript(filePath);
        
        // Verify all fields match
        expect(loaded.transcript).toBe(original.transcript);
        expect(loaded.isFinal).toBe(original.isFinal);
        expect(loaded.audioDuration).toBe(original.audioDuration);
        expect(loaded.language).toBe(original.language);
        expect(loaded.timestamp).toBe(original.timestamp);
        
        // Confidence may have floating point precision loss
        expect(Math.abs((loaded.confidence ?? 0) - (original.confidence ?? 0))).toBeLessThan(0.0001);
      }),
      { numRuns: 100 }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Edge Case Properties
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: Preserves empty transcripts', async () => {
    const emptyTranscript: TranscriptionResult = {
      transcript: '',
      confidence: 0,
      isFinal: true,
      audioDuration: 0,
      language: 'en-US',
      timestamp: Date.now(),
    };
    
    const filePath = '/tmp/empty-transcript.json';
    
    await saveTranscript(filePath, emptyTranscript);
    const loaded = await loadTranscript(filePath);
    
    expect(loaded.transcript).toBe('');
    expect(loaded.audioDuration).toBe(0);
  });
  
  it('Property: Preserves special characters in transcript', async () => {
    const specialChars = [
      '"Hello," said the user.',
      "It's a test",
      'Tab\there\tand\tthere',
      'Newline\ntest',
      'Unicode: 日本語 中文 한국어',
      'Emoji: 🎤🗣️💬',
      'Backslash: path\\to\\file',
      'Quotes: "double" and \'single\'',
    ];
    
    for (const text of specialChars) {
      const transcript: TranscriptionResult = {
        transcript: text,
        confidence: 0.9,
        isFinal: true,
        audioDuration: 1000,
        language: 'en-US',
        timestamp: Date.now(),
      };
      
      await saveTranscript('/tmp/special.json', transcript);
      const loaded = await loadTranscript('/tmp/special.json');
      
      expect(loaded.transcript).toBe(text);
    }
  });
  
  it('Property: Preserves very long transcripts', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.string({ minLength: 1000, maxLength: 10000 }).filter(s => !s.includes('\x00')),
        async (longText) => {
          const transcript: TranscriptionResult = {
            transcript: longText,
            confidence: 0.8,
            isFinal: true,
            audioDuration: longText.length * 100, // Approximate
            language: 'en-US',
            timestamp: Date.now(),
          };
          
          await saveTranscript('/tmp/long.json', transcript);
          const loaded = await loadTranscript('/tmp/long.json');
          
          expect(loaded.transcript).toBe(longText);
          expect(loaded.transcript.length).toBe(longText.length);
        }
      ),
      { numRuns: 10 }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Confidence Boundary Properties
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: Confidence values at boundaries preserved', async () => {
    const boundaryConfidences = [0, 0.0001, 0.5, 0.9999, 1];
    
    for (const confidence of boundaryConfidences) {
      const transcript: TranscriptionResult = {
        transcript: 'Test',
        confidence,
        isFinal: true,
        audioDuration: 1000,
        language: 'en-US',
        timestamp: Date.now(),
      };
      
      await saveTranscript('/tmp/confidence.json', transcript);
      const loaded = await loadTranscript('/tmp/confidence.json');
      
      expect(Math.abs((loaded.confidence ?? 0) - confidence)).toBeLessThan(0.0001);
    }
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Timestamp Properties
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: Timestamps preserved exactly', async () => {
    await fc.assert(
      fc.asyncProperty(timestampArb, async (timestamp) => {
        const transcript: TranscriptionResult = {
          transcript: 'Test',
          confidence: 0.9,
          isFinal: true,
          audioDuration: 1000,
          language: 'en-US',
          timestamp,
        };
        
        await saveTranscript('/tmp/timestamp.json', transcript);
        const loaded = await loadTranscript('/tmp/timestamp.json');
        
        expect(loaded.timestamp).toBe(timestamp);
      }),
      { numRuns: 50 }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Language Code Properties
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: All supported languages preserved', async () => {
    await fc.assert(
      fc.asyncProperty(languageArb, async (language) => {
        const transcript: TranscriptionResult = {
          transcript: 'Test',
          confidence: 0.9,
          isFinal: true,
          audioDuration: 1000,
          language,
          timestamp: Date.now(),
        };
        
        await saveTranscript('/tmp/language.json', transcript);
        const loaded = await loadTranscript('/tmp/language.json');
        
        expect(loaded.language).toBe(language);
      }),
      { numRuns: 20 }
    );
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // isFinal Flag Properties
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: isFinal flag preserved correctly', async () => {
    for (const isFinal of [true, false]) {
      const transcript: TranscriptionResult = {
        transcript: 'Test',
        confidence: 0.9,
        isFinal,
        audioDuration: 1000,
        language: 'en-US',
        timestamp: Date.now(),
      };
      
      await saveTranscript('/tmp/isfinal.json', transcript);
      const loaded = await loadTranscript('/tmp/isfinal.json');
      
      expect(loaded.isFinal).toBe(isFinal);
    }
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Audio Duration Properties
  // ─────────────────────────────────────────────────────────────────────────────
  
  it('Property: Audio duration boundaries preserved', async () => {
    const durations = [0, 1, 1000, 60000, 3600000];
    
    for (const audioDuration of durations) {
      const transcript: TranscriptionResult = {
        transcript: 'Test',
        confidence: 0.9,
        isFinal: true,
        audioDuration,
        language: 'en-US',
        timestamp: Date.now(),
      };
      
      await saveTranscript('/tmp/duration.json', transcript);
      const loaded = await loadTranscript('/tmp/duration.json');
      
      expect(loaded.audioDuration).toBe(audioDuration);
    }
  });
});
