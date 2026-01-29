/**
 * useSpeechRecognition Hook
 * Web Speech API wrapper for voice input
 */
import { useState, useCallback, useRef, useEffect } from 'react';
import type { VoiceState } from '../types/voice';

interface SpeechRecognitionOptions {
  language?: string;
  continuous?: boolean;
  interimResults?: boolean;
  onFinalTranscript?: (text: string) => void;
  onError?: (error: string) => void;
}

interface SpeechRecognitionHook {
  state: VoiceState;
  transcript: string;
  interimTranscript: string;
  isSupported: boolean;
  start: () => void;
  stop: () => void;
  toggle: () => void;
  reset: () => void;
}

// TypeScript declarations for Web Speech API
interface SpeechRecognitionEvent extends Event {
  results: SpeechRecognitionResultList;
  resultIndex: number;
}

interface SpeechRecognitionResultList {
  length: number;
  item(index: number): SpeechRecognitionResult;
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionResult {
  length: number;
  item(index: number): SpeechRecognitionAlternative;
  [index: number]: SpeechRecognitionAlternative;
  isFinal: boolean;
}

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}

declare global {
  interface Window {
    SpeechRecognition: new () => SpeechRecognition;
    webkitSpeechRecognition: new () => SpeechRecognition;
  }
}

interface SpeechRecognition extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onstart: ((ev: Event) => void) | null;
  onend: ((ev: Event) => void) | null;
  onresult: ((ev: SpeechRecognitionEvent) => void) | null;
  onerror: ((ev: Event & { error: string }) => void) | null;
  onspeechend: ((ev: Event) => void) | null;
}

// Check support once at module load
const isSupported = typeof window !== 'undefined' && 
  ('SpeechRecognition' in window || 'webkitSpeechRecognition' in window);

export function useSpeechRecognition(options: SpeechRecognitionOptions = {}): SpeechRecognitionHook {
  const {
    language = 'en-US',
    continuous = false,
    interimResults = true,
    onFinalTranscript,
    onError,
  } = options;
  
  const [state, setState] = useState<VoiceState>('idle');
  const [transcript, setTranscript] = useState('');
  const [interimTranscript, setInterimTranscript] = useState('');
  
  // Use refs for callbacks to avoid recreating recognition
  const onFinalTranscriptRef = useRef(onFinalTranscript);
  const onErrorRef = useRef(onError);
  
  // Keep refs updated
  useEffect(() => {
    onFinalTranscriptRef.current = onFinalTranscript;
    onErrorRef.current = onError;
  }, [onFinalTranscript, onError]);
  
  // Create recognition instance once
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const isInitializedRef = useRef(false);
  
  // Initialize on mount only
  useEffect(() => {
    if (!isSupported || isInitializedRef.current) return;
    
    console.log('[Voice] Initializing SpeechRecognition...');
    
    const SpeechRecognitionClass = window.SpeechRecognition || window.webkitSpeechRecognition;
    const recognition = new SpeechRecognitionClass();
    
    recognition.continuous = continuous;
    recognition.interimResults = interimResults;
    recognition.lang = language;
    
    recognition.onstart = () => {
      console.log('[Voice] ✅ onstart - Recording started!');
      setState('listening');
    };
    
    recognition.onend = () => {
      console.log('[Voice] ⏹️ onend - Recording stopped');
      setState('idle');
    };
    
    recognition.onspeechend = () => {
      console.log('[Voice] 🎤 onspeechend - Speech ended');
    };
    
    recognition.onresult = (event: SpeechRecognitionEvent) => {
      console.log('[Voice] 📝 onresult - Got results:', event.results.length);
      
      let finalText = '';
      let interimText = '';
      
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const result = event.results[i];
        const text = result[0].transcript;
        
        console.log(`[Voice] Result ${i}: "${text}" (isFinal: ${result.isFinal})`);
        
        if (result.isFinal) {
          finalText += text;
        } else {
          interimText += text;
        }
      }
      
      if (finalText) {
        console.log('[Voice] ✅ Final transcript:', finalText);
        setTranscript(prev => prev + finalText);
        setInterimTranscript('');
        onFinalTranscriptRef.current?.(finalText);
      }
      
      if (interimText) {
        console.log('[Voice] 🔄 Interim transcript:', interimText);
        setInterimTranscript(interimText);
      }
    };
    
    recognition.onerror = (event) => {
      console.error('[Voice] ❌ Error:', event.error);
      setState('error');
      onErrorRef.current?.(event.error);
      
      // Auto-recover from certain errors
      if (event.error === 'no-speech' || event.error === 'aborted') {
        setTimeout(() => setState('idle'), 1000);
      }
    };
    
    recognitionRef.current = recognition;
    isInitializedRef.current = true;
    console.log('[Voice] ✅ SpeechRecognition initialized');
    
    return () => {
      console.log('[Voice] Cleanup - aborting recognition');
      recognition.abort();
    };
  }, []); // Empty deps - only run once on mount
  
  const start = useCallback(() => {
    console.log('[Voice] start() called');
    console.log('[Voice] - recognitionRef.current:', !!recognitionRef.current);
    console.log('[Voice] - current state:', state);
    
    if (!recognitionRef.current) {
      console.error('[Voice] No recognition instance!');
      return;
    }
    
    if (state === 'listening') {
      console.log('[Voice] Already listening, ignoring start()');
      return;
    }
    
    try {
      // Reset transcript for new recording
      setInterimTranscript('');
      recognitionRef.current.start();
      console.log('[Voice] recognition.start() called successfully');
    } catch (err) {
      console.error('[Voice] start() error:', err);
      // If already started, stop and restart
      if (err instanceof Error && err.message.includes('already started')) {
        recognitionRef.current.stop();
      }
    }
  }, [state]);
  
  const stop = useCallback(() => {
    console.log('[Voice] stop() called, state:', state);
    if (!recognitionRef.current) return;
    
    try {
      recognitionRef.current.stop();
      console.log('[Voice] recognition.stop() called');
    } catch (err) {
      console.error('[Voice] stop() error:', err);
    }
  }, [state]);
  
  const toggle = useCallback(() => {
    console.log('[Voice] toggle() called, current state:', state);
    if (state === 'listening') {
      stop();
    } else {
      start();
    }
  }, [state, start, stop]);
  
  const reset = useCallback(() => {
    console.log('[Voice] reset() called');
    setTranscript('');
    setInterimTranscript('');
    if (state === 'listening') {
      stop();
    }
  }, [stop, state]);
  
  return {
    state,
    transcript,
    interimTranscript,
    isSupported,
    start,
    stop,
    toggle,
    reset,
  };
}
