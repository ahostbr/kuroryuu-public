/**
 * useTTS Hook
 * 
 * React hook for TTS functionality with:
 * - Speak text with settings
 * - Stop/pause/resume controls
 * - State management
 * - Voice selection
 * 
 * Requirements: 3.1, 3.2
 */

import { useState, useCallback, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface TTSVoice {
  id: string;
  name: string;
  lang: string;
  default: boolean;
}

export interface TTSState {
  isSpeaking: boolean;
  isPaused: boolean;
  isLoading: boolean;
  error: string | null;
  currentText: string | null;
  voices: TTSVoice[];
  selectedVoice: string | null;
}

export interface UseTTSOptions {
  onStart?: (text: string) => void;
  onEnd?: () => void;
  onError?: (error: string) => void;
}

export interface UseTTSReturn {
  state: TTSState;
  speak: (text: string) => Promise<void>;
  stop: () => Promise<void>;
  pause: () => Promise<void>;
  resume: () => Promise<void>;
  setVoice: (voiceId: string) => void;
  clearError: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════════════════════

export function useTTS(options: UseTTSOptions = {}): UseTTSReturn {
  const { onStart, onEnd, onError } = options;
  
  const [state, setState] = useState<TTSState>({
    isSpeaking: false,
    isPaused: false,
    isLoading: false,
    error: null,
    currentText: null,
    voices: [],
    selectedVoice: null,
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Load voices on mount
  // ─────────────────────────────────────────────────────────────────────────────
  
  useEffect(() => {
    const loadVoices = async () => {
      try {
        const voices = await window.electronAPI?.tts?.listVoices();
        if (voices && Array.isArray(voices) && voices.length > 0) {
          setState(prev => ({
            ...prev,
            voices: voices as TTSVoice[],
            selectedVoice: voices[0]?.id || null,
          }));
        }
      } catch (error) {
        // Voices not available, continue without
      }
    };

    loadVoices();
  }, []);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Event listeners
  // ─────────────────────────────────────────────────────────────────────────────
  
  useEffect(() => {
    const handleSpeakEnd = () => {
      setState(prev => ({
        ...prev,
        isSpeaking: false,
        isPaused: false,
        currentText: null,
      }));
      onEnd?.();
    };
    
    const handleSpeakError = (event: CustomEvent<{ error: string }>) => {
      const errorMsg = event.detail?.error || 'Unknown TTS error';
      setState(prev => ({
        ...prev,
        isSpeaking: false,
        isPaused: false,
        error: errorMsg,
        currentText: null,
      }));
      onError?.(errorMsg);
    };
    
    window.addEventListener('tts:end', handleSpeakEnd);
    window.addEventListener('tts:error', handleSpeakError as EventListener);
    
    return () => {
      window.removeEventListener('tts:end', handleSpeakEnd);
      window.removeEventListener('tts:error', handleSpeakError as EventListener);
    };
  }, [onEnd, onError]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Actions
  // ─────────────────────────────────────────────────────────────────────────────
  
  const speak = useCallback(async (text: string) => {
    if (!text.trim()) return;
    
    setState(prev => ({
      ...prev,
      isLoading: true,
      error: null,
    }));
    
    try {
      const result = await window.electronAPI?.tts?.speak({
        text,
        voice: state.selectedVoice || undefined,
      });
      
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to speak');
      }
      
      setState(prev => ({
        ...prev,
        isSpeaking: true,
        isLoading: false,
        currentText: text,
      }));
      
      onStart?.(text);
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Failed to speak';
      setState(prev => ({
        ...prev,
        isLoading: false,
        error: errorMsg,
      }));
      onError?.(errorMsg);
    }
  }, [state.selectedVoice, onStart, onError]);
  
  const stop = useCallback(async () => {
    try {
      await window.electronAPI?.tts?.stop();
      setState(prev => ({
        ...prev,
        isSpeaking: false,
        isPaused: false,
        currentText: null,
      }));
    } catch (error) {
      // Ignore stop errors
    }
  }, []);
  
  const pause = useCallback(async () => {
    try {
      await window.electronAPI?.tts?.pause();
      setState(prev => ({
        ...prev,
        isPaused: true,
      }));
    } catch (error) {
      // Ignore pause errors
    }
  }, []);
  
  const resume = useCallback(async () => {
    try {
      await window.electronAPI?.tts?.resume();
      setState(prev => ({
        ...prev,
        isPaused: false,
      }));
    } catch (error) {
      // Ignore resume errors
    }
  }, []);
  
  const setVoice = useCallback((voiceId: string) => {
    setState(prev => ({
      ...prev,
      selectedVoice: voiceId,
    }));
  }, []);
  
  const clearError = useCallback(() => {
    setState(prev => ({
      ...prev,
      error: null,
    }));
  }, []);
  
  return {
    state,
    speak,
    stop,
    pause,
    resume,
    setVoice,
    clearError,
  };
}

export default useTTS;
