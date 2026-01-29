/**
 * AtMentionPicker - Copilot-style @ mention context picker
 *
 * Appears when user types "@" in the chat input.
 * Features:
 * - Category selection (Files, Directories)
 * - File type icons with color coding
 * - Folder navigation with breadcrumbs
 * - Back button for navigation history
 */

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  Code2,
  FileText,
  Folder,
  ChevronRight,
} from 'lucide-react';
import { getFileIcon } from './file-icons';

// ============================================================================
// Types
// ============================================================================

export type MentionCategory = 'files' | 'directories';

export interface MentionItem {
  id: string;
  type: MentionCategory;
  name: string;
  path?: string;
  meta?: string;           // e.g., "(43 files)"
  isFolder?: boolean;      // Whether this is a folder
  isNavigable?: boolean;   // Whether clicking navigates into it
}

export interface MentionCategoryDef {
  id: MentionCategory;
  label: string;
  icon: React.ReactNode;
}

// ============================================================================
// Category Definitions
// ============================================================================

const MENTION_CATEGORIES: MentionCategoryDef[] = [
  { id: 'files', label: 'Files', icon: <FileText className="w-4 h-4" /> },
  { id: 'directories', label: 'Directories', icon: <Folder className="w-4 h-4" /> },
];

// ============================================================================
// Props
// ============================================================================

interface AtMentionPickerProps {
  isOpen: boolean;
  filter: string;
  onSelect: (item: MentionItem | MentionCategoryDef) => void;
  onClose: () => void;
  onFilterChange: (filter: string) => void;
  highlightedIndex: number;
  setHighlightedIndex: (index: number) => void;
  files?: MentionItem[];
  directories?: MentionItem[];
  // Folder navigation
  currentFolder?: string;
  onFolderNavigate?: (path: string) => void;
  folderContents?: MentionItem[];
}

// ============================================================================
// Component
// ============================================================================

