/**
 * CLI Proxy Setup Wizard
 * Multi-step wizard for Docker + Native + OAuth setup
 *
 * Supports CLIProxyAPIPlus providers:
 * - Gemini (Google)
 * - Claude (Anthropic)
 * - OpenAI/Codex
 * - GitHub Copilot (new)
 * - Kiro/CodeWhisperer (new)
 */

import { useState, useEffect, useCallback } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  ChevronRight,
  ChevronLeft,
  Container,
  Key,
  Zap,
  SkipForward,
  Download,
  Box,
} from 'lucide-react';
import { ThemedFrame } from '../ui/ThemedFrame';
import { useIsThemedStyle } from '../../hooks/useTheme';

type WizardMode = 'docker' | 'native';
type WizardStep = 'mode' | 'docker' | 'container' | 'provision' | 'gemini' | 'antigravity' | 'claude' | 'openai' | 'copilot' | 'kiro' | 'verify';

const DOCKER_STEPS: { id: WizardStep; label: string; optional?: boolean }[] = [
  { id: 'mode', label: 'Mode' },
  { id: 'docker', label: 'Docker' },
  { id: 'container', label: 'Container' },
  { id: 'gemini', label: 'Gemini', optional: true },
  { id: 'antigravity', label: 'Antigravity', optional: true },
  { id: 'claude', label: 'Claude', optional: true },
  { id: 'openai', label: 'OpenAI', optional: true },
  { id: 'copilot', label: 'Copilot', optional: true },
  { id: 'kiro', label: 'Kiro', optional: true },
  { id: 'verify', label: 'Verify' },
];

const NATIVE_STEPS: { id: WizardStep; label: string; optional?: boolean }[] = [
  { id: 'mode', label: 'Mode' },
  { id: 'provision', label: 'Install' },
  { id: 'gemini', label: 'Gemini', optional: true },
  { id: 'antigravity', label: 'Antigravity', optional: true },
  { id: 'claude', label: 'Claude', optional: true },
  { id: 'openai', label: 'OpenAI', optional: true },
  { id: 'copilot', label: 'Copilot', optional: true },
  { id: 'kiro', label: 'Kiro', optional: true },
  { id: 'verify', label: 'Verify' },
];

interface CLIProxyWizardProps {
  onClose: () => void;
}

interface DockerStatus {
  installed: boolean;
  running: boolean;
  checking: boolean;
  error?: string;
}

interface ContainerStatus {
  exists: boolean;
  running: boolean;
  starting: boolean;
  error?: string;
}

interface OAuthStatus {
  authenticated: boolean;
  modelCount: number;
  authenticating: boolean;
  authUrl?: string;
  error?: string;
}

interface NativeStatus {
  provisioned: boolean;
  provisioning: boolean;
  running: boolean;
  starting: boolean;
  version?: string;
  error?: string;
}

