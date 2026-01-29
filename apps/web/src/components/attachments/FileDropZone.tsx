/**
 * File Drop Zone Component
 * Drag & drop file upload with visual feedback
 */
import { useCallback, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import { Upload, FileText } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import type { FileAttachment } from '../../types/files';
import { getFileLanguage } from '../../types/files';
import { cn } from '../../lib/utils';

interface FileDropZoneProps {
  onFilesAdded: (files: FileAttachment[]) => void;
  disabled?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function FileDropZone({ onFilesAdded, disabled, className, children }: FileDropZoneProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  
  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    const attachments: FileAttachment[] = await Promise.all(
      acceptedFiles.map(async (file) => {
        // Read file content
        let content = '';
        let preview = '';
        
        if (file.type.startsWith('text/') || 
            /\.(ts|tsx|js|jsx|py|json|md|txt|css|html|xml|yaml|yml|toml|ini|sh|bash|ps1|bat|cmd)$/i.test(file.name)) {
          try {
            content = await file.text();
            preview = content.slice(0, 500) + (content.length > 500 ? '...' : '');
          } catch {
            content = '[Unable to read file content]';
          }
        } else if (file.type.startsWith('image/')) {
          try {
            content = await new Promise<string>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => resolve(reader.result as string);
              reader.readAsDataURL(file);
            });
            preview = `[Image: ${file.name}]`;
          } catch {
            content = '[Unable to read image]';
          }
        } else {
          content = `[Binary file: ${file.name}, ${file.size} bytes]`;
          preview = content;
        }
        
        return {
          id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
          name: file.name,
          path: file.webkitRelativePath || file.name,
          size: file.size,
          type: 'file' as const,
          language: getFileLanguage(file.name),
          content,
          preview,
          addedAt: Date.now(),
        };
      })
    );
    
    onFilesAdded(attachments);
  }, [onFilesAdded]);
  
  const { getRootProps, getInputProps, isDragAccept, isDragReject } = useDropzone({
    onDrop,
    disabled,
    onDragEnter: () => setIsDragActive(true),
    onDragLeave: () => setIsDragActive(false),
    noClick: true, // We'll handle click separately
  });
  
  return (
    <div
      {...getRootProps()}
      className={cn("relative", className)}
    >
      <input {...getInputProps()} />
      
      {/* Drag Overlay */}
      <AnimatePresence>
        {isDragActive && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className={cn(
              "absolute inset-0 z-50 flex items-center justify-center rounded-lg",
              "bg-[var(--copilot-bg-primary)]/90 backdrop-blur-sm",
              "border-2 border-dashed",
              isDragAccept && "border-[var(--copilot-accent-green)]",
              isDragReject && "border-red-500",
              !isDragAccept && !isDragReject && "border-[var(--copilot-accent-blue)]"
            )}
          >
            <div className="text-center">
              <motion.div
                animate={{ y: [0, -8, 0] }}
                transition={{ repeat: Infinity, duration: 1.5 }}
              >
                <Upload className={cn(
                  "w-12 h-12 mx-auto mb-3",
                  isDragAccept && "text-[var(--copilot-accent-green)]",
                  isDragReject && "text-red-500",
                  !isDragAccept && !isDragReject && "text-[var(--copilot-accent-blue)]"
                )} />
              </motion.div>
              <p className="text-lg font-medium text-[var(--copilot-text-primary)]">
                {isDragReject ? "File type not supported" : "Drop files here"}
              </p>
              <p className="text-sm text-[var(--copilot-text-muted)] mt-1">
                Files will be added as context
              </p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      
      {children}
    </div>
  );
}

interface AttachButtonProps {
  onFilesSelected: (files: FileAttachment[]) => void;
  disabled?: boolean;
}

export function AttachButton({ onFilesSelected, disabled }: AttachButtonProps) {
  const handleClick = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = async (e) => {
      const files = (e.target as HTMLInputElement).files;
      if (files) {
        const attachments: FileAttachment[] = await Promise.all(
          Array.from(files).map(async (file) => {
            // Read file content
            let content = '';
            let preview = '';
            
            // Read text files
            if (file.type.startsWith('text/') || 
                /\.(ts|tsx|js|jsx|py|json|md|txt|css|html|xml|yaml|yml|toml|ini|sh|bash|ps1|bat|cmd)$/i.test(file.name)) {
              try {
                content = await file.text();
                preview = content.slice(0, 500) + (content.length > 500 ? '...' : '');
              } catch {
                content = '[Unable to read file content]';
              }
            } else if (file.type.startsWith('image/')) {
              // For images, create base64 data URL
              try {
                content = await new Promise<string>((resolve) => {
                  const reader = new FileReader();
                  reader.onload = () => resolve(reader.result as string);
                  reader.readAsDataURL(file);
                });
                preview = `[Image: ${file.name}]`;
              } catch {
                content = '[Unable to read image]';
              }
            } else {
              content = `[Binary file: ${file.name}, ${file.size} bytes]`;
              preview = content;
            }
            
            return {
              id: `file-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
              name: file.name,
              path: file.webkitRelativePath || file.name,
              size: file.size,
              type: 'file' as const,
              language: getFileLanguage(file.name),
              content,
              preview,
              addedAt: Date.now(),
            };
          })
        );
        onFilesSelected(attachments);
      }
    };
    input.click();
  };
  
  return (
    <button
      onClick={handleClick}
      disabled={disabled}
      className={cn(
        "p-2 rounded-lg transition-colors",
        "text-[var(--copilot-text-muted)] hover:text-[var(--copilot-text-primary)]",
        "hover:bg-[var(--copilot-bg-hover)]",
        disabled && "opacity-50 cursor-not-allowed"
      )}
      title="Attach files"
    >
      <FileText className="w-5 h-5" />
    </button>
  );
}
