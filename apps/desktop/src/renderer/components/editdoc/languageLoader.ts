/**
 * languageLoader.ts - Dynamic CodeMirror language extension loader
 * Maps language strings to CodeMirror language extensions
 */

import type { Extension } from '@codemirror/state';
import { javascript } from '@codemirror/lang-javascript';
import { python } from '@codemirror/lang-python';
import { markdown } from '@codemirror/lang-markdown';
import { html } from '@codemirror/lang-html';
import { css } from '@codemirror/lang-css';
import { json } from '@codemirror/lang-json';
import { yaml } from '@codemirror/lang-yaml';
import { sql } from '@codemirror/lang-sql';
import { rust } from '@codemirror/lang-rust';
import { StreamLanguage } from '@codemirror/language';
import { go } from '@codemirror/legacy-modes/mode/go';
import { shell } from '@codemirror/legacy-modes/mode/shell';
import { powerShell } from '@codemirror/legacy-modes/mode/powershell';
import { toml } from '@codemirror/legacy-modes/mode/toml';

/**
 * Get CodeMirror language extension for the given language string
 * @param language - Language identifier (e.g., 'typescript', 'python', 'markdown')
 * @returns CodeMirror extension for syntax highlighting
 */
export function getLanguageExtension(language?: string): Extension {
  if (!language) return [];

  switch (language.toLowerCase()) {
    // JavaScript/TypeScript family
    case 'typescript':
    case 'ts':
      return javascript({ typescript: true });
    case 'tsx':
      return javascript({ typescript: true, jsx: true });
    case 'javascript':
    case 'js':
      return javascript();
    case 'jsx':
      return javascript({ jsx: true });

    // Python
    case 'python':
    case 'py':
      return python();

    // Markup/Documents
    case 'markdown':
    case 'md':
      return markdown();
    case 'html':
    case 'htm':
      return html();

    // Stylesheets
    case 'css':
      return css();
    case 'scss':
    case 'sass':
    case 'less':
      return css(); // CSS mode works reasonably for SCSS/Less

    // Data formats
    case 'json':
    case 'jsonc':
      return json();
    case 'yaml':
    case 'yml':
      return yaml();
    case 'toml':
      return StreamLanguage.define(toml);

    // Database
    case 'sql':
      return sql();

    // Systems languages
    case 'rust':
    case 'rs':
      return rust();
    case 'go':
    case 'golang':
      return StreamLanguage.define(go);

    // Shell scripts
    case 'shell':
    case 'sh':
    case 'bash':
    case 'zsh':
      return StreamLanguage.define(shell);
    case 'powershell':
    case 'ps1':
    case 'psm1':
      return StreamLanguage.define(powerShell);

    // Plain text / unknown
    case 'text':
    case 'txt':
    default:
      return [];
  }
}
