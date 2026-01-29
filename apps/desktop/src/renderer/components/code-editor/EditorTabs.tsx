/**
 * EditorTabs - VS Code-style tab bar with context menu, pinning, and drag-drop
 */

import { useCodeEditorStore } from '../../stores/code-editor-store';
import { X, FileText, Pin, ChevronLeft, ChevronRight, Copy, FolderOpen } from 'lucide-react';
import { useCallback, useRef, useState, useEffect } from 'react';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useKuroryuuDialog } from '../../hooks/useKuroryuuDialog';

// File type icons based on extension
function getFileIcon(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const iconMap: Record<string, string> = {
    ts: '󰛦', tsx: '󰜈', js: '󰌞', jsx: '󰌞',
    py: '󰌠', md: '󰍔', json: '󰘦', html: '󰌝',
    css: '󰌜', scss: '󰌜', yaml: '󰈙', yml: '󰈙',
    toml: '󰈙', sh: '󰆍', bash: '󰆍', ps1: '󰨊',
    sql: '󰆼', rs: '󱘗', go: '󰟓',
  };
  return iconMap[ext] || '󰈔';
}

// Get language-specific color for file icon
function getFileIconColor(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() || '';
  const colorMap: Record<string, string> = {
    ts: 'text-blue-400', tsx: 'text-blue-400',
    js: 'text-yellow-400', jsx: 'text-yellow-400',
    py: 'text-green-400', md: 'text-gray-400',
    json: 'text-yellow-500', html: 'text-orange-400',
    css: 'text-blue-300', scss: 'text-pink-400',
    yaml: 'text-red-400', yml: 'text-red-400',
    rs: 'text-orange-500', go: 'text-cyan-400',
  };
  return colorMap[ext] || 'text-muted-foreground';
}

interface TabProps {
  file: { path: string; isDirty: boolean };
  index: number;
  isActive: boolean;
  isPinned: boolean;
  onActivate: () => void;
  onClose: (e: React.MouseEvent) => void;
  onContextMenu: (e: React.MouseEvent) => void;
  onDragStart: (e: React.DragEvent) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragEnd: () => void;
  onDrop: (e: React.DragEvent) => void;
  isDragOver: boolean;
}

function Tab({
  file,
  index,
  isActive,
  isPinned,
  onActivate,
  onClose,
  onContextMenu,
  onDragStart,
  onDragOver,
  onDragEnd,
  onDrop,
  isDragOver,
}: TabProps) {
  const fileName = file.path.split('/').pop() || file.path;

  return (
    <div
      draggable
      onClick={onActivate}
      onContextMenu={onContextMenu}
      onDragStart={onDragStart}
      onDragOver={onDragOver}
      onDragEnd={onDragEnd}
      onDrop={onDrop}
      className={`
        relative flex items-center h-[35px] border-r border-border/50
        transition-all duration-150 cursor-pointer select-none group
        ${isPinned ? 'min-w-[40px] max-w-[40px] px-2 justify-center' : 'min-w-[100px] max-w-[180px] px-3 gap-2'}
        ${isActive
          ? 'bg-background text-foreground'
          : 'bg-card/40 text-muted-foreground hover:bg-card/70 hover:text-foreground'
        }
        ${isDragOver ? 'bg-primary/10 border-l-2 border-l-primary' : ''}
      `}
      title={file.path}
    >
      {/* Active tab top border accent */}
      {isActive && (
        <div className="absolute top-0 left-0 right-0 h-[2px] bg-primary" />
      )}

      {/* File icon or Pin icon */}
      {isPinned ? (
        <Pin className="w-3.5 h-3.5 text-primary rotate-45" />
      ) : (
        <span className={`text-sm flex-shrink-0 ${getFileIconColor(file.path)}`}>
          <FileText className="w-3.5 h-3.5" />
        </span>
      )}

      {/* File name (hidden for pinned tabs) */}
      {!isPinned && (
        <span className="text-[13px] truncate flex-1">
          {fileName}
        </span>
      )}

      {/* Dirty indicator */}
      {file.isDirty && (
        <span className={`flex-shrink-0 ${isPinned ? 'absolute -top-0.5 -right-0.5' : ''}`}>
          <span className="w-2 h-2 rounded-full bg-primary block" />
        </span>
      )}

      {/* Close button (hidden for pinned tabs, shown on hover for others) */}
      {!isPinned && (
        <button
          onClick={onClose}
          className={`
            p-0.5 rounded transition-all flex-shrink-0
            hover:bg-muted-foreground/20
            ${isActive ? 'opacity-60 hover:opacity-100' : 'opacity-0 group-hover:opacity-60 hover:!opacity-100'}
          `}
          title="Close (Ctrl+W)"
        >
          <X className="w-3.5 h-3.5" />
        </button>
      )}
    </div>
  );
}

