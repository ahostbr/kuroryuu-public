import { useEffect, useState } from 'react';
import {
  ArrowLeft,
  FileText,
  FolderOpen,
  Code2,
  Package,
  Loader2,
  Copy,
  Check,
  BookOpen,
  Terminal,
  Play,
} from 'lucide-react';
import { useLLMAppsStore } from '../../stores/llm-apps-store';
import type { LLMApp } from '../../types/llm-apps';

interface LLMAppDetailProps {
  app: LLMApp;
  onBack: () => void;
}

export function LLMAppDetail({ app, onBack }: LLMAppDetailProps) {
  const readmeContent = useLLMAppsStore((s) => s.readmeContent);
  const readmeLoading = useLLMAppsStore((s) => s.readmeLoading);
  const loadAppReadme = useLLMAppsStore((s) => s.loadAppReadme);

  useEffect(() => {
    if (app.hasReadme) {
      loadAppReadme(app.path);
    }
  }, [app.path, app.hasReadme, loadAppReadme]);

  return (
    <div className="w-full h-full bg-zinc-900 text-zinc-100 flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex-shrink-0 border-b border-zinc-800 px-6 py-4">
        <button
          onClick={onBack}
          className="flex items-center gap-1.5 text-sm text-zinc-400 hover:text-amber-500 transition-colors mb-3"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to catalog
        </button>

        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-xl font-bold text-zinc-100 mb-1">{app.name}</h1>
            <span className="inline-block text-xs px-2 py-0.5 rounded bg-amber-500/10 text-amber-500 mb-2">
              {app.category}
            </span>
            {app.description && (
              <p className="text-sm text-zinc-400 mt-2 max-w-2xl">{app.description}</p>
            )}
          </div>

          <button
            onClick={() => window.electronAPI.shell.openExternal(`file:///${app.absolutePath.replace(/\\/g, '/')}`)}
            className="px-3 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-xs transition-colors flex items-center gap-1.5 flex-shrink-0"
          >
            <FolderOpen className="w-3.5 h-3.5" />
            Open Folder
          </button>
        </div>

        {/* Meta row */}
        <div className="flex flex-wrap gap-4 mt-3 text-xs text-zinc-500">
          <div className="flex items-center gap-1">
            <Code2 className="w-3.5 h-3.5" />
            {app.pyFileCount} Python file{app.pyFileCount !== 1 ? 's' : ''}
          </div>
          {app.entryPoint && (
            <div className="flex items-center gap-1">
              <FileText className="w-3.5 h-3.5" />
              {app.entryPoint}
            </div>
          )}
          <div className="flex items-center gap-1">
            <Package className="w-3.5 h-3.5" />
            {app.path}
          </div>
        </div>

        {/* Tech stack */}
        {app.techStack.length > 0 && (
          <div className="flex flex-wrap gap-1.5 mt-3">
            {app.techStack.map((tech) => (
              <span
                key={tech}
                className="px-2 py-0.5 text-xs rounded bg-zinc-800 text-zinc-300 border border-zinc-700"
              >
                {tech}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Quick Start + README Content */}
      <div className="flex-1 overflow-auto p-6">
        {/* Quick Start Card */}
        <QuickStartCard app={app} />

        {readmeLoading ? (
          <div className="flex items-center justify-center h-32">
            <Loader2 className="w-5 h-5 animate-spin text-amber-500" />
          </div>
        ) : readmeContent ? (
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 mb-4">
              <FileText className="w-4 h-4 text-zinc-500" />
              <span className="text-sm font-medium text-zinc-400">README.md</span>
            </div>
            <div
              className="prose prose-invert prose-sm max-w-none
                prose-headings:text-zinc-200 prose-headings:font-semibold
                prose-p:text-zinc-400 prose-p:leading-relaxed
                prose-a:text-amber-500 prose-a:no-underline hover:prose-a:underline
                prose-code:text-amber-400 prose-code:bg-zinc-800 prose-code:px-1 prose-code:rounded
                prose-pre:bg-zinc-800 prose-pre:border prose-pre:border-zinc-700
                prose-li:text-zinc-400
                prose-strong:text-zinc-300
                prose-hr:border-zinc-800"
            >
              <ReadmeRenderer content={readmeContent} />
            </div>
          </div>
        ) : app.hasReadme ? (
          <p className="text-zinc-500 text-sm">Failed to load README.</p>
        ) : (
          <p className="text-zinc-500 text-sm">No README available for this app.</p>
        )}
      </div>
    </div>
  );
}

/** Quick Start card with copy-to-clipboard commands and Run button */
function QuickStartCard({ app }: { app: LLMApp }) {
  const [copied, setCopied] = useState(false);
  const [launching, setLaunching] = useState(false);

  const REPO_URL = 'https://github.com/Shubhamsaboo/awesome-llm-apps';

  // Repo is already cloned by Kuroryuu wizard — show local path, not git clone
  const lines = [
    `cd ${app.absolutePath.replace(/\\/g, '/')}`,
  ];
  if (app.hasRequirements) lines.push('pip install -r requirements.txt');
  if (app.runCommand) lines.push(app.runCommand);

  const commandBlock = lines.join('\n');

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(commandBlock);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch { /* clipboard may not be available */ }
  };

  const handleRun = async () => {
    setLaunching(true);
    try {
      await window.electronAPI.llmApps.runApp(app.path, app.runCommand, app.hasRequirements);
    } catch (err) {
      console.error('[LLM Apps] Failed to launch:', err);
    } finally {
      setTimeout(() => setLaunching(false), 1500);
    }
  };

  return (
    <div className="max-w-3xl mb-6">
      <div className="bg-zinc-800 border border-zinc-700 rounded-lg overflow-hidden">
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-700">
          <div className="flex items-center gap-2">
            <Terminal className="w-4 h-4 text-amber-500" />
            <span className="text-sm font-medium text-zinc-200">Quick Start</span>
          </div>
          <div className="flex items-center gap-2">
            {app.tutorialUrl && (
              <button
                onClick={() => window.electronAPI.shell.openExternal(app.tutorialUrl!)}
                className="px-2.5 py-1 bg-violet-500/10 hover:bg-violet-500/20 text-violet-400 rounded text-xs transition-colors flex items-center gap-1.5"
              >
                <BookOpen className="w-3 h-3" />
                Tutorial
              </button>
            )}
            <button
              onClick={handleCopy}
              className="px-2.5 py-1 bg-zinc-700 hover:bg-zinc-600 text-zinc-300 rounded text-xs transition-colors flex items-center gap-1.5"
            >
              {copied ? (
                <>
                  <Check className="w-3 h-3 text-green-400" />
                  Copied
                </>
              ) : (
                <>
                  <Copy className="w-3 h-3" />
                  Copy
                </>
              )}
            </button>
            <button
              onClick={handleRun}
              disabled={launching}
              className="px-3 py-1 bg-green-600 hover:bg-green-700 disabled:bg-green-800 disabled:text-green-400 text-white rounded text-xs font-medium transition-colors flex items-center gap-1.5"
            >
              {launching ? (
                <>
                  <Loader2 className="w-3 h-3 animate-spin" />
                  Launching...
                </>
              ) : (
                <>
                  <Play className="w-3 h-3" />
                  Run
                </>
              )}
            </button>
          </div>
        </div>
        <pre className="px-4 py-3 text-sm font-mono text-zinc-300 overflow-x-auto leading-relaxed">
          {lines.map((line, i) => (
            <div key={i}>
              <span className="text-zinc-600 select-none">$ </span>
              {line}
            </div>
          ))}
        </pre>
        <div className="px-4 py-2 border-t border-zinc-700/50 flex items-center gap-3">
          <a
            href="#"
            onClick={(e) => {
              e.preventDefault();
              window.electronAPI.shell.openExternal(REPO_URL);
            }}
            className="text-[11px] text-zinc-500 hover:text-amber-500 hover:underline cursor-pointer"
          >
            {REPO_URL}
          </a>
        </div>
      </div>
    </div>
  );
}

/** Simple markdown-to-HTML renderer for READMEs */
function ReadmeRenderer({ content }: { content: string }) {
  const html = markdownToHtml(content);
  return <div dangerouslySetInnerHTML={{ __html: html }} />;
}

function markdownToHtml(md: string): string {
  let html = md;

  // Escape HTML entities (basic XSS prevention)
  html = html
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Code blocks (fenced)
  html = html.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, _lang, code) => {
    return `<pre><code>${code.trim()}</code></pre>`;
  });

  // Inline code
  html = html.replace(/`([^`]+)`/g, '<code>$1</code>');

  // Headings
  html = html.replace(/^######\s+(.+)$/gm, '<h6>$1</h6>');
  html = html.replace(/^#####\s+(.+)$/gm, '<h5>$1</h5>');
  html = html.replace(/^####\s+(.+)$/gm, '<h4>$1</h4>');
  html = html.replace(/^###\s+(.+)$/gm, '<h3>$1</h3>');
  html = html.replace(/^##\s+(.+)$/gm, '<h2>$1</h2>');
  html = html.replace(/^#\s+(.+)$/gm, '<h1>$1</h1>');

  // Bold and italic
  html = html.replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/\*(.+?)\*/g, '<em>$1</em>');

  // Links (but not images)
  html = html.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');

  // Images — render as placeholder text (no external loading)
  html = html.replace(/!\[([^\]]*)\]\([^)]+\)/g, '<em>[Image: $1]</em>');

  // Unordered lists
  html = html.replace(/^[-*]\s+(.+)$/gm, '<li>$1</li>');
  html = html.replace(/(<li>.*<\/li>\n?)+/g, '<ul>$&</ul>');

  // Ordered lists
  html = html.replace(/^\d+\.\s+(.+)$/gm, '<li>$1</li>');

  // Horizontal rule
  html = html.replace(/^---+$/gm, '<hr/>');

  // Paragraphs (double newlines)
  html = html.replace(/\n\n+/g, '</p><p>');
  html = '<p>' + html + '</p>';

  // Clean up empty paragraphs
  html = html.replace(/<p>\s*<\/p>/g, '');
  html = html.replace(/<p>\s*(<h[1-6]>)/g, '$1');
  html = html.replace(/(<\/h[1-6]>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<pre>)/g, '$1');
  html = html.replace(/(<\/pre>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<ul>)/g, '$1');
  html = html.replace(/(<\/ul>)\s*<\/p>/g, '$1');
  html = html.replace(/<p>\s*(<hr\/>)/g, '$1');
  html = html.replace(/(<hr\/>)\s*<\/p>/g, '$1');

  return html;
}
