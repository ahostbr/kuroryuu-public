/**
 * Voice Input Button Component
 * 
 * Microphone button for chatbot input area with:
 * - Press-to-talk functionality
 * - Visual feedback during listening
 * - Status indicators
 * 
 * Requirements: 2.1, 2.2, 2.3
 */

import React, { useState, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface VoiceInputButtonProps {
  onTranscript: (text: string) => void;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
}

export type VoiceButtonState = 'idle' | 'listening' | 'processing' | 'error';

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export const VoiceInputButton: React.FC<VoiceInputButtonProps> = ({
  onTranscript,
  onError,
  disabled = false,
  className = '',
}) => {
  const [state, setState] = useState<VoiceButtonState>('idle');
  const [isHovered, setIsHovered] = useState(false);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────
  
  const handleClick = useCallback(async () => {
    if (disabled) return;
    
    if (state === 'listening') {
      // Stop listening
      setState('processing');
      
      try {
        // Send IPC to stop voice input
        const result = await window.electronAPI?.voiceInput?.stop();
        
        if (result?.success && result.data?.transcript) {
          onTranscript(result.data.transcript);
        }
        
        setState('idle');
      } catch (error) {
        setState('error');
        onError?.(error instanceof Error ? error.message : 'Failed to stop voice input');
        setTimeout(() => setState('idle'), 2000);
      }
    } else if (state === 'idle') {
      // Start listening
      setState('listening');
      
      try {
        // Send IPC to start voice input
        const result = await window.electronAPI?.voiceInput?.start();
        
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to start voice input');
        }
        
        // Listen for transcript completion via event
        // The actual transcript will come through the event system
      } catch (error) {
        setState('error');
        onError?.(error instanceof Error ? error.message : 'Failed to start voice input');
        setTimeout(() => setState('idle'), 2000);
      }
    }
  }, [state, disabled, onTranscript, onError]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Styles
  // ─────────────────────────────────────────────────────────────────────────────
  
  const getButtonStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '36px',
      height: '36px',
      borderRadius: '50%',
      border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.2s ease',
      outline: 'none',
    };
    
    switch (state) {
      case 'listening':
        return {
          ...baseStyles,
          backgroundColor: '#ef4444',
          color: '#ffffff',
          animation: 'pulse 1.5s infinite',
        };
      case 'processing':
        return {
          ...baseStyles,
          backgroundColor: '#f59e0b',
          color: '#ffffff',
        };
      case 'error':
        return {
          ...baseStyles,
          backgroundColor: '#dc2626',
          color: '#ffffff',
        };
      default:
        return {
          ...baseStyles,
          backgroundColor: isHovered && !disabled ? '#3b82f6' : '#4b5563',
          color: disabled ? '#9ca3af' : '#ffffff',
          opacity: disabled ? 0.5 : 1,
        };
    }
  };
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Icon
  // ─────────────────────────────────────────────────────────────────────────────
  
  const renderIcon = () => {
    if (state === 'processing') {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" strokeDasharray="32" strokeDashoffset="32">
            <animate attributeName="stroke-dashoffset" values="32;0" dur="1s" repeatCount="indefinite" />
          </circle>
        </svg>
      );
    }
    
    if (state === 'error') {
      return (
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    }
    
    // Microphone icon
    return (
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z" />
        <path d="M19 10v2a7 7 0 0 1-14 0v-2" />
        <line x1="12" y1="19" x2="12" y2="23" />
        <line x1="8" y1="23" x2="16" y2="23" />
      </svg>
    );
  };
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  
  return (
    <button
      type="button"
      onClick={handleClick}
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      style={getButtonStyles()}
      className={className}
      disabled={disabled}
      aria-label={state === 'listening' ? 'Stop voice input' : 'Start voice input'}
      title={state === 'listening' ? 'Click to stop' : 'Click to speak'}
    >
      {renderIcon()}
    </button>
  );
};

export default VoiceInputButton;
