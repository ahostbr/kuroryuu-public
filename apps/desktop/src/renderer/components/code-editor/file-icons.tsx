/**
 * file-icons.tsx - File type icon utility for Kuroryuu Desktop
 *
 * Returns colored Lucide icons based on file extension.
 * Used by AtMentionPicker and other components for consistent file type display.
 */

import {
  File,
  FileCode,
  FileJson,
  FileText,
  Folder,
  FolderOpen,
  Image,
  FileVideo,
  FileAudio,
  Database,
  Settings,
  Lock,
  FileArchive,
} from 'lucide-react';

/**
 * Get the appropriate icon for a file or folder.
 *
 * @param filename - The file or folder name (used to extract extension)
 * @param isFolder - Whether this is a folder
 * @param isOpen - Whether the folder is open/expanded (only used for folders)
 * @returns JSX element with the appropriate Lucide icon
 */
export function getFileIcon(filename: string, isFolder = false, isOpen = false): JSX.Element {
  if (isFolder) {
    return isOpen
      ? <FolderOpen className="w-4 h-4 text-blue-400" />
      : <Folder className="w-4 h-4 text-blue-400" />;
  }

  const ext = filename.split('.').pop()?.toLowerCase();

  switch (ext) {
    // TypeScript
    case 'ts':
    case 'tsx':
      return <FileCode className="w-4 h-4 text-blue-400" />;

    // JavaScript
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return <FileCode className="w-4 h-4 text-yellow-400" />;

    // Python
    case 'py':
    case 'pyw':
    case 'pyi':
      return <FileCode className="w-4 h-4 text-green-400" />;

    // JSON/Config
    case 'json':
    case 'jsonc':
      return <FileJson className="w-4 h-4" style={{ color: 'var(--cp-text-primary, #e1e1e1)' }} />;

    // Markdown/Text
    case 'md':
    case 'mdx':
    case 'txt':
    case 'rst':
      return <FileText className="w-4 h-4" style={{ color: 'var(--cp-text-muted, #888)' }} />;

    // Images
    case 'png':
    case 'jpg':
    case 'jpeg':
    case 'gif':
    case 'svg':
    case 'ico':
    case 'webp':
    case 'bmp':
      return <Image className="w-4 h-4 text-purple-400" />;

    // CSS/Styling
    case 'css':
    case 'scss':
    case 'sass':
    case 'less':
    case 'styl':
      return <FileCode className="w-4 h-4 text-pink-400" />;

    // HTML
    case 'html':
    case 'htm':
    case 'xhtml':
      return <FileCode className="w-4 h-4 text-orange-400" />;

    // Rust
    case 'rs':
      return <FileCode className="w-4 h-4 text-orange-500" />;

    // Go
    case 'go':
      return <FileCode className="w-4 h-4 text-cyan-400" />;

    // Ruby
    case 'rb':
    case 'erb':
      return <FileCode className="w-4 h-4 text-red-400" />;

    // Java/Kotlin
    case 'java':
    case 'kt':
    case 'kts':
      return <FileCode className="w-4 h-4 text-red-500" />;

    // C/C++
    case 'c':
    case 'h':
    case 'cpp':
    case 'hpp':
    case 'cc':
    case 'cxx':
      return <FileCode className="w-4 h-4 text-blue-500" />;

    // C#
    case 'cs':
      return <FileCode className="w-4 h-4 text-purple-500" />;

    // Shell
    case 'sh':
    case 'bash':
    case 'zsh':
    case 'fish':
      return <FileCode className="w-4 h-4 text-green-500" />;

    // PowerShell
    case 'ps1':
    case 'psm1':
    case 'psd1':
      return <FileCode className="w-4 h-4 text-blue-300" />;

    // YAML/TOML
    case 'yaml':
    case 'yml':
    case 'toml':
      return <Settings className="w-4 h-4" style={{ color: 'var(--cp-text-secondary, #aaa)' }} />;

    // XML
    case 'xml':
    case 'xsl':
    case 'xslt':
      return <FileCode className="w-4 h-4 text-orange-300" />;

    // SQL/Database
    case 'sql':
    case 'db':
    case 'sqlite':
    case 'sqlite3':
      return <Database className="w-4 h-4 text-blue-300" />;

    // Video
    case 'mp4':
    case 'webm':
    case 'avi':
    case 'mov':
    case 'mkv':
      return <FileVideo className="w-4 h-4 text-pink-500" />;

    // Audio
    case 'mp3':
    case 'wav':
    case 'ogg':
    case 'flac':
    case 'm4a':
      return <FileAudio className="w-4 h-4 text-green-300" />;

    // Archives
    case 'zip':
    case 'tar':
    case 'gz':
    case 'rar':
    case '7z':
      return <FileArchive className="w-4 h-4 text-yellow-500" />;

    // Lock/Security
    case 'lock':
    case 'pem':
    case 'key':
    case 'crt':
    case 'cer':
      return <Lock className="w-4 h-4 text-yellow-400" />;

    // Environment
    case 'env':
      return <Lock className="w-4 h-4 text-yellow-400" />;

    // Default
    default:
      return <File className="w-4 h-4" style={{ color: 'var(--cp-text-muted, #888)' }} />;
  }
}

/**
 * Get color class for a file extension (for text styling).
 */
export function getFileIconColor(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase();

  switch (ext) {
    case 'ts':
    case 'tsx':
      return 'text-blue-400';
    case 'js':
    case 'jsx':
    case 'mjs':
    case 'cjs':
      return 'text-yellow-400';
    case 'py':
    case 'pyw':
      return 'text-green-400';
    case 'json':
    case 'jsonc':
      return 'text-[var(--cp-text-primary)]';
    case 'md':
    case 'txt':
      return 'text-[var(--cp-text-muted)]';
    case 'css':
    case 'scss':
      return 'text-pink-400';
    case 'html':
      return 'text-orange-400';
    default:
      return 'text-[var(--cp-text-muted)]';
  }
}

export default getFileIcon;
