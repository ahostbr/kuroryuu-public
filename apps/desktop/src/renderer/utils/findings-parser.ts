import { Finding, FindingSeverity, FindingCategory, FindingsExtractionResult } from '../types/finding';
import { TaskCategory } from '../types/task';

/**
 * Generate a simple unique ID for findings
 */
function generateFindingId(): string {
  return `f_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 6)}`;
}

/**
 * Parse a section of findings from log output
 * Handles patterns like:
 * - "1. **Title** - description"
 * - "- **Title** - description"
 * - "1. **Title** (`file.ts:line`) - description"
 */
function parseFindingItems(section: string): Array<{ title: string; description: string; location?: string }> {
  const items: Array<{ title: string; description: string; location?: string }> = [];

  // Match numbered or bulleted items with bold titles
  // Pattern: "1. **title** - desc" or "- **title** - desc" or "1. **title** (`file:line`) - desc"
  const itemPattern = /(?:^\d+\.\s*|\n\d+\.\s*|^-\s*|\n-\s*)\*\*([^*]+)\*\*(?:\s*\(`?([^`)]+)`?\))?\s*[-–—]?\s*(.+?)(?=\n\d+\.|\n-\s*\*\*|$)/gs;

  let match;
  while ((match = itemPattern.exec(section)) !== null) {
    const [, title, location, description] = match;
    if (title && description) {
      items.push({
        title: title.trim(),
        description: description.trim(),
        location: location?.trim()
      });
    }
  }

  // Also try simpler pattern: numbered items without bold
  // "1. Title - description"
  if (items.length === 0) {
    const simplePattern = /(?:^\d+\.\s*|\n\d+\.\s*)([^-\n]+)\s*[-–—]\s*(.+?)(?=\n\d+\.|\n\n|$)/gs;
    while ((match = simplePattern.exec(section)) !== null) {
      const [, title, description] = match;
      if (title && description) {
        items.push({
          title: title.trim(),
          description: description.trim()
        });
      }
    }
  }

  return items;
}

/**
 * Extract location info (file path and line numbers) from text
 */
function extractLocation(text: string): { location?: string; lineNumbers?: string } {
  // Pattern: `filename.ts:123` or `filename.ts:123-456`
  const fileLinePattern = /`([^`]+(?:\.ts|\.tsx|\.js|\.jsx|\.py|\.rs|\.go)[^`]*):(\d+(?:-\d+)?)`/;
  const match = text.match(fileLinePattern);

  if (match) {
    return {
      location: match[1],
      lineNumbers: match[2]
    };
  }

  // Pattern: (filename.ts:line)
  const parenPattern = /\(([^)]+(?:\.ts|\.tsx|\.js|\.jsx|\.py|\.rs|\.go)[^)]*):(\d+(?:-\d+)?)\)/;
  const parenMatch = text.match(parenPattern);

  if (parenMatch) {
    return {
      location: parenMatch[1],
      lineNumbers: parenMatch[2]
    };
  }

  return {};
}

/**
 * Map severity header text to FindingSeverity
 */
function detectSeverity(headerText: string): FindingSeverity {
  const lower = headerText.toLowerCase();
  if (lower.includes('critical')) return 'critical';
  if (lower.includes('high') || lower.includes('severe')) return 'high';
  if (lower.includes('medium') || lower.includes('moderate')) return 'medium';
  if (lower.includes('low') || lower.includes('minor')) return 'low';
  if (lower.includes('info') || lower.includes('note')) return 'info';
  return 'medium'; // default
}

/**
 * Map section header text to FindingCategory
 */
function detectCategory(headerText: string): FindingCategory {
  const lower = headerText.toLowerCase();
  if (lower.includes('memory') || lower.includes('leak')) return 'memory_leak';
  if (lower.includes('security') || lower.includes('vulnerabilit')) return 'security';
  if (lower.includes('performance') || lower.includes('slow')) return 'performance';
  if (lower.includes('quality') || lower.includes('style') || lower.includes('lint')) return 'code_quality';
  if (lower.includes('test')) return 'testing';
  if (lower.includes('doc')) return 'documentation';
  if (lower.includes('refactor')) return 'refactoring';
  return 'bug'; // default
}

/**
 * Extract structured findings from raw session logs
 *
 * Handles common patterns from code review agent output:
 * - "### Critical Issues (N)"
 * - "### Memory Leaks (N)"
 * - "### Code Quality"
 * - Numbered/bulleted lists with **bold titles**
 */
export function extractFindings(logs: string, sessionId: string): FindingsExtractionResult {
  const findings: Finding[] = [];

  // Pattern to find section headers like "### Critical Issues (3)" or "## Memory Leaks"
  const sectionPattern = /(?:^|\n)#{2,3}\s*([^\n]+?)(?:\s*\(\d+\))?[\s\n]+([\s\S]*?)(?=\n#{2,3}\s|$)/g;

  let match;
  while ((match = sectionPattern.exec(logs)) !== null) {
    const [, headerText, sectionContent] = match;

    // Skip non-finding sections
    const skipPatterns = ['summary', 'overview', 'introduction', 'conclusion', 'recommendation'];
    if (skipPatterns.some(p => headerText.toLowerCase().includes(p))) {
      continue;
    }

    // Detect severity and category from header
    const severity = detectSeverity(headerText);
    const category = detectCategory(headerText);

    // Parse items in this section
    const items = parseFindingItems(sectionContent);

    for (const item of items) {
      const locationInfo = extractLocation(item.description) ||
                          (item.location ? { location: item.location } : {});

      findings.push({
        id: generateFindingId(),
        title: item.title,
        description: item.description,
        severity,
        category,
        location: locationInfo.location,
        lineNumbers: locationInfo.lineNumbers,
        selected: severity === 'critical' || severity === 'high' // Auto-select critical/high
      });
    }
  }

  // Also try to find standalone bullet points with severity keywords
  const standalonePattern = /\n-\s*\*\*(Critical|High|Medium|Low|Warning|Error|Bug|Issue):\s*([^*]+)\*\*\s*[-–—]?\s*(.+)/gi;
  while ((match = standalonePattern.exec(logs)) !== null) {
    const [, severityText, title, description] = match;
    const severity = detectSeverity(severityText);
    const locationInfo = extractLocation(description);

    findings.push({
      id: generateFindingId(),
      title: title.trim(),
      description: description.trim(),
      severity,
      category: 'bug',
      location: locationInfo.location,
      lineNumbers: locationInfo.lineNumbers,
      selected: severity === 'critical' || severity === 'high'
    });
  }

  // Calculate metadata
  const bySeverity: Record<FindingSeverity, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
    info: 0
  };

  const byCategory: Record<FindingCategory, number> = {
    bug: 0,
    security: 0,
    performance: 0,
    memory_leak: 0,
    code_quality: 0,
    refactoring: 0,
    testing: 0,
    documentation: 0
  };

  for (const finding of findings) {
    bySeverity[finding.severity]++;
    byCategory[finding.category]++;
  }

  return {
    sessionId,
    extractedAt: new Date().toISOString(),
    findings,
    metadata: {
      totalFound: findings.length,
      bySeverity,
      byCategory
    }
  };
}

/**
 * Convert finding severity to task priority
 */
export function findingSeverityToPriority(severity: FindingSeverity): 'high' | 'medium' | 'low' {
  switch (severity) {
    case 'critical':
    case 'high':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
    case 'info':
    default:
      return 'low';
  }
}

/**
 * Convert finding category to task category
 */
export function findingCategoryToTaskCategory(category: FindingCategory): TaskCategory {
  const mapping: Record<FindingCategory, TaskCategory> = {
    bug: 'bug_fix',
    security: 'security',
    performance: 'performance',
    memory_leak: 'bug_fix',
    code_quality: 'refactoring',
    refactoring: 'refactoring',
    testing: 'testing',
    documentation: 'documentation'
  };
  return mapping[category] || 'bug_fix';
}

/**
 * Build task description from finding
 */
export function buildTaskDescription(finding: Finding, sessionId: string): string {
  let desc = finding.description;

  if (finding.location) {
    desc += `\n\n**Location:** \`${finding.location}\``;
    if (finding.lineNumbers) {
      desc += ` (lines ${finding.lineNumbers})`;
    }
  }

  desc += `\n\n_From agent session: ${sessionId}_`;

  return desc;
}
