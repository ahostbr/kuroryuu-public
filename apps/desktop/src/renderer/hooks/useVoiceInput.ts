/**
 * useVoiceInput Hook
 * 
 * React hook for managing voice input state and IPC communication
 * 
 * Requirements: 2.1, 2.2, 2.3
 */

import { useState, useCallback, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface VoiceInputState {
  isListening: boolean;
  isProcessing: boolean;
  transcript: string | null;
  error: string | null;
  microphoneAvailable: boolean;
}

export interface UseVoiceInputReturn {
  state: VoiceInputState;
  startListening: () => Promise<void>;
  stopListening: () => Promise<string | null>;
  checkMicrophone: () => Promise<boolean>;
  clearError: () => void;
  clearTranscript: () => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Hook
// ═══════════════════════════════════════════════════════════════════════════════

export function useVoiceInput(): UseVoiceInputReturn {
  const [state, setState] = useState<VoiceInputState>({
    isListening: false,
    isProcessing: false,
    transcript: null,
    error: null,
    microphoneAvailable: true,
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Check Microphone
  // ─────────────────────────────────────────────────────────────────────────────
  
  const checkMicrophone = useCallback(async (): Promise<boolean> => {
    try {
      const result = await window.electronAPI?.voiceInput?.checkMicrophone();

      const available = result?.available ?? false;
      setState(prev => ({ ...prev, microphoneAvailable: available }));

      return available;
    } catch (error) {
      setState(prev => ({
        ...prev,
        microphoneAvailable: false,
        error: 'Failed to check microphone',
      }));
      return false;
    }
  }, []);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Start Listening
  // ─────────────────────────────────────────────────────────────────────────────
  
  const startListening = useCallback(async () => {
    if (state.isListening) return;
    
    setState(prev => ({ 
      ...prev, 
      isListening: true, 
      error: null,
      transcript: null,
    }));
    
    try {
      const result = await window.electronAPI?.voiceInput?.start();
      
      if (!result?.success) {
        throw new Error(result?.error || 'Failed to start voice input');
      }
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isListening: false,
        error: error instanceof Error ? error.message : 'Failed to start voice input',
      }));
    }
  }, [state.isListening]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Stop Listening
  // ─────────────────────────────────────────────────────────────────────────────
  
  const stopListening = useCallback(async (): Promise<string | null> => {
    if (!state.isListening) return null;
    
    setState(prev => ({ 
      ...prev, 
      isListening: false, 
      isProcessing: true,
    }));
    
    try {
      const result = await window.electronAPI?.voiceInput?.stop();
      
      const transcript = result?.success ? result.data?.transcript || null : null;
      
      setState(prev => ({ 
        ...prev, 
        isProcessing: false,
        transcript,
      }));
      
      return transcript;
    } catch (error) {
      setState(prev => ({ 
        ...prev, 
        isProcessing: false,
        error: error instanceof Error ? error.message : 'Failed to stop voice input',
      }));
      return null;
    }
  }, [state.isListening]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Clear Methods
  // ─────────────────────────────────────────────────────────────────────────────
  
  const clearError = useCallback(() => {
    setState(prev => ({ ...prev, error: null }));
  }, []);
  
  const clearTranscript = useCallback(() => {
    setState(prev => ({ ...prev, transcript: null }));
  }, []);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Event Listeners
  // ─────────────────────────────────────────────────────────────────────────────
  
  useEffect(() => {
    // Listen for voice input events from main process
    const handleVoiceInputComplete = (_event: any, data: { transcript: string }) => {
      setState(prev => ({
        ...prev,
        isListening: false,
        isProcessing: false,
        transcript: data.transcript,
      }));
    };
    
    const handleVoiceInputError = (_event: any, data: { error: string }) => {
      setState(prev => ({
        ...prev,
        isListening: false,
        isProcessing: false,
        error: data.error,
      }));
    };
    
    // Register event listeners if electronAPI is available
    window.electronAPI?.onVoiceInputComplete?.(handleVoiceInputComplete);
    window.electronAPI?.onVoiceInputError?.(handleVoiceInputError);
    
    // Check microphone on mount
    checkMicrophone();
    
    return () => {
      // Cleanup listeners if needed
      window.electronAPI?.removeVoiceInputListeners?.();
    };
  }, [checkMicrophone]);
  
  return {
    state,
    startListening,
    stopListening,
    checkMicrophone,
    clearError,
    clearTranscript,
  };
}

export default useVoiceInput;
