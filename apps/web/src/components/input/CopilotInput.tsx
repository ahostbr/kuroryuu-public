/**
 * Copilot Chat Input Component
 * Full-featured input with file attachments, voice, and context display
 */
import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Square, Sparkles } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FileAttachment } from '../../types/files';
import { FileDropZone, AttachButton } from '../attachments';
import { MicrophoneButton } from '../voice';
import { ContextDisplay } from '../context';
import { useSpeechRecognition } from '../../hooks/useSpeechRecognition';
import { cn } from '../../lib/utils';

interface CopilotInputProps {
  onSubmit: (message: string, context: FileAttachment[]) => void;
  onStop?: () => void;
  isStreaming?: boolean;
  disabled?: boolean;
  placeholder?: string;
  className?: string;
}

export function CopilotInput({
  onSubmit,
  onStop,
  isStreaming = false,
  disabled = false,
  placeholder = "Ask Kuroryuu anything...",
  className,
}: CopilotInputProps) {
  const [input, setInput] = useState('');
  const [contextFiles, setContextFiles] = useState<FileAttachment[]>([]);
  const [contextCollapsed, setContextCollapsed] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  
  // Speech recognition
  const {
    state: voiceState,
    interimTranscript,
    isSupported: voiceSupported,
    toggle: toggleVoice,
    reset: resetVoice,
  } = useSpeechRecognition({
    onFinalTranscript: (text) => {
      setInput((prev) => prev + text);
    },
  });
  
  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 200)}px`;
    }
  }, [input]);
  
  // Focus textarea on mount
  useEffect(() => {
    textareaRef.current?.focus();
  }, []);
  
  const handleSubmit = useCallback(() => {
    const trimmedInput = input.trim();
    if (!trimmedInput || isStreaming || disabled) return;
    
    onSubmit(trimmedInput, contextFiles);
    setInput('');
    setContextFiles([]);
    resetVoice();
    textareaRef.current?.focus();
  }, [input, contextFiles, isStreaming, disabled, onSubmit, resetVoice]);
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };
  
  const handleFilesAdded = (files: FileAttachment[]) => {
    setContextFiles((prev) => [...prev, ...files]);
  };
  
  const handleRemoveFile = (id: string) => {
    setContextFiles((prev) => prev.filter((f) => f.id !== id));
  };
  
  const handleClearAllFiles = () => {
    setContextFiles([]);
  };
  
  const handleAddFilesClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        const attachments: FileAttachment[] = Array.from(files).map((file) => ({
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: file.name,
          path: file.webkitRelativePath || file.name,
          size: file.size,
          type: 'file' as const,
          addedAt: Date.now(),
        }));
        handleFilesAdded(attachments);
      }
    };
    input.click();
  };
  
  const hasContent = input.trim().length > 0 || contextFiles.length > 0;
  
  return (
    <FileDropZone
      onFilesAdded={handleFilesAdded}
      disabled={disabled}
      className={cn("w-full", className)}
    >
      <div className={cn(
        "relative rounded-xl border transition-colors",
        "bg-[var(--copilot-bg-input)]",
        isFocused
          ? "border-[var(--copilot-border-focus)]"
          : "border-[var(--copilot-border-default)]",
        disabled && "opacity-60"
      )}>
        {/* Context Display */}
        <AnimatePresence>
          {contextFiles.length > 0 && (
            <ContextDisplay
              files={contextFiles}
              onRemoveFile={handleRemoveFile}
              onClearAll={handleClearAllFiles}
              onAddFiles={handleAddFilesClick}
              collapsed={contextCollapsed}
              onToggleCollapse={() => setContextCollapsed(!contextCollapsed)}
            />
          )}
        </AnimatePresence>
        
        {/* Recording Indicator Banner */}
        {voiceState === 'listening' && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: 'auto' }}
            exit={{ opacity: 0, height: 0 }}
            className="flex items-center justify-center gap-2 py-2 px-4 bg-red-500/20 border-b border-red-500/30"
          >
            <motion.div
              className="w-3 h-3 rounded-full bg-red-500"
              animate={{ scale: [1, 1.2, 1], opacity: [1, 0.5, 1] }}
              transition={{ duration: 1, repeat: Infinity }}
            />
            <span className="text-red-400 text-sm font-medium">Listening... Speak now</span>
            {interimTranscript && (
              <span className="text-red-300 text-sm italic ml-2">"{interimTranscript}"</span>
            )}
          </motion.div>
        )}
        
        {/* Main Input Area */}
        <div className="flex items-end gap-2 p-3">
          {/* Left Controls */}
          <div className="flex items-center gap-1">
            <AttachButton
              onFilesSelected={handleFilesAdded}
              disabled={disabled}
            />
          </div>
          
          {/* Textarea */}
          <div className="flex-1 relative">
            <textarea
              ref={textareaRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              placeholder={placeholder}
              disabled={disabled}
              rows={1}
              className={cn(
                "w-full resize-none bg-transparent",
                "text-[var(--copilot-text-primary)] placeholder-[var(--copilot-text-muted)]",
                "text-sm leading-relaxed",
                "focus:outline-none",
                "max-h-[200px]"
              )}
            />
            
            {/* Interim transcript indicator */}
            {voiceState === 'listening' && interimTranscript && (
              <div className="absolute left-0 bottom-full mb-1 px-2 py-1 rounded bg-red-500/10 text-red-400 text-xs">
                {interimTranscript}
              </div>
            )}
          </div>
          
          {/* Right Controls */}
          <div className="flex items-center gap-1">
            {/* Microphone */}
            <MicrophoneButton
              state={voiceState}
              isSupported={voiceSupported}
              onToggle={toggleVoice}
              disabled={disabled || isStreaming}
              interimTranscript={interimTranscript}
            />
            
            {/* Send/Stop Button */}
            {isStreaming ? (
              <motion.button
                onClick={onStop}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  "bg-red-500/20 text-red-400 hover:bg-red-500/30"
                )}
                title="Stop generating"
              >
                <Square className="w-5 h-5 fill-current" />
              </motion.button>
            ) : (
              <motion.button
                onClick={handleSubmit}
                disabled={!hasContent || disabled}
                whileTap={{ scale: 0.95 }}
                className={cn(
                  "p-2 rounded-lg transition-colors",
                  hasContent && !disabled
                    ? "bg-[var(--copilot-btn-primary)] text-white hover:bg-[var(--copilot-btn-primary-hover)]"
                    : "text-[var(--copilot-text-muted)] cursor-not-allowed"
                )}
                title="Send message"
              >
                <Send className="w-5 h-5" />
              </motion.button>
            )}
          </div>
        </div>
        
        {/* Bottom hint */}
        <div className="px-4 pb-2 flex items-center justify-between text-xs text-[var(--copilot-text-muted)]">
          <div className="flex items-center gap-4">
            <span>
              <kbd className="px-1 py-0.5 rounded bg-[var(--copilot-bg-tertiary)] text-[10px]">Enter</kbd>
              {' '}to send
            </span>
            <span>
              <kbd className="px-1 py-0.5 rounded bg-[var(--copilot-bg-tertiary)] text-[10px]">Shift+Enter</kbd>
              {' '}for new line
            </span>
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="w-3 h-3 text-[var(--copilot-accent-yellow)]" />
            <span>Kuroryuu</span>
          </div>
        </div>
      </div>
    </FileDropZone>
  );
}
