/**
 * EmptyState - Kuroryuu branded empty chat state
 * Elegant imperial dragon aesthetic with gold accents
 */

import { motion } from 'framer-motion';

// Kuroryuu brand icon
import kuroryuuIcon from '../../../../build/icon.png';

interface EmptyStateProps {
  onSuggestionClick: (suggestion: string) => void;
}

const SUGGESTIONS = [
  'Explain this code',
  'Find bugs in selection',
  'Add documentation',
  'Refactor for readability',
];

export function EmptyState({ onSuggestionClick }: EmptyStateProps) {
  return (
    <div className="cp-empty-state h-full">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, ease: 'easeOut' }}
        className="text-center max-w-md"
      >
        {/* Dragon Logo with subtle glow animation */}
        <motion.div
          initial={{ scale: 0.9, opacity: 0 }}
          animate={{ scale: 1, opacity: 1 }}
          transition={{ duration: 0.8, ease: 'easeOut' }}
          className="relative mb-6"
        >
          {/* Glow effect behind logo */}
          <motion.div
            animate={{
              opacity: [0.3, 0.6, 0.3],
              scale: [1, 1.1, 1],
            }}
            transition={{
              duration: 3,
              repeat: Infinity,
              ease: 'easeInOut',
            }}
            className="absolute inset-0 flex items-center justify-center"
          >
            <div
              className="w-24 h-24 rounded-full"
              style={{
                background: 'radial-gradient(circle, rgba(201, 162, 39, 0.2) 0%, transparent 70%)',
              }}
            />
          </motion.div>

          {/* Dragon icon */}
          <motion.img
            src={kuroryuuIcon}
            alt="Kuroryuu"
            className="w-20 h-20 mx-auto relative z-10 rounded-2xl"
            style={{
              filter: 'drop-shadow(0 0 12px rgba(201, 162, 39, 0.3))',
            }}
            whileHover={{ scale: 1.05 }}
            transition={{ type: 'spring', stiffness: 300 }}
          />
        </motion.div>

        {/* Title with elegant styling */}
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="text-2xl font-semibold mb-2 tracking-wide"
          style={{
            color: 'var(--cp-text-bright)',
            fontFamily: "'Segoe UI', -apple-system, BlinkMacSystemFont, sans-serif",
          }}
        >
          Kuroryuu
        </motion.h1>

        {/* Tagline with gold accent */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.3, duration: 0.5 }}
          className="text-sm mb-8"
          style={{ color: 'var(--cp-accent-gold)' }}
        >
          黒き幻影の霧の龍
        </motion.p>

        {/* Subtitle */}
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 0.5 }}
          className="cp-empty-subtitle"
        >
          Your AI-powered coding assistant
        </motion.p>

        {/* Suggestion buttons with staggered entrance */}
        <div className="grid gap-2 w-full">
          {SUGGESTIONS.map((suggestion, index) => (
            <motion.button
              key={suggestion}
              initial={{ opacity: 0, x: -20 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: 0.5 + index * 0.1, duration: 0.3 }}
              onClick={() => onSuggestionClick(suggestion)}
              className="cp-suggestion-btn group"
              whileHover={{ x: 4 }}
            >
              <span
                className="inline-block w-1.5 h-1.5 rounded-full mr-3 transition-colors"
                style={{
                  backgroundColor: 'var(--cp-accent-gold)',
                  opacity: 0.5,
                }}
              />
              {suggestion}
            </motion.button>
          ))}
        </div>
      </motion.div>
    </div>
  );
}

export default EmptyState;
