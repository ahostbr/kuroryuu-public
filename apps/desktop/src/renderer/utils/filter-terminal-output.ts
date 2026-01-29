/**
 * Terminal Output Filter for Claude PTY Backend
 *
 * Cleans up terminal UI artifacts from Claude CLI output:
 * - ANSI escape sequences (colors, cursor movement)
 * - CLI UI elements (spinners, progress bars, keyboard hints)
 * - Window title sequences
 * - Installation/migration messages
 *
 * This is applied on the frontend as a second pass after backend filtering.
 */

// ANSI escape sequence patterns
const ANSI_ESCAPE_REGEX = /\x1b\[[0-9;]*[a-zA-Z]/g;  // CSI sequences
const ANSI_OSC_REGEX = /\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)?/g;  // OSC sequences
const ANSI_OTHER_REGEX = /\x1b[^[\]].?/g;  // Other escape sequences

// Inline patterns to strip (can appear anywhere in text)
const INLINE_STRIP_PATTERNS = [
  // Progress indicators: "Opus 4.5 0%", "Sonnet 3.5 50%", etc.
  /\b(Opus|Sonnet|Haiku)\s+\d+\.?\d*\s+\d+%/g,
  // Token counts: "0/200K", "150K/200K", "1.5M/2M"
  /\b\d+\.?\d*[KMG]?\/\d+\.?\d*[KMG]?\b/g,
  // Percentage with token count: "50% 100K/200K"
  /\b\d+%\s*\d+\.?\d*[KMG]?\/\d+\.?\d*[KMG]?\b/g,
  // Keyboard hints: "ctrl+g to edit in Notepad", "esc to interrupt"
  /ctrl\+[a-z]\s+to\s+edit\s+in\s+\w+/gi,
  /\(?\s*esc\s+to\s+interrupt[^)]*\)?/gi,
  // Installation/migration messages
  /Claude Code has switched from npm to native installer\.\s*/gi,
  /Run\s+`?claude\s+install`?\s+or\s+see\s+/gi,
  // Spinner text (without asterisk)
  /\b(Channeling|Slithering|Wrangling|Thinking)…\s*/g,
  // Asterisk-prefixed spinner text: *Vibing..., *Thinking..., etc.
  /\*(?:Vibing|Thinking|Channeling|Slithering|Wrangling)\.{2,}\s*/gi,
  /\*(?:Vibing|Thinking|Channeling|Slithering|Wrangling)…\s*/gi,
  // Generic asterisk spinner with word: *Word...
  /\*[A-Za-z]+\.{2,}\s*/g,
  // Reading/searching indicators
  /Reading\s+\d+\s+files?…\s*/gi,
  /Searching…\s*/gi,
  // Garbled partial words from terminal overwrites (single chars with spaces)
  /\b[A-Za-z]\s+[A-Za-z]\s+[A-Za-z]\s+[A-Za-z]\b/g,  // "W r Wan" pattern
  /\*[a-z]+\s+/gi,  // "*rg", "*n g" patterns
];

// Whole-line patterns to filter (line must match entirely or mostly)
const CLI_UI_PATTERNS = [
  /^0;.*Claude.*$/,                     // Window title
  /^[\s]*[✶✢✻✽●·*]+[\s]*$/,            // Spinner characters only
  /^Channeling…$/,                       // Spinner text
  /^Slithering…$/,                       // Spinner text
  /^Wrangling…$/,                        // Spinner text
  /^Thinking…$/,                         // Spinner text
  /^\s*·\s*thinking\)?\s*$/,            // Thinking indicator
  // Asterisk-prefixed spinner lines: *Vibing..., *Thinking..., etc.
  /^\*(?:Vibing|Thinking|Channeling|Slithering|Wrangling)\.{2,}$/,
  /^\*(?:Vibing|Thinking|Channeling|Slithering|Wrangling)…$/,
  /^\*[A-Za-z]+\.{2,}$/,                // Generic *Word...
  /^\(esc to interrupt.*\)$/,           // Interrupt hint
  /^ctrl\+[a-z] to edit in \w+$/i,      // Keyboard hint
  /^─{10,}$/,                           // Separator lines (10+ dashes)
  /^(Opus|Sonnet|Haiku)\s+\d+\.?\d*\s+\d+%\s+[\d.]+[KMG]?\/[\d.]+[KMG]?$/, // Progress bar
  /^\d+%\s+[\d.]+[KMG]?\/[\d.]+[KMG]?$/,  // Just progress
  /^[\d.]+[KMG]?\/[\d.]+[KMG]?$/,         // Just token counts
  /^❯\s*$/,                             // Empty prompt
  /^>\s*$/,                             // Empty prompt
  /^Reading \d+ files?…$/,              // File reading indicator
  /^Searching…$/,                       // Searching indicator
  /^Run\s+`?claude\s+install`?/i,       // Install hint
  /^https?:\/\/docs\.anthropic\.com\/\S*$/i,  // Bare URLs from install message
  /^n\/docs\/\S*$/,                     // Truncated doc paths
  /^or see$/i,                          // Fragment from install message
  /^for more options\.?$/i,             // Fragment from install message
];

