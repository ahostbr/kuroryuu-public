/**
 * TTS Button Component
 * 
 * Speaker button for chatbot messages with:
 * - Click to speak message
 * - Visual feedback during speech
 * - Stop/pause controls
 * 
 * Requirements: 3.1, 3.2, 3.3
 */

import React, { useState, useCallback } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface TTSButtonProps {
  text: string;
  onError?: (error: string) => void;
  disabled?: boolean;
  className?: string;
}

export type TTSButtonState = 'idle' | 'speaking' | 'paused' | 'error';

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export const TTSButton: React.FC<TTSButtonProps> = ({
  text,
  onError,
  disabled = false,
  className = '',
}) => {
  const [state, setState] = useState<TTSButtonState>('idle');
  const [isHovered, setIsHovered] = useState(false);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────
  
  const handleClick = useCallback(async () => {
    if (disabled) return;
    
    if (state === 'speaking') {
      // Stop speaking
      try {
        await window.electronAPI?.tts?.stop();
        setState('idle');
      } catch (error) {
        setState('error');
        onError?.(error instanceof Error ? error.message : 'Failed to stop speech');
        setTimeout(() => setState('idle'), 2000);
      }
    } else if (state === 'idle') {
      // Start speaking
      setState('speaking');
      
      try {
        const result = await window.electronAPI?.tts?.speak({ text });
        
        if (!result?.success) {
          throw new Error(result?.error || 'Failed to speak');
        }
        
        // Speech started - actual completion comes via event
      } catch (error) {
        setState('error');
        onError?.(error instanceof Error ? error.message : 'Failed to speak');
        setTimeout(() => setState('idle'), 2000);
      }
    }
  }, [state, disabled, text, onError]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Styles
  // ─────────────────────────────────────────────────────────────────────────────
  
  const getButtonStyles = (): React.CSSProperties => {
    const baseStyles: React.CSSProperties = {
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      width: '32px',
      height: '32px',
      borderRadius: '6px',
      border: 'none',
      cursor: disabled ? 'not-allowed' : 'pointer',
      transition: 'all 0.2s ease',
      outline: 'none',
      padding: '4px',
    };
    
    switch (state) {
      case 'speaking':
        return {
          ...baseStyles,
          backgroundColor: '#3b82f6',
          color: '#ffffff',
        };
      case 'paused':
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
          backgroundColor: isHovered && !disabled ? '#374151' : 'transparent',
          color: disabled ? '#9ca3af' : '#6b7280',
          opacity: disabled ? 0.5 : 1,
        };
    }
  };
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Icon
  // ─────────────────────────────────────────────────────────────────────────────
  
  const renderIcon = () => {
    if (state === 'speaking') {
      // Stop icon
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
          <rect x="6" y="6" width="12" height="12" rx="2" />
        </svg>
      );
    }
    
    if (state === 'error') {
      return (
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10" />
          <line x1="15" y1="9" x2="9" y2="15" />
          <line x1="9" y1="9" x2="15" y2="15" />
        </svg>
      );
    }
    
    // Speaker icon
    return (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5" />
        <path d="M15.54 8.46a5 5 0 0 1 0 7.07" />
        <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
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
      aria-label={state === 'speaking' ? 'Stop speaking' : 'Speak message'}
      title={state === 'speaking' ? 'Click to stop' : 'Click to speak'}
    >
      {renderIcon()}
    </button>
  );
};

export default TTSButton;
