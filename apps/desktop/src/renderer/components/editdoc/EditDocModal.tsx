/**
 * EditDocModal - VSCode-style markdown editor modal
 * Can be opened from anywhere via useEditDocStore
 */

import * as Dialog from '@radix-ui/react-dialog';
import { useState, useEffect, useCallback } from 'react';
import {
  X,
  Save,
  Eye,
  Code,
  Columns,
  FileText,
  AlertCircle,
  Check,
} from 'lucide-react';
import { useEditDocStore } from '../../stores/editdoc-store';
import { getLanguageFromPath } from '../../stores/code-editor-store';
import { EditorPane } from './EditorPane';
import { PreviewPane } from './PreviewPane';
import { toast } from '../ui/toaster';
import { ThemedFrame } from '../ui/ThemedFrame';
import { useIsThemedStyle } from '../../hooks/useTheme';
import { useKuroryuuDialog } from '../../hooks/useKuroryuuDialog';

export function EditDocModal() {
  const { isKuroryuu, isGrunge } = useIsThemedStyle();
  const {
    isOpen,
    filePath,
    initialContent,
    isDirty,
    cursorPosition,
    viewMode,
    close,
    setDirty,
    setCursorPosition,
    setViewMode,
  } = useEditDocStore();
  const { confirm } = useKuroryuuDialog();

  const [content, setContent] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Load file content when modal opens
  useEffect(() => {
    if (isOpen && filePath) {
      if (initialContent !== null) {
        setContent(initialContent);
        setError(null);
      } else {
        loadFile(filePath);
      }
    }
  }, [isOpen, filePath, initialContent]);

  const loadFile = async (path: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const fileContent = await window.electronAPI?.fs?.readFile?.(path);
      if (typeof fileContent === 'string') {
        setContent(fileContent);
      } else {
        setError('Failed to load file');
        setContent('');
      }
    } catch (err) {
      setError('Failed to load file');
      setContent('');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = useCallback(async () => {
    if (!filePath || isSaving) return;

    setIsSaving(true);
    try {
      await window.electronAPI?.fs?.writeFile?.(filePath, content);
      setDirty(false);
      toast.success('File saved');
    } catch (err) {
      toast.error('Failed to save file');
    } finally {
      setIsSaving(false);
    }
  }, [filePath, content, isSaving, setDirty]);

  const handleContentChange = useCallback((newContent: string) => {
    setContent(newContent);
    setDirty(true);
  }, [setDirty]);

  const handleClose = useCallback(async () => {
    if (isDirty) {
      const yes = await confirm({
        title: 'Unsaved Changes',
        message: 'You have unsaved changes. Discard them?',
        confirmLabel: 'Discard',
        cancelLabel: 'Cancel',
      });
      if (yes) {
        close();
      }
    } else {
      close();
    }
  }, [isDirty, close, confirm]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
      if (e.key === 'Escape') {
        handleClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, handleSave, handleClose]);

  const fileName = filePath?.split(/[/\\]/).pop() || 'Untitled';
  const language = filePath ? getLanguageFromPath(filePath) : 'markdown';

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/70 backdrop-blur-sm z-[100]" />
        <Dialog.Content
          className="fixed inset-4 md:inset-8 lg:inset-12 z-[100]"
          onPointerDownOutside={(e) => e.preventDefault()}
        >
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="full"
            className="h-full overflow-hidden flex flex-col"
            contentClassName="flex-1 flex flex-col min-h-0"
          >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-border bg-card/50">
            <div className="flex items-center gap-3">
              <FileText className="w-4 h-4 text-primary" />
              <span className="text-sm font-medium text-foreground">
                {fileName}
                {isDirty && <span className="text-primary ml-1">*</span>}
              </span>
              {filePath && (
                <span className="text-xs text-muted-foreground hidden md:inline">
                  {filePath}
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              {/* View mode toggle */}
              <div className="flex items-center bg-muted rounded-md p-0.5">
                <button
                  onClick={() => setViewMode('editor')}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === 'editor'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Editor only"
                >
                  <Code className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('split')}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === 'split'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Split view"
                >
                  <Columns className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setViewMode('preview')}
                  className={`p-1.5 rounded transition-colors ${
                    viewMode === 'preview'
                      ? 'bg-background text-foreground shadow-sm'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                  title="Preview only"
                >
                  <Eye className="w-4 h-4" />
                </button>
              </div>

              {/* Save button */}
              <button
                onClick={handleSave}
                disabled={isSaving || !isDirty}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  isDirty
                    ? 'bg-primary text-background hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground'
                }`}
              >
                {isSaving ? (
                  <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Save className="w-4 h-4" />
                )}
                Save
              </button>

              {/* Close button */}
              <Dialog.Close asChild>
                <button
                  onClick={handleClose}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1 flex overflow-hidden min-h-0">
            {isLoading ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3">
                  <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin" />
                  <span className="text-sm text-muted-foreground">Loading...</span>
                </div>
              </div>
            ) : error ? (
              <div className="flex-1 flex items-center justify-center">
                <div className="flex flex-col items-center gap-3 text-destructive">
                  <AlertCircle className="w-8 h-8" />
                  <span className="text-sm">{error}</span>
                </div>
              </div>
            ) : (
              <>
                {/* Editor */}
                {(viewMode === 'editor' || viewMode === 'split') && (
                  <div
                    className={`${
                      viewMode === 'split' ? 'w-1/2 border-r border-border' : 'flex-1'
                    } overflow-hidden`}
                  >
                    <EditorPane
                      content={content}
                      onChange={handleContentChange}
                      onCursorChange={setCursorPosition}
                      onSave={handleSave}
                      language={language}
                    />
                  </div>
                )}

                {/* Preview */}
                {(viewMode === 'preview' || viewMode === 'split') && (
                  <div
                    className={`${
                      viewMode === 'split' ? 'w-1/2' : 'flex-1'
                    } overflow-hidden`}
                  >
                    <PreviewPane content={content} />
                  </div>
                )}
              </>
            )}
          </div>

          {/* Status bar */}
          <div className="flex items-center justify-between px-4 py-1.5 border-t border-border bg-card/30 text-xs text-muted-foreground">
            <div className="flex items-center gap-4">
              <span>
                Ln {cursorPosition.line}, Col {cursorPosition.column}
              </span>
              <span className="capitalize">{language}</span>
              <span>UTF-8</span>
            </div>
            <div className="flex items-center gap-4">
              {isDirty ? (
                <span className="text-primary">Modified</span>
              ) : (
                <span className="flex items-center gap-1 text-green-500">
                  <Check className="w-3 h-3" /> Saved
                </span>
              )}
              <span className="text-muted-foreground/60">Ctrl+S to save</span>
            </div>
          </div>
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
