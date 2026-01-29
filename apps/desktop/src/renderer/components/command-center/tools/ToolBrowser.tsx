/**
 * Tool Browser
 *
 * Categorized list of available tools.
 */
import React from 'react';
import {
  Clock,
  Brain,
  Save,
  Inbox,
  Search,
  Code,
  File,
  Layers,
  Camera,
  Terminal,
  MessageSquare,
  Users,
  MessageCircle,
  HelpCircle,
  Lock,
} from 'lucide-react';
import type { ToolSchema, ToolCategory } from '../../../types/command-center';
import { CATEGORY_LABELS } from '../../../types/command-center';
import { useCommandCenterStore } from '../../../stores/command-center-store';

interface ToolBrowserProps {
  tools: ToolSchema[];
  selectedToolName: string | null;
  onSelectTool: (toolName: string | null) => void;
}

const CATEGORY_ICONS: Record<ToolCategory, React.ElementType> = {
  session: Clock,
  memory: Brain,
  checkpoint: Save,
  inbox: Inbox,
  rag: Search,
  repo_intel: Code,
  files: File,
  canvas: Layers,
  capture: Camera,
  pty: Terminal,
  interact: MessageSquare,
  collective: Users,
  thinker: MessageCircle,
  other: HelpCircle,
};

// Group tools by category
function groupToolsByCategory(tools: ToolSchema[]): Map<ToolCategory, ToolSchema[]> {
  const groups = new Map<ToolCategory, ToolSchema[]>();

  for (const tool of tools) {
    const category = tool.category;
    if (!groups.has(category)) {
      groups.set(category, []);
    }
    groups.get(category)!.push(tool);
  }

  return groups;
}

export function ToolBrowser({ tools, selectedToolName, onSelectTool }: ToolBrowserProps) {
  const selectedCategory = useCommandCenterStore((s) => s.selectedCategory);
  const setSelectedCategory = useCommandCenterStore((s) => s.setSelectedCategory);

  const groupedTools = groupToolsByCategory(tools);
  const categories = Array.from(groupedTools.keys()).sort();

  // Get unique categories for filter buttons
  const allCategories: (ToolCategory | 'all')[] = ['all', ...categories];

  return (
    <div className="flex flex-col h-full">
      {/* Category Filter */}
      <div className="p-3 border-b border-border overflow-x-auto">
        <div className="flex gap-1 min-w-max">
          {allCategories.map((category) => {
            const Icon = category === 'all' ? HelpCircle : CATEGORY_ICONS[category];
            const count =
              category === 'all' ? tools.length : (groupedTools.get(category)?.length || 0);

            return (
              <button
                key={category}
                onClick={() => setSelectedCategory(category)}
                className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors whitespace-nowrap ${
                  selectedCategory === category
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary/50 text-muted-foreground hover:text-foreground hover:bg-secondary'
                }`}
              >
                <Icon className="w-3 h-3" />
                {CATEGORY_LABELS[category]}
                <span className="opacity-60">({count})</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Tool List */}
      <div className="flex-1 overflow-auto p-2">
        {selectedCategory === 'all' ? (
          // Show all tools grouped by category
          categories.map((category) => {
            const categoryTools = groupedTools.get(category) || [];
            const Icon = CATEGORY_ICONS[category];

            return (
              <div key={category} className="mb-4">
                <div className="flex items-center gap-2 px-2 py-1.5 text-xs font-medium text-muted-foreground uppercase tracking-wide">
                  <Icon className="w-3 h-3" />
                  {CATEGORY_LABELS[category]}
                </div>

                {categoryTools.map((tool) => (
                  <ToolItem
                    key={tool.name}
                    tool={tool}
                    isSelected={tool.name === selectedToolName}
                    onClick={() => onSelectTool(tool.name)}
                  />
                ))}
              </div>
            );
          })
        ) : (
          // Show only tools from selected category
          (groupedTools.get(selectedCategory) || []).map((tool) => (
            <ToolItem
              key={tool.name}
              tool={tool}
              isSelected={tool.name === selectedToolName}
              onClick={() => onSelectTool(tool.name)}
            />
          ))
        )}
      </div>
    </div>
  );
}

interface ToolItemProps {
  tool: ToolSchema;
  isSelected: boolean;
  onClick: () => void;
}

function ToolItem({ tool, isSelected, onClick }: ToolItemProps) {
  return (
    <button
      onClick={onClick}
      className={`w-full flex items-center gap-2 px-3 py-2 rounded-lg text-left transition-colors ${
        isSelected
          ? 'bg-primary/10 border border-primary/30'
          : 'hover:bg-secondary'
      }`}
    >
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="font-medium text-sm text-foreground truncate">{tool.name}</span>
          {tool.leaderOnly && (
            <span title="Leader only">
              <Lock className="w-3 h-3 text-amber-500 flex-shrink-0" />
            </span>
          )}
        </div>
        {tool.description && (
          <p className="text-xs text-muted-foreground truncate">{tool.description}</p>
        )}
      </div>
    </button>
  );
}

export default ToolBrowser;