export function AtMentionPicker({
  isOpen,
  filter,
  onSelect,
  onClose,
  onFilterChange,
  highlightedIndex,
  setHighlightedIndex,
  files = [],
  directories = [],
  currentFolder,
  onFolderNavigate,
  folderContents = [],
}: AtMentionPickerProps) {
  const listRef = useRef<HTMLDivElement>(null);
  const [expandedCategory, setExpandedCategory] = useState<MentionCategory | null>(null);
  const [folderStack, setFolderStack] = useState<string[]>([]);

  // Compute breadcrumbs from folder stack
  const breadcrumbs = useMemo(() => {
    if (folderStack.length === 0 && currentFolder) {
      // Initialize from currentFolder
      return currentFolder.split(/[/\\]/).filter(Boolean);
    }
    if (folderStack.length === 0) return [];
    // Get segments from the current folder path
    const lastFolder = folderStack[folderStack.length - 1];
    return lastFolder.split(/[/\\]/).filter(Boolean);
  }, [folderStack, currentFolder]);

  // Whether we're in folder browsing mode
  const isBrowsingFolders = folderStack.length > 0 || (currentFolder && expandedCategory === 'directories');

  // Parse filter to detect category prefix (e.g., "file:" or "directory:")
  const { categoryPrefix, searchTerm } = useMemo(() => {
    const match = filter.match(/^(\w+):(.*)$/);
    if (match) {
      return { categoryPrefix: match[1].toLowerCase(), searchTerm: match[2] };
    }
    return { categoryPrefix: null, searchTerm: filter };
  }, [filter]);

  // Get items for a category
  const getItemsForCategory = useCallback((cat: MentionCategory): MentionItem[] => {
    // If we're browsing a folder, use folderContents
    if (isBrowsingFolders && folderContents.length > 0) {
      if (cat === 'files') {
        return folderContents.filter(item => !item.isFolder);
      } else {
        return folderContents.filter(item => item.isFolder);
      }
    }
    switch (cat) {
      case 'files': return files;
      case 'directories': return directories;
      default: return [];
    }
  }, [files, directories, isBrowsingFolders, folderContents]);

  // Filter items based on search term
  const filterItems = useCallback((items: MentionItem[], term: string): MentionItem[] => {
    if (!term) return items.slice(0, 20);
    const lowerTerm = term.toLowerCase();
    return items.filter(item =>
      item.name.toLowerCase().includes(lowerTerm) ||
      item.path?.toLowerCase().includes(lowerTerm)
    ).slice(0, 20);
  }, []);

  // Determine what to show
  const displayMode = useMemo(() => {
    // If browsing folders, show folder contents (mixed files and folders)
    if (isBrowsingFolders && folderContents.length > 0) {
      return {
        mode: 'folder-browse' as const,
        items: filterItems(folderContents, searchTerm),
        breadcrumbs,
      };
    }

    // If category prefix detected
    if (categoryPrefix) {
      const cat = MENTION_CATEGORIES.find(c =>
        c.id.startsWith(categoryPrefix) || c.label.toLowerCase().startsWith(categoryPrefix)
      );
      if (cat) {
        return { mode: 'items' as const, category: cat, items: filterItems(getItemsForCategory(cat.id), searchTerm) };
      }
    }

    // If a category is expanded
    if (expandedCategory) {
      const cat = MENTION_CATEGORIES.find(c => c.id === expandedCategory)!;
      return { mode: 'items' as const, category: cat, items: filterItems(getItemsForCategory(expandedCategory), searchTerm) };
    }

    // Default: show category list
    const filteredCategories = searchTerm
      ? MENTION_CATEGORIES.filter(c => c.label.toLowerCase().includes(searchTerm.toLowerCase()))
      : MENTION_CATEGORIES;
    return { mode: 'categories' as const, categories: filteredCategories };
  }, [categoryPrefix, expandedCategory, searchTerm, getItemsForCategory, filterItems, isBrowsingFolders, folderContents, breadcrumbs]);

  // Flat list for keyboard navigation
  const flatItems = useMemo(() => {
    if (displayMode.mode === 'categories') {
      return displayMode.categories.map(cat => ({ type: 'category' as const, data: cat }));
    } else if (displayMode.mode === 'folder-browse') {
      return displayMode.items.map(item => ({ type: 'item' as const, data: item }));
    } else {
      return displayMode.items.map(item => ({ type: 'item' as const, data: item }));
    }
  }, [displayMode]);

  // Scroll highlighted into view
  useEffect(() => {
    if (highlightedIndex >= 0 && listRef.current) {
      const items = listRef.current.querySelectorAll('[data-mention-item]');
      items[highlightedIndex]?.scrollIntoView({ block: 'nearest' });
    }
  }, [highlightedIndex]);

  // Reset on open
  useEffect(() => {
    if (isOpen) {
      setExpandedCategory(null);
      setFolderStack([]);
      setHighlightedIndex(0);
    }
  }, [isOpen, setHighlightedIndex]);

  // Reset highlight on mode change
  useEffect(() => {
    setHighlightedIndex(0);
  }, [displayMode.mode, expandedCategory, folderStack.length, setHighlightedIndex]);

  // Handle selection
  const handleSelect = useCallback((item: typeof flatItems[number]) => {
    if (item.type === 'category') {
      const cat = item.data as MentionCategoryDef;
      setExpandedCategory(cat.id);
      onFilterChange(`${cat.id}:`);
    } else {
      const mentionItem = item.data as MentionItem;

      // If it's a navigable folder, drill into it
      if (mentionItem.isNavigable && mentionItem.isFolder && onFolderNavigate) {
        const newPath = mentionItem.path || mentionItem.name;
        setFolderStack(prev => [...prev, newPath]);
        onFolderNavigate(newPath);
        setHighlightedIndex(0);
      } else {
        // Otherwise, select the item
        onSelect(mentionItem);
      }
    }
  }, [onSelect, onFilterChange, onFolderNavigate, setHighlightedIndex]);

  // Handle back navigation
  const handleBack = useCallback(() => {
    if (folderStack.length > 1) {
      // Pop one level up
      const newStack = folderStack.slice(0, -1);
      setFolderStack(newStack);
      const parentPath = newStack[newStack.length - 1];
      onFolderNavigate?.(parentPath);
    } else if (folderStack.length === 1) {
      // Back to category view
      setFolderStack([]);
      setExpandedCategory(null);
      onFilterChange('');
    } else {
      // Back from category items to categories
      setExpandedCategory(null);
      onFilterChange('');
    }
  }, [folderStack, onFolderNavigate, onFilterChange]);

  // Navigate to specific breadcrumb
  const navigateToBreadcrumb = useCallback((index: number) => {
    if (breadcrumbs.length === 0) return;

    // Build path up to the clicked segment
    const targetPath = breadcrumbs.slice(0, index + 1).join('/');

    // Update folder stack to this level
    const newStack = folderStack.slice(0, 1); // Keep root
    if (index > 0) {
      // Reconstruct path for this level
      const segments = breadcrumbs.slice(0, index + 1);
      newStack[0] = segments.join('/');
    }

    setFolderStack([targetPath]);
    onFolderNavigate?.(targetPath);
  }, [breadcrumbs, folderStack, onFolderNavigate]);

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0, y: 4 }}
        animate={{ opacity: 1, y: 0 }}
        exit={{ opacity: 0, y: 4 }}
        transition={{ duration: 0.12 }}
        className="at-mention-picker"
      >
        {/* Header */}
        <div className="at-mention-header">
          {displayMode.mode === 'folder-browse' ? (
            // Folder browsing header with breadcrumbs
            <>
              <button className="at-mention-back" onClick={handleBack}>
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <div className="at-mention-breadcrumb">
                {breadcrumbs.map((segment, idx) => (
                  <div key={idx} className="at-mention-breadcrumb-segment">
                    {idx > 0 && <span className="at-mention-breadcrumb-sep">/</span>}
                    <button
                      onClick={() => navigateToBreadcrumb(idx)}
                      className="at-mention-breadcrumb-btn"
                      title={segment}
                    >
                      {segment.length > 12 ? segment.slice(0, 10) + '...' : segment}
                    </button>
                  </div>
                ))}
              </div>
              <span className="at-mention-header-arrow">→</span>
            </>
          ) : displayMode.mode === 'items' ? (
            // Category items header
            <>
              <button className="at-mention-back" onClick={handleBack}>
                <ChevronRight className="w-4 h-4 rotate-180" />
              </button>
              <span className="at-mention-header-icon">{displayMode.category.icon}</span>
              <span className="at-mention-header-title">{displayMode.category.label}</span>
              <span className="at-mention-header-arrow">→</span>
            </>
          ) : (
            // Default categories header
            <>
              <Code2 className="w-4 h-4 at-mention-header-icon" />
              <span className="at-mention-header-title">Code Context Items</span>
              <span className="at-mention-header-arrow">→</span>
            </>
          )}
        </div>

        {/* List */}
        <div ref={listRef} className="at-mention-list">
          {displayMode.mode === 'categories' ? (
            // Category list
            displayMode.categories.length === 0 ? (
              <div className="at-mention-empty">No categories match "{searchTerm}"</div>
            ) : (
              displayMode.categories.map((cat, index) => (
                <button
                  key={cat.id}
                  data-mention-item
                  onClick={() => handleSelect({ type: 'category', data: cat })}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`at-mention-category-item ${index === highlightedIndex ? 'highlighted' : ''}`}
                >
                  <span className="at-mention-category-icon">{cat.icon}</span>
                  <span className="at-mention-category-label">{cat.label}</span>
                </button>
              ))
            )
          ) : displayMode.mode === 'folder-browse' ? (
            // Folder browsing view - mixed files and folders
            displayMode.items.length === 0 ? (
              <div className="at-mention-empty">
                Empty folder
                {searchTerm && ` (no matches for "${searchTerm}")`}
              </div>
            ) : (
              displayMode.items.map((item, index) => (
                <button
                  key={item.id}
                  data-mention-item
                  onClick={() => handleSelect({ type: 'item', data: item })}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`at-mention-item ${index === highlightedIndex ? 'highlighted' : ''} ${item.isNavigable ? 'is-navigable' : ''}`}
                >
                  <span className="at-mention-item-icon">
                    {getFileIcon(item.name, item.isFolder, false)}
                  </span>
                  <div className="at-mention-item-content">
                    <span className="at-mention-item-name">{item.name}</span>
                    {item.path && <span className="at-mention-item-path">{item.path}</span>}
                  </div>
                  {item.meta && <span className="at-mention-item-meta">{item.meta}</span>}
                  {item.isNavigable && (
                    <ChevronRight className="w-4 h-4 at-mention-item-caret" />
                  )}
                </button>
              ))
            )
          ) : (
            // Category items view
            displayMode.items.length === 0 ? (
              <div className="at-mention-empty">
                No {displayMode.category.label.toLowerCase()} found
                {searchTerm && ` matching "${searchTerm}"`}
              </div>
            ) : (
              displayMode.items.map((item, index) => (
                <button
                  key={item.id}
                  data-mention-item
                  onClick={() => handleSelect({ type: 'item', data: item })}
                  onMouseEnter={() => setHighlightedIndex(index)}
                  className={`at-mention-item ${index === highlightedIndex ? 'highlighted' : ''} ${item.isNavigable ? 'is-navigable' : ''}`}
                >
                  <span className="at-mention-item-icon">
                    {getFileIcon(item.name, item.isFolder || item.type === 'directories', false)}
                  </span>
                  <div className="at-mention-item-content">
                    <span className="at-mention-item-name">{item.name}</span>
                    {item.path && <span className="at-mention-item-path">{item.path}</span>}
                  </div>
                  {item.meta && <span className="at-mention-item-meta">{item.meta}</span>}
                  {item.isNavigable && (
                    <ChevronRight className="w-4 h-4 at-mention-item-caret" />
                  )}
                </button>
              ))
            )
          )}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}

export default AtMentionPicker;
