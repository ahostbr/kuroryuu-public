/**
 * ClaudeMemoryTab - Browse and edit Claude Code auto memory files
 * Reads from ~/.claude/projects/{hash}/memory/
 */

import { useState, useEffect, useCallback } from 'react';
import {
  FileText,
  Loader2,
  RefreshCw,
  Save,
  Edit3,
  X,
  ChevronRight,
  ChevronDown,
  AlertCircle,
  HardDrive,
} from 'lucide-react';

interface MemoryFile {
  name: string;
  size: number;
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function countLines(content: string): number {
  if (!content) return 0;
  return content.split('\n').length;
}

export function ClaudeMemoryTab() {
  const [files, setFiles] = useState<MemoryFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Active file state
  const [activeFile, setActiveFile] = useState<string | null>(null);
  const [fileContent, setFileContent] = useState<string>('');
  const [loadingContent, setLoadingContent] = useState(false);

  // Edit state
  const [editing, setEditing] = useState(false);
  const [editContent, setEditContent] = useState('');
  const [saving, setSaving] = useState(false);

  // Expanded other files
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [otherFileContents, setOtherFileContents] = useState<Record<string, string>>({});

  const loadFiles = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await window.electronAPI.claudeMemory.list();
      if (!result.ok) {
        setError(result.error || 'Failed to list memory files');
        return;
      }
      setFiles(result.files || []);

      // Auto-load MEMORY.md if it exists
      const hasMemoryMd = (result.files || []).some(f => f.name === 'MEMORY.md');
      if (hasMemoryMd && !activeFile) {
        loadFileContent('MEMORY.md');
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to list memory files');
    } finally {
      setLoading(false);
    }
  }, [activeFile]);

  const loadFileContent = useCallback(async (filename: string) => {
    setLoadingContent(true);
    setActiveFile(filename);
    setEditing(false);
    try {
      const result = await window.electronAPI.claudeMemory.read(filename);
      if (!result.ok) {
        setError(result.error || 'Failed to read file');
        return;
      }
      setFileContent(result.content || '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to read file');
    } finally {
      setLoadingContent(false);
    }
  }, []);

  const toggleOtherFile = useCallback(async (filename: string) => {
    const newExpanded = new Set(expandedFiles);
    if (newExpanded.has(filename)) {
      newExpanded.delete(filename);
      setExpandedFiles(newExpanded);
      return;
    }
    newExpanded.add(filename);
    setExpandedFiles(newExpanded);

    // Load content if not already cached
    if (!otherFileContents[filename]) {
      try {
        const result = await window.electronAPI.claudeMemory.read(filename);
        if (result.ok) {
          setOtherFileContents(prev => ({ ...prev, [filename]: result.content || '' }));
        }
      } catch {
        // Silently fail for other files
      }
    }
  }, [expandedFiles, otherFileContents]);

  const startEditing = useCallback(() => {
    setEditContent(fileContent);
    setEditing(true);
  }, [fileContent]);

  const cancelEditing = useCallback(() => {
    setEditing(false);
    setEditContent('');
  }, []);

  const saveFile = useCallback(async () => {
    if (!activeFile) return;
    setSaving(true);
    try {
      const result = await window.electronAPI.claudeMemory.write(activeFile, editContent);
      if (!result.ok) {
        setError(result.error || 'Failed to save file');
        return;
      }
      setFileContent(editContent);
      setEditing(false);
      // Refresh file list for updated sizes
      loadFiles();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save file');
    } finally {
      setSaving(false);
    }
  }, [activeFile, editContent, loadFiles]);

  useEffect(() => {
    loadFiles();
  }, [loadFiles]);

  // Split files into MEMORY.md and others
  const mainFile = files.find(f => f.name === 'MEMORY.md');
  const otherFiles = files.filter(f => f.name !== 'MEMORY.md');

  if (loading) {
    return (
      <div className="flex items-center justify-center h-32">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (files.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-48 text-center p-4">
        <HardDrive className="w-8 h-8 text-muted-foreground mb-3" />
        <p className="text-sm text-muted-foreground mb-1">No Claude Code memory files found</p>
        <p className="text-xs text-muted-foreground/70">
          Memory files are created by Claude Code at ~/.claude/projects/&#123;hash&#125;/memory/
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-border">
        <div className="flex items-center gap-2">
          <FileText className="w-4 h-4 text-blue-400" />
          <span className="text-sm font-medium text-foreground">
            {activeFile || 'MEMORY.md'}
          </span>
          {activeFile && fileContent && (
            <span className="text-xs text-muted-foreground">
              {countLines(fileContent)} lines
            </span>
          )}
          {mainFile && (
            <span className="text-xs px-1.5 py-0.5 bg-blue-500/20 text-blue-400 rounded">
              {formatSize(mainFile.size)}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
          {editing ? (
            <>
              <button
                onClick={saveFile}
                disabled={saving}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-green-500/20 text-green-400 hover:bg-green-500/30 rounded transition-colors"
              >
                {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : <Save className="w-3 h-3" />}
                Save
              </button>
              <button
                onClick={cancelEditing}
                className="flex items-center gap-1 px-2 py-1 text-xs bg-secondary text-muted-foreground hover:text-foreground rounded transition-colors"
              >
                <X className="w-3 h-3" />
                Cancel
              </button>
            </>
          ) : (
            <button
              onClick={startEditing}
              disabled={!activeFile || loadingContent}
              className="flex items-center gap-1 px-2 py-1 text-xs bg-secondary text-muted-foreground hover:text-foreground rounded transition-colors disabled:opacity-50"
            >
              <Edit3 className="w-3 h-3" />
              Edit
            </button>
          )}
          <button
            onClick={loadFiles}
            disabled={loading}
            className="p-1 hover:bg-secondary rounded transition-colors"
            title="Refresh"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="flex items-center gap-2 px-4 py-2 bg-red-500/10 border-b border-red-500/20 text-sm text-red-400">
          <AlertCircle className="w-4 h-4 flex-shrink-0" />
          <span>{error}</span>
          <button onClick={() => setError(null)} className="ml-auto">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main content area */}
      <div className="flex-1 overflow-y-auto">
        {loadingContent ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : editing ? (
          /* Edit mode */
          <textarea
            value={editContent}
            onChange={(e) => setEditContent(e.target.value)}
            className="w-full h-full p-4 bg-background text-sm text-foreground font-mono resize-none focus:outline-none"
            spellCheck={false}
          />
        ) : fileContent ? (
          /* Display mode with line numbers */
          <div className="p-4 overflow-x-auto">
            <pre className="text-sm font-mono leading-relaxed">
              {fileContent.split('\n').map((line, i) => (
                <div key={i} className="flex hover:bg-secondary/30 transition-colors">
                  <span className="select-none text-muted-foreground/40 text-right pr-4 min-w-[3rem] flex-shrink-0">
                    {i + 1}
                  </span>
                  <span className="text-foreground whitespace-pre-wrap break-words">{line}</span>
                </div>
              ))}
            </pre>
          </div>
        ) : null}

        {/* Other memory files */}
        {otherFiles.length > 0 && (
          <div className="border-t border-border">
            <div className="px-4 py-2 text-xs font-medium text-muted-foreground uppercase tracking-wider bg-secondary/30">
              Other Memory Files ({otherFiles.length})
            </div>
            {otherFiles.map(file => (
              <div key={file.name} className="border-b border-border/50">
                <button
                  onClick={() => toggleOtherFile(file.name)}
                  className="w-full flex items-center gap-2 px-4 py-2 text-sm hover:bg-secondary/50 transition-colors"
                >
                  {expandedFiles.has(file.name) ? (
                    <ChevronDown className="w-3.5 h-3.5 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-3.5 h-3.5 text-muted-foreground" />
                  )}
                  <FileText className="w-3.5 h-3.5 text-blue-400" />
                  <span className="text-foreground">{file.name}</span>
                  <span className="text-xs text-muted-foreground ml-auto">
                    {formatSize(file.size)}
                  </span>
                </button>
                {expandedFiles.has(file.name) && (
                  <div className="px-4 pb-3">
                    {otherFileContents[file.name] ? (
                      <div className="relative">
                        <button
                          onClick={() => loadFileContent(file.name)}
                          className="absolute top-1 right-1 flex items-center gap-1 px-2 py-0.5 text-xs bg-secondary text-muted-foreground hover:text-foreground rounded transition-colors z-10"
                        >
                          <Edit3 className="w-3 h-3" />
                          Open
                        </button>
                        <pre className="text-xs font-mono bg-secondary/40 rounded p-3 overflow-x-auto max-h-[300px] overflow-y-auto text-muted-foreground leading-relaxed">
                          {otherFileContents[file.name]}
                        </pre>
                      </div>
                    ) : (
                      <div className="flex items-center justify-center py-3">
                        <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
