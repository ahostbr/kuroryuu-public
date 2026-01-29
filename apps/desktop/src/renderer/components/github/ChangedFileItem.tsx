/**
 * GitHub Desktop Changed File Item Component
 * Individual file row in the changes list with checkbox, status icon, and context menu
 */

import type { ChangedFile, FileStatus } from '../../types/repository';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { useState } from 'react';
import { Trash2, Copy, FolderOpen, FileX, Play } from 'lucide-react';

interface ChangedFileItemProps {
  file: ChangedFile;
  isSelected: boolean;
  onSelect: () => void;
  onToggleIncluded: () => void;
  onDiscard?: () => void;
}

// Status letter mapping (matching GitHub Desktop style)
const STATUS_LETTERS: Record<FileStatus, string> = {
  new: '+',
  modified: 'M',
  deleted: '-',
  renamed: 'R',
  copied: 'C',
  conflicted: '!',
  untracked: '?',
};

export function ChangedFileItem({
  file,
  isSelected,
  onSelect,
  onToggleIncluded,
  onDiscard,
}: ChangedFileItemProps) {
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);

  // Extract filename and directory from path
  const pathParts = file.path.split(/[/\\]/);
  const filename = pathParts.pop() || file.path;
  const directory = pathParts.join('/');

  const handleContextMenu = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: e.clientX, y: e.clientY });
  };

  const handleCopyPath = (relative: boolean) => {
    const pathToCopy = relative ? file.path : file.path;
    navigator.clipboard.writeText(pathToCopy);
    setContextMenu(null);
  };

  const handleRevealInExplorer = () => {
    (window.electronAPI?.fs as { showInExplorer?: (path: string) => void })?.showInExplorer?.(file.path);
    setContextMenu(null);
  };

  const handleOpenWithDefault = () => {
    (window.electronAPI?.fs as { openPath?: (path: string) => void })?.openPath?.(file.path);
    setContextMenu(null);
  };

  const handleDiscard = () => {
    onDiscard?.();
    setContextMenu(null);
  };

  return (
    <>
      <div
        className={`ghd-file-item ${isSelected ? 'selected' : ''}`}
        onClick={onSelect}
        onContextMenu={handleContextMenu}
      >
        <input
          type="checkbox"
          checked={file.included}
          onChange={(e) => {
            e.stopPropagation();
            onToggleIncluded();
          }}
          onClick={(e) => e.stopPropagation()}
        />
        <div className="ghd-file-path" title={file.path}>
          {directory && (
            <span style={{ color: 'var(--ghd-text-muted)' }}>
              {directory}/
            </span>
          )}
          {filename}
        </div>
        <div className={`ghd-file-status ${file.status}`}>
          {STATUS_LETTERS[file.status]}
        </div>
      </div>

      {/* Context Menu */}
      {contextMenu && (
        <DropdownMenu.Root
          open={true}
          onOpenChange={(open) => !open && setContextMenu(null)}
        >
          <DropdownMenu.Portal>
            <DropdownMenu.Content
              className="ghd-context-menu"
              style={{ position: 'fixed', left: contextMenu.x, top: contextMenu.y }}
              onInteractOutside={() => setContextMenu(null)}
              onEscapeKeyDown={() => setContextMenu(null)}
            >
              {/* Discard Changes */}
              {file.status !== 'new' && file.status !== 'untracked' && (
                <>
                  <DropdownMenu.Item
                    className="ghd-context-menu-item danger"
                    onClick={handleDiscard}
                  >
                    <Trash2 className="ghd-context-menu-icon" />
                    Discard Changes
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="ghd-context-menu-separator" />
                </>
              )}

              {/* Delete untracked file */}
              {(file.status === 'new' || file.status === 'untracked') && (
                <>
                  <DropdownMenu.Item
                    className="ghd-context-menu-item danger"
                    onClick={handleDiscard}
                  >
                    <FileX className="ghd-context-menu-icon" />
                    Delete File
                  </DropdownMenu.Item>
                  <DropdownMenu.Separator className="ghd-context-menu-separator" />
                </>
              )}

              {/* Copy actions */}
              <DropdownMenu.Item
                className="ghd-context-menu-item"
                onClick={() => handleCopyPath(false)}
              >
                <Copy className="ghd-context-menu-icon" />
                Copy File Path
              </DropdownMenu.Item>

              <DropdownMenu.Item
                className="ghd-context-menu-item"
                onClick={() => handleCopyPath(true)}
              >
                <Copy className="ghd-context-menu-icon" />
                Copy Relative Path
              </DropdownMenu.Item>

              <DropdownMenu.Separator className="ghd-context-menu-separator" />

              {/* File actions */}
              <DropdownMenu.Item
                className="ghd-context-menu-item"
                onClick={handleRevealInExplorer}
              >
                <FolderOpen className="ghd-context-menu-icon" />
                Reveal in File Explorer
              </DropdownMenu.Item>

              <DropdownMenu.Item
                className="ghd-context-menu-item"
                onClick={handleOpenWithDefault}
              >
                <Play className="ghd-context-menu-icon" />
                Open with Default Program
              </DropdownMenu.Item>
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>
      )}
    </>
  );
}