// URLs that should be stripped (install/docs URLs mixed in output)
const STRIP_URLS = [
  /https?:\/\/docs\.anthropic\.com\/[^\s]*/gi,
];

/**
 * Filter terminal output to extract clean text.
 *
 * @param text Raw terminal output that may contain ANSI codes and CLI UI
 * @returns Clean text suitable for markdown rendering
 */
export function filterTerminalOutput(text: string): string {
  if (!text) return '';

  // Step 1: Strip ANSI escape sequences
  let result = text
    .replace(ANSI_ESCAPE_REGEX, '')
    .replace(ANSI_OSC_REGEX, '')
    .replace(ANSI_OTHER_REGEX, '');

  // Step 2: Strip inline patterns (before line processing)
  for (const pattern of INLINE_STRIP_PATTERNS) {
    result = result.replace(pattern, ' ');
  }

  // Step 3: Strip URLs from install messages
  for (const pattern of STRIP_URLS) {
    result = result.replace(pattern, '');
  }

  // Step 4: Handle carriage returns (progress bar overwrites)
  const lines = result.split('\n');
  const cleanedLines: string[] = [];

  for (let line of lines) {
    // Handle \r by taking last segment (terminal overwrites)
    if (line.includes('\r')) {
      const segments = line.split('\r');
      // Find the last non-empty, non-garbage segment
      for (let i = segments.length - 1; i >= 0; i--) {
        const seg = segments[i].trim();
        if (seg && seg.length > 3 && !/^[*\s\w]{1,3}$/.test(seg)) {
          line = segments[i];
          break;
        }
      }
      // If all segments are garbage, skip the line
      if (line.includes('\r')) {
        line = line.split('\r').pop() || '';
      }
    }

    const trimmed = line.trim();

    // Skip empty lines
    if (!trimmed) continue;

    // Skip very short garbage lines
    if (trimmed.length <= 2) continue;

    // Skip lines that are mostly spaces with scattered chars (terminal garbage)
    if (trimmed.length > 5 && (trimmed.match(/\s/g)?.length || 0) > trimmed.length * 0.6) {
      continue;
    }

    // Skip lines matching UI patterns
    const isUILine = CLI_UI_PATTERNS.some(pattern => pattern.test(trimmed));
    if (isUILine) continue;

    // Skip isolated spinner characters
    if (trimmed.length <= 3 && /^[✶✢✻✽●·*]+$/.test(trimmed)) continue;

    // Skip lines that look like progress remnants
    if (/^\d+%$/.test(trimmed) || /^\d+[KMG]?\/\d+[KMG]?$/.test(trimmed)) continue;

    // Keep the line (preserve internal spacing)
    cleanedLines.push(line.trimEnd());
  }

  // Step 5: Join and clean up
  result = cleanedLines.join('\n');

  // Clean up excessive whitespace
  result = result
    .replace(/\n{3,}/g, '\n\n')           // Collapse multiple newlines
    .replace(/[ \t]{2,}/g, ' ')           // Collapse multiple spaces
    .replace(/^\s+|\s+$/gm, '')           // Trim each line
    .trim();

  // Final cleanup: remove any remaining isolated fragments
  result = result
    .replace(/\s*\.\.\.\s*$/gm, '')       // Trailing "..."
    .replace(/^\s*\.\.\.\s*/gm, '')       // Leading "..."
    .replace(/\s+\./g, '.')               // Space before period
    .trim();

  return result;
}