export function CLIProxyWizard({ onClose }: CLIProxyWizardProps) {
  const { isKuroryuu, isGrunge } = useIsThemedStyle();
  const [mode, setMode] = useState<WizardMode | null>(null);
  const [currentStep, setCurrentStep] = useState<WizardStep>('mode');

  // Docker status
  const [docker, setDocker] = useState<DockerStatus>({
    installed: false,
    running: false,
    checking: true,
  });

  // Container status
  const [container, setContainer] = useState<ContainerStatus>({
    exists: false,
    running: false,
    starting: false,
  });

  // OAuth statuses
  const [gemini, setGemini] = useState<OAuthStatus>({ authenticated: false, modelCount: 0, authenticating: false });
  const [antigravity, setAntigravity] = useState<OAuthStatus>({ authenticated: false, modelCount: 0, authenticating: false });
  const [claude, setClaude] = useState<OAuthStatus>({ authenticated: false, modelCount: 0, authenticating: false });
  const [openai, setOpenai] = useState<OAuthStatus>({ authenticated: false, modelCount: 0, authenticating: false });
  const [copilot, setCopilot] = useState<OAuthStatus>({ authenticated: false, modelCount: 0, authenticating: false });
  const [kiro, setKiro] = useState<OAuthStatus>({ authenticated: false, modelCount: 0, authenticating: false });

  // Native mode status
  const [native, setNative] = useState<NativeStatus>({
    provisioned: false,
    provisioning: false,
    running: false,
    starting: false,
  });

  // Verification
  const [totalModels, setTotalModels] = useState(0);

  // Get current steps based on mode
  const STEPS = mode === 'native' ? NATIVE_STEPS : DOCKER_STEPS;

  // Check Docker on mount (only if mode not selected yet)
  useEffect(() => {
    if (mode === 'docker') {
      checkDocker();
    }
  }, [mode]);

  // Check native status when mode is native
  useEffect(() => {
    if (mode === 'native') {
      checkNativeStatus();
    }
  }, [mode]);

  const checkDocker = async () => {
    setDocker(prev => ({ ...prev, checking: true, error: undefined }));

    // FIRST: Check if CLI Proxy API is already responding
    // If it is, Docker is obviously working - skip IPC check
    try {
      const response = await fetch('http://127.0.0.1:8317/v1/models', {
        headers: { 'Authorization': 'Bearer kuroryuu-local-key' },
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        // API is responding - Docker is working, container is running
        setDocker({
          installed: true,
          running: true,
          checking: false,
        });
        // Also set container as running since API responded
        setContainer({ exists: true, running: true, starting: false });
        return;
      }
    } catch {
      // API not responding - fall through to IPC check
    }

    // SECOND: Try IPC Docker check if API didn't respond
    try {
      if (window.electronAPI?.cliproxy?.docker?.check) {
        const result = await window.electronAPI.cliproxy.docker.check();
        setDocker({
          installed: result.installed,
          running: result.running,
          checking: false,
          error: result.error,
        });
      } else {
        // No IPC and no API response
        setDocker({
          installed: false,
          running: false,
          checking: false,
          error: 'Could not detect Docker. Please ensure Docker Desktop is installed and running.',
        });
      }
    } catch {
      setDocker({
        installed: false,
        running: false,
        checking: false,
        error: 'Could not detect Docker. Please ensure Docker Desktop is installed and running.',
      });
    }
  };

  const checkContainer = async () => {
    try {
      const response = await fetch('http://127.0.0.1:8317/v1/models', {
        headers: { 'Authorization': 'Bearer kuroryuu-local-key' },
        signal: AbortSignal.timeout(3000),
      });
      if (response.ok) {
        setContainer({ exists: true, running: true, starting: false });
        return true;
      }
    } catch {
      // Container not responding
    }
    setContainer({ exists: false, running: false, starting: false });
    return false;
  };

  const startContainer = async () => {
    setContainer(prev => ({ ...prev, starting: true, error: undefined }));
    try {
      if (window.electronAPI?.cliproxy?.container?.start) {
        const containerPath = 'E:\\SAS\\OTHER_REPOS_CASE_STUDIES\\REPOS\\CLIProxyAPI-main';
        const result = await window.electronAPI.cliproxy.container.start(containerPath);
        if (result.success) {
          // Wait for container to be ready
          await new Promise(resolve => setTimeout(resolve, 3000));
          const isRunning = await checkContainer();
          if (!isRunning) {
            setContainer(prev => ({
              ...prev,
              starting: false,
              error: 'Container started but not responding. Check Docker logs.',
            }));
          }
        } else {
          setContainer(prev => ({ ...prev, starting: false, error: result.error }));
        }
      } else {
        setContainer(prev => ({
          ...prev,
          starting: false,
          error: 'IPC not available. Please start container manually via Docker Desktop.',
        }));
      }
    } catch (e) {
      setContainer(prev => ({ ...prev, starting: false, error: String(e) }));
    }
  };

  const checkOAuthStatus = useCallback(async () => {
    try {
      const response = await fetch('http://127.0.0.1:8317/v1/models', {
        headers: { 'Authorization': 'Bearer kuroryuu-local-key' },
        signal: AbortSignal.timeout(5000),
      });

      if (response.ok) {
        const data = await response.json();
        const models: { id: string; owned_by?: string }[] = data.data || [];

        // Detect by owned_by field (most reliable)
        const geminiCount = models.filter(m => m.owned_by === 'google').length;
        const antigravityCount = models.filter(m => m.owned_by === 'antigravity').length;
        const claudeCount = models.filter(m => m.owned_by === 'anthropic').length;
        const openaiCount = models.filter(m => m.owned_by === 'openai').length;
        const copilotCount = models.filter(m => m.owned_by === 'github-copilot').length;
        const kiroCount = models.filter(m => m.owned_by === 'aws').length;

        setGemini(prev => ({ ...prev, authenticated: geminiCount > 0, modelCount: geminiCount }));
        setAntigravity(prev => ({ ...prev, authenticated: antigravityCount > 0, modelCount: antigravityCount }));
        setClaude(prev => ({ ...prev, authenticated: claudeCount > 0, modelCount: claudeCount }));
        setOpenai(prev => ({ ...prev, authenticated: openaiCount > 0, modelCount: openaiCount }));
        setCopilot(prev => ({ ...prev, authenticated: copilotCount > 0, modelCount: copilotCount }));
        setKiro(prev => ({ ...prev, authenticated: kiroCount > 0, modelCount: kiroCount }));
        setTotalModels(models.length);
      }
    } catch {
      // API not available
    }
  }, []);

  // Poll OAuth status when on OAuth steps
  useEffect(() => {
    if (['gemini', 'antigravity', 'claude', 'openai', 'copilot', 'kiro', 'verify'].includes(currentStep)) {
      checkOAuthStatus();
      const interval = setInterval(checkOAuthStatus, 3000);
      return () => clearInterval(interval);
    }
  }, [currentStep, checkOAuthStatus]);

  const startOAuth = async (provider: 'gemini' | 'antigravity' | 'claude' | 'codex' | 'copilot' | 'kiro') => {
    const setterMap: Record<string, React.Dispatch<React.SetStateAction<OAuthStatus>>> = {
      gemini: setGemini,
      antigravity: setAntigravity,
      claude: setClaude,
      codex: setOpenai,
      copilot: setCopilot,
      kiro: setKiro,
    };
    const setter = setterMap[provider];
    setter(prev => ({ ...prev, authenticating: true, error: undefined, authUrl: undefined }));

    // Native mode command flags for manual fallback
    const nativeCommands: Record<string, string> = {
      gemini: '-login',
      antigravity: '-antigravity-login',
      claude: '-claude-login',
      codex: '-codex-login',
      copilot: '-github-copilot-login',
      kiro: '-kiro-aws-authcode',
    };

    try {
      // Try native OAuth via IPC
      if (mode === 'native') {
        try {
          if (window.electronAPI?.cliproxy?.native?.oauth) {
            const result = await window.electronAPI.cliproxy.native.oauth(provider);
            if (result.url) {
              setter(prev => ({ ...prev, authUrl: result.url }));
              window.open(result.url, '_blank');
              return;
            } else if (result.error && !result.error.includes('No handler')) {
              setter(prev => ({ ...prev, authenticating: false, error: result.error }));
              return;
            }
          }
        } catch {
          // IPC failed - fall through to manual instructions
        }

        // Fallback: Show manual command for native mode
        const cmd = nativeCommands[provider];
        setter(prev => ({
          ...prev,
          authenticating: false,
          error: `Run in terminal: cd $KURORYUU_PROJECT_ROOT\\.cliproxyapi && CLIProxyAPIPlus.exe ${cmd}`,
        }));
        return;
      }

      // Docker mode OAuth
      if (window.electronAPI?.cliproxy?.oauth?.start) {
        const result = await window.electronAPI.cliproxy.oauth.start(provider);
        if (result.url) {
          setter(prev => ({ ...prev, authUrl: result.url }));
          window.open(result.url, '_blank');
        } else if (result.error) {
          setter(prev => ({ ...prev, authenticating: false, error: result.error }));
        }
      } else {
        // Fallback: provide manual instructions (Docker mode)
        const cmd = nativeCommands[provider];
        setter(prev => ({
          ...prev,
          authenticating: false,
          error: `Run: docker exec cli-proxy-api /CLIProxyAPIPlus/CLIProxyAPIPlus ${cmd} -no-browser`,
        }));
      }
    } catch (e) {
      const errorMsg = String(e);
      // If IPC failed, show manual command
      if (errorMsg.includes('No handler') || errorMsg.includes('handler')) {
        const cmd = nativeCommands[provider];
        setter(prev => ({
          ...prev,
          authenticating: false,
          error: `Run in terminal: cd $KURORYUU_PROJECT_ROOT\\.cliproxyapi && CLIProxyAPIPlus.exe ${cmd}`,
        }));
      } else {
        setter(prev => ({ ...prev, authenticating: false, error: errorMsg }));
      }
    }
  };

  // ─────────────────────────────────────────────────────────────────────────────
  // Native Mode Functions
  // ─────────────────────────────────────────────────────────────────────────────

  const checkNativeStatus = async () => {
    // FIRST: Check if API is already responding (most reliable check)
    // This avoids race conditions with IPC handlers during hot reload
    try {
      const response = await fetch('http://127.0.0.1:8317/v1/models', {
        headers: { 'Authorization': 'Bearer kuroryuu-local-key' },
        signal: AbortSignal.timeout(2000),
      });
      if (response.ok) {
        // API is running - mark as healthy regardless of IPC state
        setNative(prev => ({
          ...prev,
          provisioned: true,
          running: true,
          error: undefined,
        }));
        setContainer({ exists: true, running: true, starting: false });

        // Try to get additional info via IPC (version), but don't fail if unavailable
        try {
          if (window.electronAPI?.cliproxy?.native?.status) {
            const result = await window.electronAPI.cliproxy.native.status();
            if (result.version) {
              setNative(prev => ({ ...prev, version: result.version }));
            }
          }
        } catch {
          // IPC failed but API is working - that's fine
        }
        return;
      }
    } catch {
      // API not responding - fall through to IPC check
    }

    // SECOND: Try IPC if API didn't respond
    try {
      if (window.electronAPI?.cliproxy?.native?.status) {
        const result = await window.electronAPI.cliproxy.native.status();
        setNative(prev => ({
          ...prev,
          provisioned: result.provisioned,
          running: result.running || result.healthy,
          version: result.version,
          error: result.error,
        }));
        if (result.healthy) {
          setContainer({ exists: true, running: true, starting: false });
        }
      } else {
        // IPC not available and API not responding - check if binary exists
        setNative(prev => ({
          ...prev,
          provisioned: false,
          running: false,
          error: undefined, // Don't show error, just show "not running" state
        }));
      }
    } catch {
      // Both API and IPC failed - show clean "not running" state
      setNative(prev => ({
        ...prev,
        provisioned: false,
        running: false,
        error: undefined,
      }));
    }
  };

  const provisionNative = async () => {
    setNative(prev => ({ ...prev, provisioning: true, error: undefined }));
    try {
      if (window.electronAPI?.cliproxy?.native?.provision) {
        const result = await window.electronAPI.cliproxy.native.provision();
        if (result.success) {
          setNative(prev => ({
            ...prev,
            provisioning: false,
            provisioned: true,
            version: result.version,
          }));
          // Auto-start after provisioning
          await startNative();
        } else {
          setNative(prev => ({
            ...prev,
            provisioning: false,
            error: result.error || 'Provisioning failed',
          }));
        }
      } else {
        setNative(prev => ({
          ...prev,
          provisioning: false,
          error: 'Native mode API not available',
        }));
      }
    } catch (e) {
      setNative(prev => ({ ...prev, provisioning: false, error: String(e) }));
    }
  };

  const startNative = async () => {
    setNative(prev => ({ ...prev, starting: true, error: undefined }));
    try {
      if (window.electronAPI?.cliproxy?.native?.start) {
        const result = await window.electronAPI.cliproxy.native.start();
        if (result.success) {
          setNative(prev => ({ ...prev, starting: false, running: true }));
          // Also set container as running for OAuth steps
          setContainer({ exists: true, running: true, starting: false });
        } else {
          setNative(prev => ({
            ...prev,
            starting: false,
            error: result.error || 'Failed to start',
          }));
        }
      }
    } catch (e) {
      setNative(prev => ({ ...prev, starting: false, error: String(e) }));
    }
  };

  const currentStepIndex = STEPS.findIndex(s => s.id === currentStep);
  const canGoNext = () => {
    switch (currentStep) {
      case 'mode': return mode !== null;
      case 'docker': return docker.installed && docker.running;
      case 'container': return container.running;
      case 'provision': return native.running;
      default: return true;
    }
  };

  const goNext = () => {
    const nextIndex = currentStepIndex + 1;
    if (nextIndex < STEPS.length) {
      setCurrentStep(STEPS[nextIndex].id);
      if (STEPS[nextIndex].id === 'container') {
        checkContainer();
      }
      if (STEPS[nextIndex].id === 'provision') {
        checkNativeStatus();
      }
    }
  };

  const goBack = () => {
    const prevIndex = currentStepIndex - 1;
    if (prevIndex >= 0) {
      const prevStep = STEPS[prevIndex].id;
      setCurrentStep(prevStep);
      // If going back to mode selection, reset mode
      if (prevStep === 'mode') {
        setMode(null);
      }
    }
  };

  const renderStepContent = () => {
    switch (currentStep) {
      case 'mode':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Choose how to run CLIProxyAPI. Native mode is the recommended method. Docker mode is available but less tested.
            </p>

            <div className="space-y-3">
              <button
                onClick={() => setMode('native')}
                className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
                  mode === 'native'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Box className={`w-6 h-6 ${mode === 'native' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div>
                    <div className="font-medium">Native Mode</div>
                    <div className="text-sm text-muted-foreground">
                      Recommended. No Docker required. Downloads and runs CLIProxyAPI directly.
                    </div>
                  </div>
                  {mode === 'native' && <Check className="w-5 h-5 text-primary ml-auto" />}
                </div>
              </button>

              <button
                onClick={() => setMode('docker')}
                className={`w-full p-4 rounded-lg border-2 text-left transition-colors ${
                  mode === 'docker'
                    ? 'border-primary bg-primary/10'
                    : 'border-border hover:border-primary/50'
                }`}
              >
                <div className="flex items-center gap-3">
                  <Container className={`w-6 h-6 ${mode === 'docker' ? 'text-primary' : 'text-muted-foreground'}`} />
                  <div>
                    <div className="font-medium">Docker Mode</div>
                    <div className="text-sm text-muted-foreground">
                      Requires Docker Desktop. Less tested - use if you prefer containerization.
                    </div>
                  </div>
                  {mode === 'docker' && <Check className="w-5 h-5 text-primary ml-auto" />}
                </div>
              </button>
            </div>

            {/* Advanced Options */}
            <details className="mt-4 text-xs">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
                Advanced Options (TOS Warning)
              </summary>
              <div className="mt-2 max-h-32 overflow-y-auto p-3 bg-yellow-500/10 border border-yellow-500/30 rounded">
                <p className="text-yellow-400 mb-2">
                  Some open-source projects reuse Claude Code CLI credentials directly.
                  This violates Anthropic&apos;s Terms of Service and may result in account action.
                </p>
                <p className="text-muted-foreground mb-2">
                  For technical reference only, see: <code className="text-xs bg-black/30 px-1 rounded">Docs/Guides/Advanced/CLI-Credentials-Reference.md</code>
                </p>
                <p className="text-muted-foreground">
                  Kuroryuu uses legitimate OAuth flows via CLIProxyAPI instead.
                </p>
              </div>
            </details>

            {/* OAuth Flow Explanation */}
            <div className="mt-4 p-3 bg-blue-500/10 border border-blue-500/30 rounded text-xs">
              <p className="text-blue-300 font-medium mb-2">How CLIProxyAPI OAuth works:</p>
              <ul className="list-disc list-inside text-muted-foreground space-y-1">
                <li>Each provider (Claude, Gemini, OpenAI) requires separate OAuth login</li>
                <li>Free tier Claude routes Opus requests → Sonnet (API limitation)</li>
                <li>Gemini/OpenAI provide their free-tier models</li>
                <li>Tokens stored locally in <code className="bg-black/30 px-1 rounded">.cliproxyapi/auth/</code> (project dir) or <code className="bg-black/30 px-1 rounded">%APPDATA%\Kuroryuu\cliproxyapi\</code> (fallback)</li>
              </ul>
              <a
                href="https://github.com/router-for-me/CLIProxyAPIPlus"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-1 mt-2 text-primary hover:underline"
              >
                <ExternalLink className="w-3 h-3" />
                CLIProxyAPIPlus on GitHub
              </a>
            </div>
          </div>
        );

      case 'provision':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Download and install CLIProxyAPI binary from GitHub releases.
            </p>

            {native.running ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <Check className="w-5 h-5 text-green-400" />
                  <span className="text-sm text-green-400">CLIProxyAPI is running on port 8317</span>
                </div>
                {native.version && (
                  <div className="flex items-center gap-2 p-3 bg-secondary rounded-lg">
                    <span className="text-sm text-muted-foreground">Version: {native.version}</span>
                  </div>
                )}
              </div>
            ) : native.provisioning || native.starting ? (
              <div className="flex items-center gap-2 p-4 bg-secondary rounded-lg">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm">
                  {native.provisioning ? 'Downloading and installing...' : 'Starting CLIProxyAPI...'}
                </span>
              </div>
            ) : native.provisioned ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <Check className="w-5 h-5 text-green-400" />
                  <span className="text-sm text-green-400">
                    CLIProxyAPI installed {native.version ? `(v${native.version})` : ''}
                  </span>
                </div>
                {native.error && (
                  <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <span className="text-sm text-red-400">{native.error}</span>
                  </div>
                )}
                <button
                  onClick={startNative}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 text-sm font-medium"
                >
                  <Zap className="w-4 h-4" />
                  Start CLIProxyAPI
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {native.error && (
                  <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <span className="text-sm text-red-400">{native.error}</span>
                  </div>
                )}
                <button
                  onClick={provisionNative}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 text-sm font-medium"
                >
                  <Download className="w-4 h-4" />
                  Download & Install
                </button>
                <p className="text-xs text-muted-foreground">
                  Downloads pre-compiled binary from GitHub releases (~15MB)
                </p>
              </div>
            )}
          </div>
        );

      case 'docker':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              CLI Proxy requires Docker Desktop to run the CLIProxyAPI container.
            </p>

            {docker.checking ? (
              <div className="flex items-center gap-2 p-4 bg-secondary rounded-lg">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm">Checking Docker status...</span>
              </div>
            ) : docker.installed && docker.running ? (
              <div className="space-y-2">
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <Check className="w-5 h-5 text-green-400" />
                  <span className="text-sm text-green-400">Docker Desktop is installed</span>
                </div>
                <div className="flex items-center gap-2 p-3 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <Check className="w-5 h-5 text-green-400" />
                  <span className="text-sm text-green-400">Docker daemon is running</span>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-red-400" />
                  <span className="text-sm text-red-400">
                    {docker.error || 'Docker not detected'}
                  </span>
                </div>
                <a
                  href="https://www.docker.com/products/docker-desktop/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-2 text-sm text-primary hover:underline"
                >
                  <ExternalLink className="w-4 h-4" />
                  Download Docker Desktop
                </a>
                <button
                  onClick={checkDocker}
                  className="flex items-center gap-2 px-4 py-2 bg-secondary hover:bg-secondary/80 rounded-lg text-sm"
                >
                  <Loader2 className="w-4 h-4" />
                  Re-check Docker
                </button>
              </div>
            )}
          </div>
        );

      case 'container':
        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Start the CLIProxyAPI container to enable multi-provider model access.
            </p>

            {container.running ? (
              <div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <Check className="w-5 h-5 text-green-400" />
                <span className="text-sm text-green-400">Container is running on port 8317</span>
              </div>
            ) : container.starting ? (
              <div className="flex items-center gap-2 p-4 bg-secondary rounded-lg">
                <Loader2 className="w-5 h-5 animate-spin text-primary" />
                <span className="text-sm">Starting container...</span>
              </div>
            ) : (
              <div className="space-y-3">
                {container.error && (
                  <div className="flex items-center gap-2 p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <AlertCircle className="w-5 h-5 text-red-400" />
                    <span className="text-sm text-red-400">{container.error}</span>
                  </div>
                )}
                <button
                  onClick={startContainer}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 text-sm font-medium"
                >
                  <Container className="w-4 h-4" />
                  Start Container
                </button>
                <p className="text-xs text-muted-foreground">
                  Or run manually: <code className="bg-secondary px-1 rounded">docker compose up -d</code> in CLIProxyAPI directory
                </p>
              </div>
            )}
          </div>
        );

      case 'gemini':
      case 'antigravity':
      case 'claude':
      case 'openai':
      case 'copilot':
      case 'kiro':
        const oauthConfig = {
          gemini: { status: gemini, setter: setGemini, provider: 'gemini' as const, label: 'Google/Gemini', port: 8085, note: 'Gemini 2.5/3 models via Google account' },
          antigravity: { status: antigravity, setter: setAntigravity, provider: 'antigravity' as const, label: 'Antigravity', port: 8086, note: 'Claude/Gemini models via Antigravity (uses Gemini auth)' },
          claude: { status: claude, setter: setClaude, provider: 'claude' as const, label: 'Anthropic/Claude', port: 54545, note: 'Free tier routes Opus → Sonnet (API limitation)' },
          openai: { status: openai, setter: setOpenai, provider: 'codex' as const, label: 'OpenAI', port: 1455, note: 'GPT-5/Codex models via OpenAI account' },
          copilot: { status: copilot, setter: setCopilot, provider: 'copilot' as const, label: 'GitHub Copilot', port: 54546, note: 'Requires active Copilot subscription' },
          kiro: { status: kiro, setter: setKiro, provider: 'kiro' as const, label: 'Kiro/CodeWhisperer', port: 54547, note: 'AWS Builder ID required' },
        }[currentStep];

        return (
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Authenticate with {oauthConfig.label} to access their models.
              This step is optional - skip if you don&apos;t need {currentStep.charAt(0).toUpperCase() + currentStep.slice(1)} models.
            </p>
            {oauthConfig.note && (
              <div className="p-2 bg-blue-500/10 border border-blue-500/20 rounded text-xs text-blue-300">
                ℹ️ {oauthConfig.note}
              </div>
            )}

            {oauthConfig.status.authenticated ? (
              <div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                <Check className="w-5 h-5 text-green-400" />
                <span className="text-sm text-green-400">
                  Authenticated - {oauthConfig.status.modelCount} models available
                </span>
              </div>
            ) : oauthConfig.status.authenticating ? (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-4 bg-secondary rounded-lg">
                  <Loader2 className="w-5 h-5 animate-spin text-primary" />
                  <span className="text-sm">Waiting for authentication callback...</span>
                </div>
                {oauthConfig.status.authUrl && (
                  <a
                    href={oauthConfig.status.authUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-2 text-sm text-primary hover:underline"
                  >
                    <ExternalLink className="w-4 h-4" />
                    Click here if browser didn't open
                  </a>
                )}
                <p className="text-xs text-muted-foreground">
                  Callback port: {oauthConfig.port}
                </p>
              </div>
            ) : (
              <div className="space-y-3">
                {oauthConfig.status.error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg">
                    <p className="text-sm text-red-400">{oauthConfig.status.error}</p>
                  </div>
                )}
                <button
                  onClick={() => startOAuth(oauthConfig.provider)}
                  className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 text-sm font-medium"
                >
                  <Key className="w-4 h-4" />
                  Authenticate with {oauthConfig.label}
                </button>
              </div>
            )}
          </div>
        );

      case 'verify':
        return (
          <div className="space-y-4">
            {totalModels > 0 ? (
              <>
                <div className="flex items-center gap-2 p-4 bg-green-500/10 border border-green-500/20 rounded-lg">
                  <Check className="w-5 h-5 text-green-400" />
                  <span className="text-sm text-green-400">
                    Setup complete! {totalModels} models available
                  </span>
                </div>

                <div className="grid gap-2">
                  {gemini.modelCount > 0 && (
                    <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                      <span className="text-sm">Gemini</span>
                      <span className="text-sm text-muted-foreground">{gemini.modelCount} models</span>
                    </div>
                  )}
                  {antigravity.modelCount > 0 && (
                    <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                      <span className="text-sm">Antigravity</span>
                      <span className="text-sm text-muted-foreground">{antigravity.modelCount} models</span>
                    </div>
                  )}
                  {claude.modelCount > 0 && (
                    <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                      <span className="text-sm">Claude</span>
                      <span className="text-sm text-muted-foreground">{claude.modelCount} models</span>
                    </div>
                  )}
                  {openai.modelCount > 0 && (
                    <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                      <span className="text-sm">OpenAI</span>
                      <span className="text-sm text-muted-foreground">{openai.modelCount} models</span>
                    </div>
                  )}
                  {copilot.modelCount > 0 && (
                    <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                      <span className="text-sm">GitHub Copilot</span>
                      <span className="text-sm text-muted-foreground">{copilot.modelCount} models</span>
                    </div>
                  )}
                  {kiro.modelCount > 0 && (
                    <div className="flex items-center justify-between p-3 bg-secondary rounded-lg">
                      <span className="text-sm">Kiro/CodeWhisperer</span>
                      <span className="text-sm text-muted-foreground">{kiro.modelCount} models</span>
                    </div>
                  )}
                </div>

                <p className="text-sm text-muted-foreground">
                  Go to Domain Configuration and select "CLI Proxy" as your provider to use these models.
                </p>
              </>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-lg">
                  <AlertCircle className="w-5 h-5 text-yellow-400" />
                  <span className="text-sm text-yellow-400">
                    No models detected. Complete OAuth for at least one provider.
                  </span>
                </div>
                <button
                  onClick={() => setCurrentStep('gemini')}
                  className="text-sm text-primary hover:underline"
                >
                  Go back to OAuth steps
                </button>
              </div>
            )}
          </div>
        );
    }
  };

  return (
    <Dialog.Root open onOpenChange={(open) => !open && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 animate-in fade-in" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[950px] max-h-[85vh] z-50 animate-in fade-in-0 zoom-in-95 slide-in-from-left-1/2 slide-in-from-top-[48%] duration-200 focus:outline-none">
          <ThemedFrame size="md" variant={isKuroryuu ? 'dragon' : isGrunge ? 'grunge-square' : undefined}>
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border">
              <div>
                <Dialog.Title className="text-lg font-semibold text-foreground">
                  CLI Proxy Setup
                </Dialog.Title>
                <Dialog.Description className="text-xs text-muted-foreground mt-0.5">
                  Step {currentStepIndex + 1} of {STEPS.length}: {STEPS[currentStepIndex].label}
                </Dialog.Description>
              </div>
              <Dialog.Close asChild>
                <button className="p-1.5 rounded-lg hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors">
                  <X className="w-5 h-5" />
                </button>
              </Dialog.Close>
            </div>

            {/* Progress indicator */}
            <div className="flex items-center justify-center gap-2 p-4 border-b border-border">
              {STEPS.map((step, idx) => (
                <div key={step.id} className="flex items-center">
                  <div
                    className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-medium transition-colors ${
                      idx < currentStepIndex
                        ? 'bg-green-500 text-white'
                        : idx === currentStepIndex
                        ? 'bg-primary text-black'
                        : 'bg-secondary text-muted-foreground'
                    }`}
                  >
                    {idx < currentStepIndex ? <Check className="w-4 h-4" /> : idx + 1}
                  </div>
                  {idx < STEPS.length - 1 && (
                    <div
                      className={`w-8 h-0.5 mx-1 ${
                        idx < currentStepIndex ? 'bg-green-500' : 'bg-secondary'
                      }`}
                    />
                  )}
                </div>
              ))}
            </div>

            {/* Content */}
            <div className="p-6 min-h-[200px] max-h-[50vh] overflow-y-auto">{renderStepContent()}</div>

            {/* Footer */}
            <div className="flex items-center justify-between p-4 border-t border-border">
              <button
                onClick={goBack}
                disabled={currentStepIndex === 0}
                className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <ChevronLeft className="w-4 h-4" />
                Back
              </button>

              <div className="flex items-center gap-2">
                {STEPS[currentStepIndex].optional && !canGoNext() && (
                  <button
                    onClick={goNext}
                    className="flex items-center gap-2 px-4 py-2 text-sm text-muted-foreground hover:text-foreground"
                  >
                    <SkipForward className="w-4 h-4" />
                    Skip
                  </button>
                )}

                {currentStep === 'verify' ? (
                  <button
                    onClick={onClose}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 text-sm font-medium"
                  >
                    <Check className="w-4 h-4" />
                    Done
                  </button>
                ) : (
                  <button
                    onClick={goNext}
                    disabled={!canGoNext() && !STEPS[currentStepIndex].optional}
                    className="flex items-center gap-2 px-4 py-2 bg-primary text-black rounded-lg hover:bg-primary/80 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    Continue
                    <ChevronRight className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
