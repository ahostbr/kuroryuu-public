/**
 * SlashCommandMenu - Copilot-style slash command picker
 *
 * Shows available commands when user types "/" in the chat input.
 * Commands can have descriptions and scope indicators.
 */

import { useState, useEffect, useRef, useMemo } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  HelpCircle,
  Trash2,
  Gauge,
  Minimize2,
  History,
  Bot,
  Server,
  Settings,
  Stethoscope,
  Activity,
  Webhook,
  FileText,
} from 'lucide-react';

// Slash command definition
export interface SlashCommand {
  name: string;
  description: string;
  icon: React.ReactNode;
  scope?: string; // e.g., @workspace, @terminal, @cli
  action?: () => void;
}

// Session management and system commands (12 total)
// Coding assistance commands (/explain, /fix, etc.) removed - use @file instead
export const SLASH_COMMANDS: SlashCommand[] = [
  // Core
  {
    name: '/help',
    description: 'Show available commands',
    icon: <HelpCircle className="w-4 h-4" />,
  },
  {
    name: '/clear',
    description: 'Clear conversation history',
    icon: <Trash2 className="w-4 h-4" />,
  },

  // Context Management
  {
    name: '/context',
    description: 'Show token usage and context window',
    icon: <Gauge className="w-4 h-4" />,
  },
  {
    name: '/compact',
    description: 'Summarize history to save context',
    icon: <Minimize2 className="w-4 h-4" />,
  },
  {
    name: '/history',
    description: 'Show conversation history',
    icon: <History className="w-4 h-4" />,
  },

  // Configuration
  {
    name: '/model',
    description: 'Switch AI model',
    icon: <Bot className="w-4 h-4" />,
  },
  {
    name: '/provider',
    description: 'Switch provider',
    icon: <Server className="w-4 h-4" />,
  },
  {
    name: '/config',
    description: 'Show current configuration',
    icon: <Settings className="w-4 h-4" />,
  },

  // System
  {
    name: '/doctor',
    description: 'Check system health',
    icon: <Stethoscope className="w-4 h-4" />,
  },
  {
    name: '/status',
    description: 'Show connection status',
    icon: <Activity className="w-4 h-4" />,
  },
  {
    name: '/hooks',
    description: 'Configure event hooks',
    icon: <Webhook className="w-4 h-4" />,
  },
  {
    name: '/memory',
    description: 'Open memory files',
    icon: <FileText className="w-4 h-4" />,
  },
];

interface SlashCommandMenuProps {
  isOpen: boolean;
  filter: string; // Current text after "/"
  onSelect: (command: SlashCommand) => void;
  onClose: () => void;
  highlightedIndex: number;
  setHighlightedIndex: (index: number) => void;
}

export function SlashCommandMenu({
  isOpen,
  filter,
  onSelect,
  onClose,
  highlightedIndex,
  setHighlightedIndex,
}: SlashCommandMenuProps) {
  const listRef = useRef<HTMLDivElement>(null);

  // Filter commands based on input
  const filteredCommands = useMemo(() => {
    if (!filter) return SLASH_COMMANDS;
    const searchTerm = filter.toLowerCase();
    return SLASH_COMMANDS.filter(
      cmd =>
        cmd.name.toLowerCase().includes(searchTerm) ||
        cmd.description.toLowerCase().includes(searchTerm)
    );
  }, [filter]);

  // Scroll highlighted item into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-command-item]');
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  // Reset highlight when filter changes
  useEffect(() => {
    setHighlightedIndex(0);
  }, [filter, setHighlightedIndex]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.12 }}
        className="slash-command-menu"
      >
        <div ref={listRef} className="slash-command-list">
          {filteredCommands.length === 0 ? (
            <div className="slash-command-empty">
              No commands match "{filter}"
            </div>
          ) : (
            filteredCommands.map((cmd, index) => (
              <button
                key={cmd.name}
                data-command-item
                onClick={() => onSelect(cmd)}
                onMouseEnter={() => setHighlightedIndex(index)}
                className={`slash-command-item ${
                  index === highlightedIndex ? 'highlighted' : ''
                }`}
              >
                <span className="slash-command-icon">{cmd.icon}</span>
                <div className="slash-command-content">
                  <span className="slash-command-name">{cmd.name}</span>
                  <span className="slash-command-desc">{cmd.description}</span>
                </div>
                {cmd.scope && (
                  <span className="slash-command-scope">{cmd.scope}</span>
                )}
              </button>
            ))
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default SlashCommandMenu;
