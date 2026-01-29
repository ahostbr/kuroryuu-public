/**
 * Security Scanner Service
 * 
 * Scans code for security issues:
 * - Secret detection (API keys, tokens, passwords)
 * - Dependency vulnerabilities
 * - Code security patterns
 */

import { ipcMain } from 'electron';
import { execSync } from 'child_process';
import { readFileSync, readdirSync, statSync } from 'fs';
import { join, extname } from 'path';

// Configuration
let securityEnabled = false;

// Secret patterns to detect
const SECRET_PATTERNS: SecretPattern[] = [
  // API Keys
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g, severity: 'critical' },
  { name: 'AWS Secret Key', pattern: /(?<![A-Za-z0-9/+=])[A-Za-z0-9/+=]{40}(?![A-Za-z0-9/+=])/g, severity: 'critical' },
  { name: 'GitHub Token', pattern: /gh[ps]_[A-Za-z0-9_]{36,}/g, severity: 'critical' },
  { name: 'GitHub OAuth', pattern: /gho_[A-Za-z0-9_]{36,}/g, severity: 'critical' },
  { name: 'Anthropic API Key', pattern: /sk-ant-[A-Za-z0-9-_]{40,}/g, severity: 'critical' },
  { name: 'OpenAI API Key', pattern: /sk-[A-Za-z0-9]{48}/g, severity: 'critical' },
  { name: 'Slack Token', pattern: /xox[baprs]-[0-9A-Za-z-]{10,}/g, severity: 'high' },
  { name: 'Discord Token', pattern: /[MN][A-Za-z\d]{23,}\.[\w-]{6}\.[\w-]{27}/g, severity: 'high' },
  { name: 'Stripe Key', pattern: /sk_live_[0-9a-zA-Z]{24}/g, severity: 'critical' },
  { name: 'Google API Key', pattern: /AIza[0-9A-Za-z-_]{35}/g, severity: 'high' },
  
  // Generic patterns
  { name: 'Private Key', pattern: /-----BEGIN (?:RSA |EC |DSA )?PRIVATE KEY-----/g, severity: 'critical' },
  { name: 'Password in URL', pattern: /[a-zA-Z]{3,10}:\/\/[^/\s:@]+:[^/\s:@]+@/g, severity: 'critical' },
  { name: 'Generic Secret', pattern: /(?:secret|password|passwd|pwd|token|api[_-]?key)[\s]*[=:]["']?[A-Za-z0-9+/=_-]{16,}["']?/gi, severity: 'high' },
  { name: 'Base64 Encoded Secret', pattern: /(?:secret|password|token|key)[\s]*=[\s]*["']?[A-Za-z0-9+/]{32,}={0,2}["']?/gi, severity: 'medium' },
];

// File extensions to scan
const SCANNABLE_EXTENSIONS = new Set([
  '.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs',
  '.py', '.rb', '.go', '.java', '.kt', '.scala',
  '.json', '.yaml', '.yml', '.toml', '.ini', '.cfg',
  '.env', '.sh', '.bash', '.zsh', '.ps1',
  '.md', '.txt', '.html', '.xml',
]);

// Files/dirs to skip
const SKIP_PATTERNS = [
  'node_modules', '.git', 'dist', 'build', 'out',
  '.next', '.nuxt', 'coverage', '__pycache__',
  '*.min.js', '*.bundle.js', 'package-lock.json', 'yarn.lock',
];

interface SecretPattern {
  name: string;
  pattern: RegExp;
  severity: 'critical' | 'high' | 'medium' | 'low';
}

interface SecretFinding {
  type: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  file: string;
  line: number;
  preview: string;  // Redacted snippet
}

interface VulnerabilityFinding {
  package: string;
  version: string;
  vulnerability: string;
  severity: 'critical' | 'high' | 'medium' | 'low';
  fixedIn?: string;
}

interface ScanResult {
  secrets: SecretFinding[];
  vulnerabilities: VulnerabilityFinding[];
  scannedFiles: number;
  scanTime: number;
  error?: string;
}

/**
 * Configure security scanner
 */
export function configureSecurity(config: { enabled?: boolean }): void {
  if (config.enabled !== undefined) securityEnabled = config.enabled;
}

/**
 * Check if path should be skipped
 */
function shouldSkip(path: string): boolean {
  return SKIP_PATTERNS.some(pattern => {
    if (pattern.includes('*')) {
      const regex = new RegExp(pattern.replace('*', '.*'));
      return regex.test(path);
    }
    return path.includes(pattern);
  });
}

/**
 * Scan file for secrets
 */
function scanFileForSecrets(filePath: string): SecretFinding[] {
  const findings: SecretFinding[] = [];
  
  try {
    const content = readFileSync(filePath, 'utf-8');
    const lines = content.split('\n');

    for (let lineNum = 0; lineNum < lines.length; lineNum++) {
      const line = lines[lineNum];
      
      for (const pattern of SECRET_PATTERNS) {
        // Reset regex lastIndex
        pattern.pattern.lastIndex = 0;
        
        let match;
        while ((match = pattern.pattern.exec(line)) !== null) {
          // Create redacted preview
          const matchStr = match[0];
          const redacted = matchStr.length > 8 
            ? matchStr.slice(0, 4) + '***' + matchStr.slice(-4)
            : '***';
          
          findings.push({
            type: pattern.name,
            severity: pattern.severity,
            file: filePath,
            line: lineNum + 1,
            preview: line.replace(matchStr, redacted).slice(0, 100),
          });
        }
      }
    }
  } catch {
    // Skip files that can't be read
  }

  return findings;
}

/**
 * Recursively scan directory for secrets
 */
function scanDirectoryForSecrets(dirPath: string, findings: SecretFinding[] = [], fileCount = { value: 0 }): SecretFinding[] {
  try {
    const entries = readdirSync(dirPath);

    for (const entry of entries) {
      const fullPath = join(dirPath, entry);
      
      if (shouldSkip(fullPath)) continue;

      try {
        const stat = statSync(fullPath);
        
        if (stat.isDirectory()) {
          scanDirectoryForSecrets(fullPath, findings, fileCount);
        } else if (stat.isFile()) {
          const ext = extname(entry).toLowerCase();
          
          // Also scan files without extension (like .env, Dockerfile)
          if (SCANNABLE_EXTENSIONS.has(ext) || !ext || entry.startsWith('.')) {
            fileCount.value++;
            const fileFindings = scanFileForSecrets(fullPath);
            findings.push(...fileFindings);
          }
        }
      } catch {
        // Skip files/dirs with permission issues
      }
    }
  } catch {
    // Skip dirs that can't be read
  }

  return findings;
}

/**
 * Scan npm dependencies for vulnerabilities
 */
function scanNpmVulnerabilities(projectPath: string): VulnerabilityFinding[] {
  const findings: VulnerabilityFinding[] = [];
  
  try {
    const result = execSync('npm audit --json', {
      cwd: projectPath,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    const audit = JSON.parse(result);
    
    if (audit.vulnerabilities) {
      for (const [pkg, info] of Object.entries(audit.vulnerabilities)) {
        const vuln = info as { severity: string; via: Array<{ title?: string }>; fixAvailable?: { version?: string } };
        findings.push({
          package: pkg,
          version: '',  // Would need to parse package-lock.json
          vulnerability: vuln.via?.[0]?.title || 'Unknown vulnerability',
          severity: vuln.severity as VulnerabilityFinding['severity'],
          fixedIn: vuln.fixAvailable?.version,
        });
      }
    }
  } catch (error) {
    // npm audit might exit with non-zero if vulnerabilities found
    try {
      const err = error as { stdout?: string };
      if (err.stdout) {
        const audit = JSON.parse(err.stdout);
        if (audit.vulnerabilities) {
          for (const [pkg, info] of Object.entries(audit.vulnerabilities)) {
            const vuln = info as { severity: string; via: Array<{ title?: string }>; fixAvailable?: { version?: string } };
            findings.push({
              package: pkg,
              version: '',
              vulnerability: vuln.via?.[0]?.title || 'Unknown vulnerability',
              severity: vuln.severity as VulnerabilityFinding['severity'],
              fixedIn: vuln.fixAvailable?.version,
            });
          }
        }
      }
    } catch {
      // Ignore parse errors
    }
  }

  return findings;
}

/**
 * Run full security scan
 */
function runScan(params: {
  path: string;
  scanSecrets?: boolean;
  scanDeps?: boolean;
}): ScanResult {
  if (!securityEnabled) {
    return {
      secrets: [],
      vulnerabilities: [],
      scannedFiles: 0,
      scanTime: 0,
      error: 'Security scanning is not enabled',
    };
  }

  const startTime = Date.now();
  const result: ScanResult = {
    secrets: [],
    vulnerabilities: [],
    scannedFiles: 0,
    scanTime: 0,
  };

  // Scan for secrets
  if (params.scanSecrets !== false) {
    const fileCount = { value: 0 };
    result.secrets = scanDirectoryForSecrets(params.path, [], fileCount);
    result.scannedFiles = fileCount.value;
  }

  // Scan dependencies
  if (params.scanDeps !== false) {
    result.vulnerabilities = scanNpmVulnerabilities(params.path);
  }

  result.scanTime = Date.now() - startTime;
  return result;
}

/**
 * Quick scan a single file
 */
function scanFile(filePath: string): SecretFinding[] {
  if (!securityEnabled) return [];
  return scanFileForSecrets(filePath);
}

/**
 * Get scan summary
 */
function getSummary(result: ScanResult): {
  secretCount: { critical: number; high: number; medium: number; low: number };
  vulnCount: { critical: number; high: number; medium: number; low: number };
  riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'none';
} {
  const secretCount = { critical: 0, high: 0, medium: 0, low: 0 };
  const vulnCount = { critical: 0, high: 0, medium: 0, low: 0 };

  for (const s of result.secrets) {
    secretCount[s.severity]++;
  }

  for (const v of result.vulnerabilities) {
    vulnCount[v.severity]++;
  }

  let riskLevel: 'critical' | 'high' | 'medium' | 'low' | 'none' = 'none';
  if (secretCount.critical > 0 || vulnCount.critical > 0) riskLevel = 'critical';
  else if (secretCount.high > 0 || vulnCount.high > 0) riskLevel = 'high';
  else if (secretCount.medium > 0 || vulnCount.medium > 0) riskLevel = 'medium';
  else if (secretCount.low > 0 || vulnCount.low > 0) riskLevel = 'low';

  return { secretCount, vulnCount, riskLevel };
}

// ============================================================================
// IPC Setup
// ============================================================================

export function setupSecurityIpc(): void {
  // Configure
  ipcMain.handle('security:configure', (_, config: Parameters<typeof configureSecurity>[0]) => {
    configureSecurity(config);
    return { ok: true };
  });

  // Status
  ipcMain.handle('security:status', () => {
    return { enabled: securityEnabled };
  });

  // Run full scan
  ipcMain.handle('security:scan', (_, params: Parameters<typeof runScan>[0]) => {
    return runScan(params);
  });

  // Scan single file
  ipcMain.handle('security:scanFile', (_, filePath: string) => {
    return scanFile(filePath);
  });

  // Get patterns (for UI display)
  ipcMain.handle('security:patterns', () => {
    return SECRET_PATTERNS.map(p => ({
      name: p.name,
      severity: p.severity,
    }));
  });
}

// Export types
export type { SecretFinding, VulnerabilityFinding, ScanResult };
