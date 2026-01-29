/**
 * Speech Recognizer Wrapper
 * 
 * Handles speech recognition using Web Speech API in Electron.
 * Falls back to simulated recognition for testing/development.
 * 
 * Requirements: 2.1, 2.2, 2.3, 2.4, 2.5, 2.6, 2.9
 */

import {
  TranscriptionResult,
  MicrophoneCheckResult,
  AudioInputDevice,
  VoiceInputErrorType,
} from './types';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Listen options
 */
export interface ListenOptions {
  /** Timeout in milliseconds */
  timeout: number;
  
  /** Language code (e.g., 'en-US') */
  language: string;
  
  /** Enable continuous mode */
  continuous: boolean;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Speech Recognizer Implementation
// ═══════════════════════════════════════════════════════════════════════════════

export class SpeechRecognizer {
  private isListening: boolean = false;
  private abortController: AbortController | null = null;
  private pendingResult: TranscriptionResult | null = null;
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Microphone Check
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Check if microphone is available
   * Requirements: 2.1, 2.9
   */
  async checkMicrophone(): Promise<MicrophoneCheckResult> {
    try {
      // In Node.js/Electron main process, we need to check via different means
      // The actual Web API check would be done in the renderer process
      
      // For now, we'll check if we're in an environment that supports audio
      if (typeof navigator !== 'undefined' && navigator.mediaDevices) {
        // Browser/renderer environment
        const devices = await navigator.mediaDevices.enumerateDevices();
        const audioInputs = devices.filter(d => d.kind === 'audioinput');
        
        if (audioInputs.length === 0) {
          return {
            available: false,
            error: 'No audio input devices found',
          };
        }
        
        const deviceList: AudioInputDevice[] = audioInputs.map((d, i) => ({
          id: d.deviceId,
          name: d.label || `Microphone ${i + 1}`,
          isDefault: i === 0,
        }));
        
        // Try to get permission
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(track => track.stop());
          
          return {
            available: true,
            deviceName: deviceList[0]?.name || 'Default Microphone',
            devices: deviceList,
          };
        } catch (permError) {
          return {
            available: false,
            error: 'Microphone permission denied',
            devices: deviceList,
          };
        }
      }
      
      // Main process - assume microphone is available
      // Actual check will be done when listening starts
      return {
        available: true,
        deviceName: 'Default Microphone',
      };
    } catch (error) {
      return {
        available: false,
        error: error instanceof Error ? error.message : 'Failed to check microphone',
      };
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Speech Recognition
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Start listening and transcribe speech
   * Requirements: 2.2, 2.3, 2.4, 2.5
   */
  async listen(options: ListenOptions): Promise<TranscriptionResult> {
    if (this.isListening) {
      throw new Error('Already listening');
    }
    
    this.isListening = true;
    this.abortController = new AbortController();
    
    try {
      // Check if Web Speech API is available
      if (typeof window !== 'undefined' && 'webkitSpeechRecognition' in window) {
        return await this.listenWebSpeech(options);
      }
      
      // Fallback to simulated recognition (for testing/main process)
      return await this.listenSimulated(options);
    } finally {
      this.isListening = false;
      this.abortController = null;
    }
  }
  
  /**
   * Listen using Web Speech API
   */
  private async listenWebSpeech(options: ListenOptions): Promise<TranscriptionResult> {
    return new Promise((resolve, reject) => {
      // @ts-expect-error - webkitSpeechRecognition is not in TypeScript types
      const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
      const recognition = new SpeechRecognition();
      
      recognition.continuous = options.continuous;
      recognition.interimResults = true;
      recognition.lang = options.language;
      
      let finalTranscript = '';
      let finalConfidence = 0;
      const startTime = Date.now();
      
      // Timeout handler
      const timeoutId = setTimeout(() => {
        recognition.stop();
        if (!finalTranscript) {
          reject(new Error('Speech recognition timeout - no speech detected'));
        }
      }, options.timeout);
      
      recognition.onresult = (event: any) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const result = event.results[i];
          if (result.isFinal) {
            finalTranscript += result[0].transcript;
            finalConfidence = result[0].confidence;
          }
        }
      };
      
      recognition.onerror = (event: any) => {
        clearTimeout(timeoutId);
        
        switch (event.error) {
          case 'no-speech':
            reject(new Error('No speech detected'));
            break;
          case 'audio-capture':
            reject(new Error('Microphone not available'));
            break;
          case 'not-allowed':
            reject(new Error('Microphone permission denied'));
            break;
          case 'network':
            reject(new Error('Network error during speech recognition'));
            break;
          default:
            reject(new Error(`Speech recognition error: ${event.error}`));
        }
      };
      
      recognition.onend = () => {
        clearTimeout(timeoutId);
        
        if (finalTranscript) {
          resolve({
            transcript: finalTranscript.trim(),
            confidence: finalConfidence,
            isFinal: true,
            audioDuration: Date.now() - startTime,
            language: options.language,
            timestamp: Date.now(),
          });
        } else if (!this.abortController?.signal.aborted) {
          reject(new Error('No speech detected'));
        }
      };
      
      // Handle abort
      this.abortController?.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        recognition.stop();
      });
      
      recognition.start();
    });
  }
  
  /**
   * Simulated recognition for testing/development
   */
  private async listenSimulated(options: ListenOptions): Promise<TranscriptionResult> {
    const startTime = Date.now();
    
    // Simulate listening delay (shorter than timeout)
    const delay = Math.min(options.timeout - 500, 2000);
    
    await new Promise<void>((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        resolve();
      }, delay);
      
      // Handle abort
      this.abortController?.signal.addEventListener('abort', () => {
        clearTimeout(timeoutId);
        resolve();
      });
    });
    
    // Check if aborted
    if (this.abortController?.signal.aborted) {
      if (this.pendingResult) {
        const result = this.pendingResult;
        this.pendingResult = null;
        return result;
      }
      throw new Error('Listening aborted');
    }
    
    // Return simulated result
    return {
      transcript: '[Simulated transcription - Web Speech API not available in main process]',
      confidence: 0.9,
      isFinal: true,
      audioDuration: Date.now() - startTime,
      language: options.language,
      timestamp: Date.now(),
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Control Methods
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Stop listening
   * Requirements: 2.3
   */
  async stop(): Promise<TranscriptionResult | null> {
    if (!this.isListening || !this.abortController) {
      return null;
    }
    
    this.abortController.abort();
    
    // Return any pending result
    return this.pendingResult;
  }
  
  /**
   * Check if currently listening
   */
  getIsListening(): boolean {
    return this.isListening;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Transcript File I/O (for persistence)
// ═══════════════════════════════════════════════════════════════════════════════

import { writeFile, readFile, mkdir } from 'fs/promises';
import { dirname } from 'path';

/**
 * Save transcript to file
 * Requirements: 2.4
 */
export async function saveTranscript(
  filePath: string,
  transcript: TranscriptionResult
): Promise<void> {
  // Ensure directory exists
  await mkdir(dirname(filePath), { recursive: true });
  
  const data = JSON.stringify(transcript, null, 2);
  await writeFile(filePath, data, 'utf-8');
}

/**
 * Load transcript from file
 * Requirements: 2.4
 */
export async function loadTranscript(filePath: string): Promise<TranscriptionResult> {
  const data = await readFile(filePath, 'utf-8');
  return JSON.parse(data) as TranscriptionResult;
}
