/**
 * CLI Proxy Native Manager
 *
 * Manages CLIProxyAPIPlus as a native binary (alternative to Docker mode).
 * Handles binary provisioning, process lifecycle, and OAuth flows.
 *
 * CLIProxyAPIPlus (https://github.com/router-for-me/CLIProxyAPIPlus) adds:
 * - GitHub Copilot support (--github-copilot-login)
 * - Kiro/AWS CodeWhisperer support (--kiro-aws-authcode, --kiro-login)
 * - Built-in rate limiting and automatic token refresh
 * - Request metrics/monitoring
 */

import { spawn, ChildProcess, exec } from 'child_process';
import { promisify } from 'util';
import { app } from 'electron';
import * as path from 'path';
import * as fs from 'fs/promises';
import * as fsSync from 'fs';
import * as https from 'https';
import * as http from 'http';
import { getProjectRoot } from '../utils/paths';

const execAsync = promisify(exec);

export interface NativeManagerConfig {
  binaryPath: string;
  configPath: string;
  port: number;
  dataDir: string;
}

interface DownloadProgress {
  downloaded: number;
  total: number;
  percent: number;
}

export class CLIProxyNativeManager {
  private config: NativeManagerConfig;
  private process: ChildProcess | null = null;
  private pid: number | null = null;

  constructor(config?: Partial<NativeManagerConfig>) {
    const dataDir = this.getDefaultDataDir();
    this.config = {
      binaryPath: config?.binaryPath || path.join(dataDir, this.getBinaryName()),
      configPath: config?.configPath || path.join(dataDir, 'config.yaml'),
      port: config?.port || 8317,
      dataDir: dataDir,
      ...config,
    };
  }

  /**
   * Get platform-specific data directory.
   * Prefers project-local .cliproxyapi/ if it exists, otherwise falls back to global.
   */
  private getDefaultDataDir(): string {
    // Prefer project-local .cliproxyapi/ (portable with the project)
    const projectRoot = getProjectRoot();
    const projectLocal = path.join(projectRoot, '.cliproxyapi');
    if (fsSync.existsSync(projectLocal)) {
      return projectLocal;
    }

    // Fall back to global (for packaged app distribution or first-time setup)
    const platform = process.platform;
    if (platform === 'win32') {
      return path.join(app.getPath('appData'), 'Kuroryuu', 'cliproxyapi');
    } else if (platform === 'darwin') {
      return path.join(app.getPath('home'), 'Library', 'Application Support', 'Kuroryuu', 'cliproxyapi');
    } else {
      return path.join(app.getPath('home'), '.config', 'Kuroryuu', 'cliproxyapi');
    }
  }

  /**
   * Get project-local CLIProxyAPI directory path.
   * Returns the path even if it doesn't exist yet (for provisioning).
   */
  getProjectLocalDir(): string {
    const projectRoot = getProjectRoot();
    return path.join(projectRoot, '.cliproxyapi');
  }

  /**
   * Get platform-specific binary name
   */
  private getBinaryName(): string {
    return process.platform === 'win32' ? 'CLIProxyAPIPlus.exe' : 'CLIProxyAPIPlus';
  }

  /**
   * Get download info for current platform
   * Returns URL and archive extension
   */
  private getDownloadInfo(): { url: string; archiveExt: string; version?: string } {
    const platform = process.platform;
    const arch = process.arch;

    let os: string;
    let archiveExt: string;

    if (platform === 'win32') {
      os = 'windows';
      archiveExt = 'zip';
    } else if (platform === 'darwin') {
      os = 'darwin';
      archiveExt = 'tar.gz';
    } else {
      os = 'linux';
      archiveExt = 'tar.gz';
    }

    const archStr = (arch === 'x64') ? 'amd64' : (arch === 'arm64' ? 'arm64' : 'amd64');

    // Use latest redirect - GitHub will resolve to actual version
    const url = `https://github.com/router-for-me/CLIProxyAPIPlus/releases/latest/download/CLIProxyAPIPlus_latest_${os}_${archStr}.${archiveExt}`;

    return { url, archiveExt };
  }