/**
 * Quick check if text likely contains terminal artifacts.
 * Used to decide whether to apply filtering.
 */
export function hasTerminalArtifacts(text: string): boolean {
  if (!text) return false;

  // Check for ANSI escape codes
  if (/\x1b\[/.test(text)) return true;

  // Check for common spinner characters
  if (/[✶✢✻✽●]/.test(text)) return true;

  // Check for asterisk-prefixed spinner text: *Vibing..., *Thinking..., etc.
  if (/\*(?:Vibing|Thinking|Channeling|Slithering|Wrangling)/i.test(text)) return true;
  if (/\*[A-Za-z]+\.{2,}/.test(text)) return true;

  // Check for progress indicators (inline)
  if (/\b(Opus|Sonnet|Haiku)\s+\d+\.?\d*\s+\d+%/.test(text)) return true;
  if (/\d+%\s*\d+[KMG]?\/\d+[KMG]?/.test(text)) return true;
  if (/\b\d+[KMG]?\/\d+[KMG]?\b/.test(text)) return true;

  // Check for keyboard hints
  if (/ctrl\+[a-z]\s+to\s+edit/i.test(text)) return true;

  // Check for install message
  if (/Claude Code has switched/i.test(text)) return true;
  if (/Run\s+`?claude\s+install/i.test(text)) return true;

  return false;
}

/**
 * Remove user input echo from the beginning of PTY response.
 * Claude CLI echoes the user's input before responding.
 *
 * IMPORTANT: This function is conservative - it only strips if it finds
 * an EXACT or near-exact match at the very beginning. It will NOT strip
 * if doing so would remove most of the response.
 *
 * @param text The PTY response text
 * @param userInput The user's original input message
 * @returns Text with input echo removed from the beginning
 */
export function stripInputEcho(text: string, userInput: string): string {
  if (!text || !userInput) return text;

  // Safety: never strip more than the input length + reasonable padding
  const maxStripLength = userInput.length * 3;
  if (text.length <= maxStripLength) {
    // Response is too short - stripping would likely remove actual content
    // Only strip if we find an exact prefix match
    const trimmedText = text.trimStart();
    if (trimmedText.toLowerCase().startsWith(userInput.toLowerCase())) {
      const stripped = trimmedText.slice(userInput.length).trimStart();
      // Ensure we're not stripping everything
      if (stripped.length > 0) {
        return stripped;
      }
    }
    return text;
  }

  // For longer responses, look for input echo at the start
  const searchWindow = text.slice(0, maxStripLength);
  const normalizedInput = userInput.replace(/\s+/g, '').toLowerCase();
  const normalizedWindow = searchWindow.replace(/\s+/g, '').toLowerCase();

  // Only proceed if we find the input at the start
  if (!normalizedWindow.startsWith(normalizedInput)) {
    return text;
  }

  // Find where the echo ends (conservative approach)
  let endPos = 0;
  let matched = 0;
  for (let i = 0; i < searchWindow.length && matched < userInput.length; i++) {
    const char = text[i].toLowerCase();
    const targetChar = userInput[matched].toLowerCase();

    if (char === targetChar) {
      matched++;
      endPos = i + 1;
    } else if (/\s/.test(text[i])) {
      // Skip whitespace but don't count it as match progress
      endPos = i + 1;
    } else {
      // Non-matching, non-whitespace character - stop here
      break;
    }
  }

  // Only strip if we matched the full input
  if (matched >= userInput.length) {
    const stripped = text.slice(endPos).trimStart();
    // Final safety: ensure we didn't strip too much
    if (stripped.length >= text.length * 0.3) {
      return stripped;
    }
  }

  return text;
}

export default filterTerminalOutput;
