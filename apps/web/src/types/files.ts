/**
 * File Attachment Types
 * For Copilot-style file context management
 */

export interface FileAttachment {
  id: string;
  name: string;
  path: string;
  size: number;
  type: 'file' | 'folder' | 'selection';
  language?: string;
  lineRange?: { start: number; end: number };
  content?: string;
  preview?: string;
  addedAt: number;
}

export interface AttachmentContext {
  files: FileAttachment[];
  totalSize: number;
  maxFiles: number;
  maxSize: number;
}

export type FileDropHandler = (files: File[]) => void;

// File extension to language mapping
export const FILE_LANGUAGES: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript React',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript React',
  '.py': 'Python',
  '.rs': 'Rust',
  '.go': 'Go',
  '.java': 'Java',
  '.cpp': 'C++',
  '.c': 'C',
  '.cs': 'C#',
  '.rb': 'Ruby',
  '.php': 'PHP',
  '.swift': 'Swift',
  '.kt': 'Kotlin',
  '.md': 'Markdown',
  '.json': 'JSON',
  '.yaml': 'YAML',
  '.yml': 'YAML',
  '.html': 'HTML',
  '.css': 'CSS',
  '.scss': 'SCSS',
  '.sql': 'SQL',
  '.sh': 'Shell',
  '.ps1': 'PowerShell',
  '.bat': 'Batch',
};

// File extension to icon mapping
export const FILE_ICONS: Record<string, string> = {
  '.ts': '📘',
  '.tsx': '⚛️',
  '.js': '📒',
  '.jsx': '⚛️',
  '.py': '🐍',
  '.rs': '🦀',
  '.go': '🐹',
  '.java': '☕',
  '.cpp': '⚙️',
  '.c': '⚙️',
  '.cs': '💎',
  '.rb': '💎',
  '.php': '🐘',
  '.swift': '🍎',
  '.kt': '🟣',
  '.md': '📝',
  '.json': '📋',
  '.yaml': '📋',
  '.yml': '📋',
  '.html': '🌐',
  '.css': '🎨',
  '.scss': '🎨',
  '.sql': '🗄️',
  '.sh': '🖥️',
  '.ps1': '🖥️',
  '.bat': '🖥️',
  'default': '📄',
};

export function getFileLanguage(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return FILE_LANGUAGES[ext] || 'Plain Text';
}

export function getFileIcon(filename: string): string {
  const ext = filename.substring(filename.lastIndexOf('.')).toLowerCase();
  return FILE_ICONS[ext] || FILE_ICONS['default'];
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function truncatePath(path: string, maxLength: number = 40): string {
  if (path.length <= maxLength) return path;
  const parts = path.split('/');
  if (parts.length <= 2) return '...' + path.slice(-maxLength + 3);
  return parts[0] + '/.../' + parts.slice(-2).join('/');
}
