/**
 * Microphone Button Component
 * Copilot-style voice input with visual feedback
 */
import { useState } from 'react';
import { Mic, MicOff, Loader2, Volume2 } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '../../lib/utils';
import type { VoiceState } from '../../types/voice';

interface MicrophoneButtonProps {
  state: VoiceState;
  isSupported: boolean;
  onToggle: () => void;
  disabled?: boolean;
  interimTranscript?: string;
}

export function MicrophoneButton({
  state,
  isSupported,
  onToggle,
  disabled,
  interimTranscript,
}: MicrophoneButtonProps) {
  const [showTooltip, setShowTooltip] = useState(false);
  
  const isListening = state === 'listening';
  const isProcessing = state === 'processing';
  const isSpeaking = state === 'speaking';
  const isError = state === 'error';
  
  if (!isSupported) {
    return (
      <button
        disabled
        className={cn(
          "p-2 rounded-lg",
          "text-[var(--copilot-text-muted)] cursor-not-allowed opacity-50"
        )}
        title="Speech recognition not supported in this browser"
      >
        <MicOff className="w-5 h-5" />
      </button>
    );
  }
  
  return (
    <div className="relative">
      <motion.button
        onClick={onToggle}
        disabled={disabled || isProcessing}
        whileTap={{ scale: 0.95 }}
        onMouseEnter={() => setShowTooltip(true)}
        onMouseLeave={() => setShowTooltip(false)}
        className={cn(
          "relative p-2 rounded-lg transition-colors",
          isListening && "bg-red-500 text-white shadow-lg shadow-red-500/50",
          isProcessing && "bg-yellow-500/20 text-yellow-400",
          isSpeaking && "bg-[var(--copilot-accent-blue)]/20 text-[var(--copilot-accent-blue)]",
          isError && "bg-red-500/20 text-red-400",
          state === 'idle' && "text-[var(--copilot-text-muted)] hover:text-[var(--copilot-text-primary)] hover:bg-[var(--copilot-bg-hover)]",
          (disabled || isProcessing) && "opacity-50 cursor-not-allowed"
        )}
      >
        {/* Pulse animation when listening */}
        {isListening && (
          <motion.div
            className="absolute inset-0 rounded-lg bg-red-500/20"
            animate={{ scale: [1, 1.3, 1], opacity: [0.5, 0, 0.5] }}
            transition={{ duration: 1.5, repeat: Infinity }}
          />
        )}
        
        {/* Icon */}
        {isProcessing ? (
          <Loader2 className="w-5 h-5 animate-spin" />
        ) : isSpeaking ? (
          <Volume2 className="w-5 h-5" />
        ) : isListening ? (
          <Mic className="w-5 h-5" />
        ) : (
          <Mic className="w-5 h-5" />
        )}
      </motion.button>
      
      {/* Tooltip */}
      <AnimatePresence>
        {showTooltip && (
          <motion.div
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 4 }}
            className={cn(
              "absolute bottom-full left-1/2 -translate-x-1/2 mb-2 px-2 py-1 rounded",
              "bg-[var(--copilot-bg-secondary)] border border-[var(--copilot-border-default)]",
              "text-xs text-[var(--copilot-text-secondary)] whitespace-nowrap"
            )}
          >
            {isListening ? 'Click to stop' : 'Voice input'}
          </motion.div>
        )}
      </AnimatePresence>
      
      {/* Interim transcript preview */}
      <AnimatePresence>
        {isListening && interimTranscript && (
          <motion.div
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            className={cn(
              "absolute bottom-full left-1/2 -translate-x-1/2 mb-8 px-3 py-2 rounded-lg",
              "bg-[var(--copilot-bg-secondary)] border border-[var(--copilot-border-default)]",
              "text-sm text-[var(--copilot-text-primary)] max-w-[300px] text-center",
              "shadow-[var(--copilot-shadow-lg)]"
            )}
          >
            <div className="flex items-center gap-2">
              <motion.div
                className="w-2 h-2 rounded-full bg-red-400"
                animate={{ opacity: [1, 0.3, 1] }}
                transition={{ duration: 1, repeat: Infinity }}
              />
              <span className="truncate">{interimTranscript}</span>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface VoiceWaveformProps {
  isActive: boolean;
  className?: string;
}

export function VoiceWaveform({ isActive, className }: VoiceWaveformProps) {
  const bars = [1, 2, 3, 4, 5];
  
  return (
    <div className={cn("flex items-center gap-0.5 h-4", className)}>
      {bars.map((bar) => (
        <motion.div
          key={bar}
          className="w-1 bg-red-400 rounded-full"
          animate={isActive ? {
            height: ['30%', '100%', '30%'],
          } : { height: '30%' }}
          transition={{
            duration: 0.5,
            repeat: isActive ? Infinity : 0,
            delay: bar * 0.1,
          }}
        />
      ))}
    </div>
  );
}