  /**
   * Get versioned download URL (fetches latest version from API first)
   */
  private async getVersionedDownloadUrl(): Promise<{ url: string; archiveExt: string; version: string }> {
    const platform = process.platform;
    const arch = process.arch;

    let os: string;
    let archiveExt: string;

    if (platform === 'win32') {
      os = 'windows';
      archiveExt = 'zip';
    } else if (platform === 'darwin') {
      os = 'darwin';
      archiveExt = 'tar.gz';
    } else {
      os = 'linux';
      archiveExt = 'tar.gz';
    }

    const archStr = (arch === 'x64') ? 'amd64' : (arch === 'arm64' ? 'arm64' : 'amd64');

    // Fetch latest release to get version number
    const response = await fetch('https://api.github.com/repos/router-for-me/CLIProxyAPIPlus/releases/latest');
    if (!response.ok) {
      throw new Error(`Failed to fetch release info: ${response.status}`);
    }
    const data = await response.json();
    const version = data.tag_name?.replace(/^v/, '') || 'latest';

    const url = `https://github.com/router-for-me/CLIProxyAPIPlus/releases/latest/download/CLIProxyAPIPlus_${version}_${os}_${archStr}.${archiveExt}`;

    return { url, archiveExt, version };
  }

  /**
   * Download a file with progress callback
   */
  private async downloadFile(
    url: string,
    destPath: string,
    onProgress?: (progress: DownloadProgress) => void
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      const request = (url.startsWith('https') ? https : http).get(url, (response) => {
        // Handle redirects
        if (response.statusCode === 301 || response.statusCode === 302) {
          const redirectUrl = response.headers.location;
          if (redirectUrl) {
            this.downloadFile(redirectUrl, destPath, onProgress).then(resolve).catch(reject);
            return;
          }
        }

        if (response.statusCode !== 200) {
          reject(new Error(`Download failed: HTTP ${response.statusCode}`));
          return;
        }

        const totalSize = parseInt(response.headers['content-length'] || '0', 10);
        let downloaded = 0;

        const fileStream = require('fs').createWriteStream(destPath);

        response.on('data', (chunk: Buffer) => {
          downloaded += chunk.length;
          if (onProgress && totalSize > 0) {
            onProgress({
              downloaded,
              total: totalSize,
              percent: Math.round((downloaded / totalSize) * 100),
            });
          }
        });

        response.pipe(fileStream);

        fileStream.on('finish', () => {
          fileStream.close();
          resolve();
        });

        fileStream.on('error', (err: Error) => {
          require('fs').unlink(destPath, () => {});
          reject(err);
        });
      });

      request.on('error', reject);
      request.end();
    });
  }

  /**
   * Check if binary exists and get version
   */
  async getBinaryVersion(): Promise<string | null> {
    try {
      await fs.access(this.config.binaryPath);
      const { stdout } = await execAsync(`"${this.config.binaryPath}" -version`, { timeout: 5000 });
      return stdout.trim();
    } catch {
      return null;
    }
  }

  /**
   * Extract archive (zip or tar.gz)
   */
  private async extractArchive(archivePath: string, destDir: string, archiveExt: string): Promise<void> {
    const { exec } = require('child_process');
    const { promisify } = require('util');
    const execAsync = promisify(exec);

    if (archiveExt === 'zip') {
      // Windows: use PowerShell
      await execAsync(
        `powershell -Command "Expand-Archive -Path '${archivePath}' -DestinationPath '${destDir}' -Force"`,
        { timeout: 60000 }
      );
    } else {
      // Unix: use tar
      await execAsync(`tar -xzf "${archivePath}" -C "${destDir}"`, { timeout: 60000 });
    }
  }

  /**
   * Find the binary in extracted directory
   */
  private async findExtractedBinary(destDir: string): Promise<string | null> {
    const binaryName = this.getBinaryName();
    const entries = await fs.readdir(destDir, { withFileTypes: true });

    // Check root level
    for (const entry of entries) {
      if (entry.name === binaryName || entry.name === 'CLIProxyAPIPlus' || entry.name === 'CLIProxyAPIPlus.exe') {
        return path.join(destDir, entry.name);
      }
    }

    // Check subdirectories (archives often have a top-level folder)
    for (const entry of entries) {
      if (entry.isDirectory()) {
        const subPath = path.join(destDir, entry.name);
        const subEntries = await fs.readdir(subPath);
        for (const subEntry of subEntries) {
          if (subEntry === binaryName || subEntry === 'CLIProxyAPIPlus' || subEntry === 'CLIProxyAPIPlus.exe') {
            return path.join(subPath, subEntry);
          }
        }
      }
    }

    return null;
  }

  /**
   * Provision (download) the CLIProxyAPI binary
   */
  async provision(onProgress?: (progress: DownloadProgress) => void): Promise<{
    success: boolean;
    version?: string;
    error?: string;
  }> {
    try {
      // Ensure data directory exists
      await fs.mkdir(this.config.dataDir, { recursive: true });

      // Get versioned download URL
      const { url: downloadUrl, archiveExt, version } = await this.getVersionedDownloadUrl();
      console.log(`[CLIProxyNative] Downloading v${version} from: ${downloadUrl}`);

      // Download archive
      const archivePath = path.join(this.config.dataDir, `CLIProxyAPIPlus.${archiveExt}`);
      await this.downloadFile(downloadUrl, archivePath, onProgress);

      // Create temp extraction directory
      const extractDir = path.join(this.config.dataDir, 'extract_temp');
      await fs.mkdir(extractDir, { recursive: true });

      // Extract archive
      console.log(`[CLIProxyNative] Extracting archive...`);
      await this.extractArchive(archivePath, extractDir, archiveExt);

      // Find the binary in extracted contents
      const extractedBinary = await this.findExtractedBinary(extractDir);
      if (!extractedBinary) {
        throw new Error('Could not find CLIProxyAPIPlus binary in extracted archive');
      }

      // Move binary to final location
      await fs.copyFile(extractedBinary, this.config.binaryPath);

      // Make executable on Unix
      if (process.platform !== 'win32') {
        await fs.chmod(this.config.binaryPath, 0o755);
      }

      // Clean up
      await fs.rm(extractDir, { recursive: true, force: true });
      await fs.unlink(archivePath).catch(() => {});

      // Create default config if it doesn't exist
      await this.ensureConfig();

      // Verify binary works and get version
      const binaryVersion = await this.getBinaryVersion();

      // Save version info
      await fs.writeFile(
        path.join(this.config.dataDir, 'version.txt'),
        version || binaryVersion || 'unknown'
      );

      console.log(`[CLIProxyNative] Provisioned successfully, version: ${version}`);
      return { success: true, version: version || binaryVersion || undefined };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`[CLIProxyNative] Provision failed:`, error);
      return { success: false, error };
    }
  }

  /**
   * Ensure config.yaml exists with sensible defaults
   */
  private async ensureConfig(): Promise<void> {
    try {
      await fs.access(this.config.configPath);
    } catch {
      // Create default config
      const defaultConfig = `# CLIProxyAPIPlus Configuration
# Generated by Kuroryuu Desktop
# See: https://github.com/router-for-me/CLIProxyAPIPlus

# Server port
port: ${this.config.port}

# Auth token
auth_token: "kuroryuu-local"

# OAuth callback ports
gemini_callback_port: 8085
claude_callback_port: 54545
openai_callback_port: 1455
copilot_callback_port: 54546
kiro_callback_port: 54547
`;
      await fs.writeFile(this.config.configPath, defaultConfig, 'utf-8');
    }
  }

  /**
   * Check if the binary is provisioned
   */
  async isProvisioned(): Promise<boolean> {
    try {
      await fs.access(this.config.binaryPath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Start the CLIProxyAPI binary as a child process
   */
  async start(): Promise<{ success: boolean; pid?: number; error?: string }> {
    // Check if already running
    if (this.process && this.pid) {
      const running = await this.isProcessRunning(this.pid);
      if (running) {
        return { success: true, pid: this.pid };
      }
    }

    // Check if API is already responding (maybe started externally)
    if (await this.checkHealth()) {
      return { success: true, pid: undefined };
    }

    try {
      // Ensure binary exists
      const provisioned = await this.isProvisioned();
      if (!provisioned) {
        return { success: false, error: 'Binary not provisioned. Call provision() first.' };
      }

      // Ensure config exists
      await this.ensureConfig();

      // Start the process
      console.log(`[CLIProxyNative] Starting: ${this.config.binaryPath}`);
      this.process = spawn(
        this.config.binaryPath,
        ['-config', this.config.configPath],
        {
          cwd: this.config.dataDir,
          detached: false,
          stdio: ['ignore', 'pipe', 'pipe'],
        }
      );

      this.pid = this.process.pid || null;

      // Save PID to file for recovery
      if (this.pid) {
        await fs.writeFile(
          path.join(this.config.dataDir, 'cliproxy.pid'),
          String(this.pid)
        );
      }

      // Handle process events
      this.process.on('error', (err) => {
        console.error(`[CLIProxyNative] Process error:`, err);
      });

      this.process.on('exit', (code, signal) => {
        console.log(`[CLIProxyNative] Process exited: code=${code}, signal=${signal}`);
        this.process = null;
        this.pid = null;
        // Clean up PID file
        fs.unlink(path.join(this.config.dataDir, 'cliproxy.pid')).catch(() => {});
      });

      // Log stdout/stderr
      this.process.stdout?.on('data', (data: Buffer) => {
        console.log(`[CLIProxyNative] stdout: ${data.toString().trim()}`);
      });

      this.process.stderr?.on('data', (data: Buffer) => {
        console.log(`[CLIProxyNative] stderr: ${data.toString().trim()}`);
      });

      // Wait for startup
      await this.waitForStartup();

      return { success: true, pid: this.pid || undefined };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      console.error(`[CLIProxyNative] Start failed:`, error);
      return { success: false, error };
    }
  }

  /**
   * Wait for the API to be ready
   */
  private async waitForStartup(timeoutMs = 10000): Promise<void> {
    const startTime = Date.now();
    while (Date.now() - startTime < timeoutMs) {
      if (await this.checkHealth()) {
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
    throw new Error('Timeout waiting for CLIProxyAPI to start');
  }

  /**
   * Check if the API is responding
   */
  async checkHealth(): Promise<boolean> {
    try {
      const response = await fetch(`http://127.0.0.1:${this.config.port}/v1/models`, {
        headers: { 'Authorization': 'Bearer kuroryuu-local' },
        signal: AbortSignal.timeout(2000),
      });
      return response.ok;
    } catch {
      return false;
    }
  }

  /**
   * Check if a process with given PID is running
   */
  private async isProcessRunning(pid: number): Promise<boolean> {
    try {
      process.kill(pid, 0);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Stop the CLIProxyAPI process gracefully
   */
  async stop(): Promise<{ success: boolean; error?: string }> {
    try {
      // Try to stop our managed process
      if (this.process) {
        this.process.kill('SIGTERM');

        // Wait for graceful shutdown (up to 5s)
        const startTime = Date.now();
        while (this.process && Date.now() - startTime < 5000) {
          await new Promise((resolve) => setTimeout(resolve, 200));
        }

        // Force kill if still running
        if (this.process) {
          this.process.kill('SIGKILL');
        }

        this.process = null;
        this.pid = null;
      }

      // Also try to kill by PID file
      try {
        const pidFile = path.join(this.config.dataDir, 'cliproxy.pid');
        const savedPid = parseInt(await fs.readFile(pidFile, 'utf-8'), 10);
        if (savedPid && await this.isProcessRunning(savedPid)) {
          process.kill(savedPid, 'SIGTERM');
          await new Promise((resolve) => setTimeout(resolve, 1000));
          if (await this.isProcessRunning(savedPid)) {
            process.kill(savedPid, 'SIGKILL');
          }
        }
        await fs.unlink(pidFile).catch(() => {});
      } catch {
        // PID file doesn't exist or process already dead
      }

      return { success: true };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);
      return { success: false, error };
    }
  }

  /**
   * Get the current status of the native process
   */
  async status(): Promise<{
    running: boolean;
    pid?: number;
    version?: string;
    provisioned: boolean;
    healthy: boolean;
  }> {
    const provisioned = await this.isProvisioned();
    const healthy = await this.checkHealth();
    const version = provisioned ? await this.getBinaryVersion() : null;

    // Check our managed process
    if (this.pid && await this.isProcessRunning(this.pid)) {
      return {
        running: true,
        pid: this.pid,
        version: version || undefined,
        provisioned,
        healthy,
      };
    }

    // Check PID file for externally started process
    try {
      const pidFile = path.join(this.config.dataDir, 'cliproxy.pid');
      const savedPid = parseInt(await fs.readFile(pidFile, 'utf-8'), 10);
      if (savedPid && await this.isProcessRunning(savedPid)) {
        return {
          running: true,
          pid: savedPid,
          version: version || undefined,
          provisioned,
          healthy,
        };
      }
    } catch {
      // No PID file
    }

    // API might be running but we don't have the PID (started externally)
    if (healthy) {
      return {
        running: true,
        version: version || undefined,
        provisioned,
        healthy,
      };
    }

    return {
      running: false,
      version: version || undefined,
      provisioned,
      healthy: false,
    };
  }

  /**
   * Start OAuth flow for a provider
   *
   * Supported providers:
   * - gemini: Google OAuth for Gemini CLI
   * - antigravity: Google OAuth for Antigravity (Claude/Gemini models)
   * - claude: Anthropic OAuth for Claude Code CLI
   * - codex: OpenAI OAuth for ChatGPT Codex
   * - copilot: GitHub device flow for GitHub Copilot
   * - kiro: AWS Builder ID OAuth for Kiro/CodeWhisperer
   */
  async startOAuth(provider: 'gemini' | 'antigravity' | 'claude' | 'codex' | 'copilot' | 'kiro'): Promise<{
    url?: string;
    error?: string;
    authenticated?: boolean;
    waiting?: boolean;
  }> {
    const flags: Record<string, string> = {
      gemini: '-login',
      antigravity: '-antigravity-login', // Uses port 51121 for callback
      claude: '-claude-login',
      codex: '-codex-login',
      copilot: '-github-copilot-login',
      kiro: '-kiro-aws-authcode', // AWS Builder ID provides better UX than Google OAuth
    };

    const flag = flags[provider];
    if (!flag) {
      return { error: `Unknown provider: ${provider}` };
    }

    try {
      // Run OAuth command
      const { stdout, stderr } = await execAsync(
        `"${this.config.binaryPath}" ${flag} -no-browser -config "${this.config.configPath}"`,
        { timeout: 15000, cwd: this.config.dataDir }
      );

      const output = stdout + stderr;

      // Parse URL from output
      const urlMatch = output.match(/https:\/\/[^\s\n]+/);
      if (urlMatch) {
        return { url: urlMatch[0] };
      }

      // Check if already authenticated
      if (output.includes('already authenticated') || output.includes('token valid')) {
        return { authenticated: true };
      }

      return { error: 'Could not parse OAuth URL from output' };
    } catch (e) {
      const error = e instanceof Error ? e.message : String(e);

      // OAuth commands may "timeout" while waiting for callback
      if (error.includes('timeout') || error.includes('ETIMEDOUT')) {
        return { waiting: true };
      }

      return { error };
    }
  }

  /**
   * Get the config (for external use)
   */
  getConfig(): NativeManagerConfig {
    return { ...this.config };
  }

  /**
   * Update configuration
   */
  updateConfig(partial: Partial<NativeManagerConfig>): void {
    this.config = { ...this.config, ...partial };
  }
}

// Singleton instance
let nativeManagerInstance: CLIProxyNativeManager | null = null;

export function getCLIProxyNativeManager(): CLIProxyNativeManager {
  if (!nativeManagerInstance) {
    nativeManagerInstance = new CLIProxyNativeManager();
  }
  return nativeManagerInstance;
}