export function EditorTabs() {
  const {
    openFiles,
    activeFileIndex,
    pinnedPaths,
    projectRoot,
    setActiveFile,
    closeFile,
    pinTab,
    unpinTab,
    isPinned,
    reorderTabs,
    closeOtherTabs,
    closeTabsToRight,
    closeAllTabs,
  } = useCodeEditorStore();

  const containerRef = useRef<HTMLDivElement>(null);
  const [showLeftScroll, setShowLeftScroll] = useState(false);
  const [showRightScroll, setShowRightScroll] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; index: number } | null>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);
  const { confirm } = useKuroryuuDialog();

  // Check scroll overflow
  useEffect(() => {
    const checkScroll = () => {
      const container = containerRef.current;
      if (!container) return;

      setShowLeftScroll(container.scrollLeft > 0);
      setShowRightScroll(
        container.scrollLeft < container.scrollWidth - container.clientWidth - 1
      );
    };

    checkScroll();
    const container = containerRef.current;
    container?.addEventListener('scroll', checkScroll);
    window.addEventListener('resize', checkScroll);

    return () => {
      container?.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [openFiles.length]);

  const scrollTabs = (direction: 'left' | 'right') => {
    const container = containerRef.current;
    if (!container) return;

    const scrollAmount = 150;
    container.scrollBy({
      left: direction === 'left' ? -scrollAmount : scrollAmount,
      behavior: 'smooth',
    });
  };

  const handleClose = useCallback(async (e: React.MouseEvent, index: number) => {
    e.stopPropagation();
    const file = openFiles[index];

    // Don't close pinned tabs via close button
    if (file && pinnedPaths.includes(file.path)) return;

    if (file?.isDirty) {
      const yes = await confirm({
        title: 'Unsaved Changes',
        message: `"${file.path.split('/').pop()}" has unsaved changes. Close anyway?`,
        confirmLabel: 'Close',
        cancelLabel: 'Cancel',
      });
      if (!yes) return;
    }
    closeFile(index);
  }, [openFiles, pinnedPaths, closeFile, confirm]);

  const handleContextMenu = useCallback((e: React.MouseEvent, index: number) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY, index });
  }, []);

  const handleCopyPath = useCallback((index: number, relative: boolean = false) => {
    const file = openFiles[index];
    if (!file) return;

    let pathToCopy = file.path;
    if (relative && projectRoot) {
      pathToCopy = file.path.replace(projectRoot + '/', '');
    }

    navigator.clipboard.writeText(pathToCopy);
    setContextMenu(null);
  }, [openFiles, projectRoot]);

  const handleRevealInExplorer = useCallback((index: number) => {
    const file = openFiles[index];
    if (!file) return;

    (window.electronAPI?.fs as { showInExplorer?: (path: string) => void })?.showInExplorer?.(file.path);
    setContextMenu(null);
  }, [openFiles]);

  // Drag and drop handlers
  const handleDragStart = useCallback((e: React.DragEvent, index: number) => {
    setDragIndex(index);
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', String(index));
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDragIndex(null);
    setDragOverIndex(null);
  }, []);

  const handleDrop = useCallback((e: React.DragEvent, toIndex: number) => {
    e.preventDefault();
    const fromIndex = dragIndex;
    if (fromIndex !== null && fromIndex !== toIndex) {
      reorderTabs(fromIndex, toIndex);
    }
    setDragIndex(null);
    setDragOverIndex(null);
  }, [dragIndex, reorderTabs]);

  if (openFiles.length === 0) {
    return (
      <div className="h-[35px] border-b border-border bg-card/30 flex items-center px-3">
        <span className="text-xs text-muted-foreground">No files open</span>
      </div>
    );
  }

  const contextFile = contextMenu !== null ? openFiles[contextMenu.index] : null;
  const contextIsPinned = contextFile ? pinnedPaths.includes(contextFile.path) : false;

  return (
    <div className="h-[35px] border-b border-border bg-card/30 flex items-center relative">
      {/* Left scroll button */}
      {showLeftScroll && (
        <button
          onClick={() => scrollTabs('left')}
          className="absolute left-0 z-10 h-full px-1 bg-gradient-to-r from-card to-transparent hover:from-card/90 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
      )}

      {/* Tabs container */}
      <div
        ref={containerRef}
        className="flex-1 flex items-center overflow-x-auto scrollbar-none"
        style={{ scrollbarWidth: 'none' }}
      >
        {openFiles.map((file, index) => (
          <Tab
            key={file.path}
            file={file}
            index={index}
            isActive={index === activeFileIndex}
            isPinned={pinnedPaths.includes(file.path)}
            onActivate={() => setActiveFile(index)}
            onClose={(e) => handleClose(e, index)}
            onContextMenu={(e) => handleContextMenu(e, index)}
            onDragStart={(e) => handleDragStart(e, index)}
            onDragOver={(e) => handleDragOver(e, index)}
            onDragEnd={handleDragEnd}
            onDrop={(e) => handleDrop(e, index)}
            isDragOver={dragOverIndex === index && dragIndex !== index}
          />
        ))}
      </div>

      {/* Right scroll button */}
      {showRightScroll && (
        <button
          onClick={() => scrollTabs('right')}
          className="absolute right-0 z-10 h-full px-1 bg-gradient-to-l from-card to-transparent hover:from-card/90 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      )}

      {/* Context Menu */}
      {contextMenu && contextFile && (
        <DropdownMenu.Root
          open={true}
          onOpenChange={(open) => !open && setContextMenu(null)}
        >
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="min-w-[200px] bg-popover border border-border rounded-md shadow-lg py-1 z-50 animate-in fade-in-0 zoom-in-95"
              style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y }}
              onInteractOutside={() => setContextMenu(null)}
              onEscapeKeyDown={() => setContextMenu(null)}
            >
              {/* Close actions */}
              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted cursor-pointer outline-none"
                onClick={() => {
                  if (!contextIsPinned) {
                    closeFile(contextMenu.index);
                  }
                  setContextMenu(null);
                }}
                disabled={contextIsPinned}
              >
                <X className="w-4 h-4" />
                Close
                <span className="ml-auto text-xs text-muted-foreground">Ctrl+W</span>
              </DropdownMenu.Item>

              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted cursor-pointer outline-none"
                onClick={() => {
                  closeOtherTabs(contextFile.path);
                  setContextMenu(null);
                }}
              >
                Close Others
              </DropdownMenu.Item>

              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted cursor-pointer outline-none"
                onClick={() => {
                  closeTabsToRight(contextFile.path);
                  setContextMenu(null);
                }}
              >
                Close to the Right
              </DropdownMenu.Item>

              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted cursor-pointer outline-none"
                onClick={() => {
                  closeAllTabs();
                  setContextMenu(null);
                }}
              >
                Close All
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="h-px bg-border my-1" />

              {/* Pin/Unpin */}
              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted cursor-pointer outline-none"
                onClick={() => {
                  if (contextIsPinned) {
                    unpinTab(contextFile.path);
                  } else {
                    pinTab(contextFile.path);
                  }
                  setContextMenu(null);
                }}
              >
                <Pin className={`w-4 h-4 ${contextIsPinned ? 'text-primary' : ''}`} />
                {contextIsPinned ? 'Unpin' : 'Pin'}
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="h-px bg-border my-1" />

              {/* Path actions */}
              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted cursor-pointer outline-none"
                onClick={() => handleCopyPath(contextMenu.index, false)}
              >
                <Copy className="w-4 h-4" />
                Copy Path
              </DropdownMenu.Item>

              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted cursor-pointer outline-none"
                onClick={() => handleCopyPath(contextMenu.index, true)}
              >
                <Copy className="w-4 h-4" />
                Copy Relative Path
              </DropdownMenu.Item>

              <DropdownMenu.Item
                className="flex items-center gap-2 px-3 py-1.5 text-sm text-foreground hover:bg-muted cursor-pointer outline-none"
                onClick={() => handleRevealInExplorer(contextMenu.index)}
              >
                <FolderOpen className="w-4 h-4" />
                Reveal in File Explorer
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </div>
  );
}
