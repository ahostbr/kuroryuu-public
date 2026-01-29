/**
 * Integrations Settings Dialog
 * LLM provider API keys (Anthropic, OpenAI) and SCM OAuth (GitHub, GitLab, Bitbucket)
 */

import { useState, useEffect } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Key,
  Check,
  AlertCircle,
  Loader2,
  ExternalLink,
  Unlink,
  Eye,
  EyeOff,
  Brain,
  Trash2,
  Bot,
  Play,
  Square,
} from 'lucide-react';
import { useSettingsStore } from '../../stores/settings-store';
import { CLIBootstrapInstall } from '../CLIBootstrapInstall';
import { CLIProxySection } from './CLIProxySection';
import { ClawdbotProvidersConfig } from './ClawdbotProvidersConfig';
import { FullDesktopSection } from './FullDesktopSection';
import { useSettings, type GraphitiSettings } from '../../hooks/useSettings';
import { toast } from '../ui/toast';
import { ThemedFrame } from '../ui/ThemedFrame';
import { useIsThemedStyle } from '../../hooks/useTheme';

type ProviderStatus = {
  connected: boolean;
  provider: string;
  authType: 'oauth' | 'apikey' | 'none';
  expiresAt?: number;
  scope?: string;
};

type VerifyResult = { valid: boolean; error?: string };

function ApiKeyInput({
  provider,
  label,
  docsUrl,
  isConnected,
  onSetKey,
  onDisconnect,
  verifyKey,
}: {
  provider: string;
  label: string;
  docsUrl: string;
  isConnected: boolean;
  onSetKey: (key: string) => Promise<void>;
  onDisconnect: () => Promise<void>;
  verifyKey: (key: string) => Promise<VerifyResult>;
}) {
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleVerifyAndSave = async () => {
    if (!apiKey.trim()) return;
    
    setIsVerifying(true);
    setError(null);
    setSuccess(false);
    
    try {
      const result = await verifyKey(apiKey.trim());
      if (result.valid) {
        await onSetKey(apiKey.trim());
        setSuccess(true);
        setApiKey('');
        setTimeout(() => setSuccess(false), 2000);
      } else {
        setError(result.error || 'Invalid API key');
      }
    } catch (e) {
      setError(String(e));
    } finally {
      setIsVerifying(false);
    }
  };

  const handleDisconnect = async () => {
    await onDisconnect();
  };

  return (
    <div className="py-3 border-b border-border/50 last:border-b-0">
      <div className="flex items-center gap-2 mb-2">
        <div className="p-1.5 bg-secondary rounded">
          <Key className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-medium text-foreground">{label}</h3>
            {isConnected && (
              <span className="text-xs text-green-400 flex items-center gap-1">
                <Check className="w-3 h-3" />
              </span>
            )}
          </div>
        </div>
        <a
          href={docsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-1 text-[10px] text-muted-foreground hover:text-foreground shrink-0"
        >
          Get Key <ExternalLink className="w-2.5 h-2.5" />
        </a>
      </div>

      {isConnected ? (
        <button
          onClick={handleDisconnect}
          className="flex items-center gap-1.5 px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
        >
          <Unlink className="w-3 h-3" />
          Disconnect
        </button>
      ) : (
        <div className="space-y-1.5">
          <div className="flex gap-1.5">
            <div className="relative flex-1">
              <input
                type={showKey ? 'text' : 'password'}
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API key..."
                className="w-full px-2.5 py-1.5 pr-8 bg-secondary border border-border rounded text-xs text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setShowKey(!showKey)}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 p-0.5 text-muted-foreground hover:text-foreground"
              >
                {showKey ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
              </button>
            </div>
            <button
              onClick={handleVerifyAndSave}
              disabled={!apiKey.trim() || isVerifying}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-black rounded hover:bg-primary/80 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed shrink-0"
            >
              {isVerifying ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              ) : success ? (
                <Check className="w-3.5 h-3.5" />
              ) : (
                'Connect'
              )}
            </button>
          </div>
          {error && (
            <p className="flex items-center gap-1 text-[10px] text-red-400">
              <AlertCircle className="w-2.5 h-2.5" /> {error}
            </p>
          )}
        </div>
      )}
    </div>
  );
}

function OAuthProvider({
  provider,
  label,
  description,
  icon: Icon,
  isConnected,
  onConnect,
  onDisconnect,
  userInfo,
}: {
  provider: string;
  label: string;
  description: string;
  icon: React.ElementType;
  isConnected: boolean;
  onConnect: () => Promise<void>;
  onDisconnect: () => Promise<void>;
  userInfo?: { name: string; avatar?: string } | null;
}) {
  const [isConnecting, setIsConnecting] = useState(false);

  const handleConnect = async () => {
    setIsConnecting(true);
    try {
      await onConnect();
    } finally {
      setIsConnecting(false);
    }
  };

  return (
    <div className="py-3 border-b border-border/50 last:border-b-0">
      <div className="flex items-center gap-2">
        <div className="p-1.5 bg-secondary rounded">
          <Icon className="w-3.5 h-3.5 text-primary" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-medium text-foreground">{label}</h3>
          <p className="text-[10px] text-muted-foreground truncate">{description}</p>
        </div>

        {isConnected && userInfo ? (
          <div className="flex items-center gap-2 shrink-0">
            {userInfo.avatar && (
              <img
                src={userInfo.avatar}
                alt={userInfo.name}
                className="w-5 h-5 rounded-full"
              />
            )}
            <button
              onClick={onDisconnect}
              className="flex items-center gap-1 px-2 py-1 text-xs text-red-400 hover:text-red-300 hover:bg-red-500/10 rounded transition-colors"
            >
              <Unlink className="w-3 h-3" />
            </button>
          </div>
        ) : (
          <button
            onClick={handleConnect}
            disabled={isConnecting}
            className="flex items-center gap-1.5 px-2.5 py-1.5 bg-secondary border border-border text-foreground rounded hover:bg-muted transition-colors text-xs shrink-0"
          >
            {isConnecting ? (
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            ) : (
              <>
                <Icon className="w-3.5 h-3.5" />
                Connect
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}

// Simple GitHub icon SVG
function GitHubIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor">
      <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/>
    </svg>
  );
}

// Graphiti Memory Section (Opt-in)
function GraphitiSection() {
  const [graphitiSettings, setGraphitiSettings] = useSettings<GraphitiSettings>('graphiti');
  const [healthStatus, setHealthStatus] = useState<'checking' | 'healthy' | 'unhealthy' | 'unknown'>('unknown');
  const [showClearConfirm, setShowClearConfirm] = useState(false);
  const [clearing, setClearing] = useState(false);

  const enabled = graphitiSettings?.enabled ?? false;
  const serverUrl = graphitiSettings?.serverUrl ?? 'http://localhost:8000';

  // Check health when enabled changes or dialog opens
  useEffect(() => {
    if (enabled) {
      checkHealth();
    } else {
      setHealthStatus('unknown');
    }
  }, [enabled, serverUrl]);

  const checkHealth = async () => {
    setHealthStatus('checking');
    try {
      const result = await window.electronAPI.graphiti.health();
      setHealthStatus(result.ok ? 'healthy' : 'unhealthy');
    } catch {
      setHealthStatus('unhealthy');
    }
  };

  const handleToggle = () => {
    setGraphitiSettings(s => ({ ...s, enabled: !s.enabled }));
  };

  const handleUrlChange = (url: string) => {
    setGraphitiSettings(s => ({ ...s, serverUrl: url }));
    // Configure the service with new URL
    window.electronAPI.graphiti.configure({ url, enabled });
  };

  const handleClearMemory = async () => {
    setClearing(true);
    try {
      await window.electronAPI.graphiti.clear({ projectId: 'default', confirm: true });
      setShowClearConfirm(false);
    } catch (err) {
      console.error('Failed to clear memory:', err);
    } finally {
      setClearing(false);
    }
  };

  return (
    <div>
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-purple-500/10 rounded">
            <Brain className="w-3.5 h-3.5 text-purple-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Graphiti Memory</h3>
            <p className="text-[10px] text-muted-foreground">Knowledge graph for AI</p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          className={`w-8 h-4 rounded-full p-0.5 transition-all duration-200 ${
            enabled ? 'bg-purple-500' : 'bg-muted'
          }`}
        >
          <div
            className={`w-3 h-3 rounded-full bg-white transition-transform duration-200 ${
              enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Configuration (when enabled) */}
      {enabled && (
        <div className="space-y-2 mt-2">
          {/* Server URL */}
          <div className="flex gap-1.5">
            <input
              type="text"
              value={serverUrl}
              onChange={(e) => handleUrlChange(e.target.value)}
              placeholder="http://localhost:8000"
              className="flex-1 px-2 py-1 bg-secondary border border-border rounded text-xs text-foreground placeholder-muted-foreground focus:border-purple-500 focus:outline-none"
            />
            <button
              onClick={checkHealth}
              disabled={healthStatus === 'checking'}
              className="px-2 py-1 bg-secondary border border-border rounded text-xs hover:bg-muted transition-colors"
            >
              {healthStatus === 'checking' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                'Test'
              )}
            </button>
          </div>

          {/* Health Status */}
          <div className="flex items-center gap-2 text-xs">
            {healthStatus === 'healthy' && (
              <span className="flex items-center gap-1 text-green-400">
                <Check className="w-2.5 h-2.5" /> Connected
              </span>
            )}
            {healthStatus === 'unhealthy' && (
              <span className="flex items-center gap-1 text-red-400">
                <AlertCircle className="w-2.5 h-2.5" /> Not available
              </span>
            )}
            {healthStatus === 'checking' && (
              <span className="flex items-center gap-1 text-muted-foreground">
                <Loader2 className="w-2.5 h-2.5 animate-spin" /> Checking...
              </span>
            )}

            {/* Clear Memory */}
            {healthStatus === 'healthy' && (
              <>
                <span className="text-muted-foreground">·</span>
                {!showClearConfirm ? (
                  <button
                    onClick={() => setShowClearConfirm(true)}
                    className="flex items-center gap-1 text-xs text-red-400 hover:text-red-300"
                  >
                    <Trash2 className="w-2.5 h-2.5" /> Clear
                  </button>
                ) : (
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleClearMemory}
                      disabled={clearing}
                      className="px-1.5 py-0.5 text-[10px] bg-red-500/20 text-red-400 rounded hover:bg-red-500/30"
                    >
                      {clearing ? '...' : 'Yes'}
                    </button>
                    <button
                      onClick={() => setShowClearConfirm(false)}
                      className="px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
                    >
                      No
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>
      )}

      {/* Disabled hint */}
      {!enabled && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Long-term memory for AI agents
        </p>
      )}
    </div>
  );
}

// Clawdbot Autonomous Worker Section (Opt-in)
function ClawdbotSection() {
  const [enabled, setEnabled] = useState(false);
  const [dockerAvailable, setDockerAvailable] = useState(false);
  const [containerRunning, setContainerRunning] = useState(false);
  const [containerExists, setContainerExists] = useState(false);
  const [controlUiUrl, setControlUiUrl] = useState<string | null>(null);
  const [healthStatus, setHealthStatus] = useState<'checking' | 'healthy' | 'unhealthy' | 'unknown'>('unknown');
  const [isStarting, setIsStarting] = useState(false);
  const [isStopping, setIsStopping] = useState(false);

  // Load status on mount
  useEffect(() => {
    loadStatus();
  }, []);

  const loadStatus = async () => {
    try {
      const status = await window.electronAPI.clawdbot.status();
      setEnabled(status.enabled);
      setDockerAvailable(status.dockerAvailable);
      setContainerExists(status.containerExists);
      setContainerRunning(status.containerRunning);
      setControlUiUrl(status.controlUiUrl || null);

      if (status.enabled && status.containerRunning) {
        checkHealth();
      } else {
        setHealthStatus('unknown');
      }
    } catch (err) {
      console.error('Failed to load clawdbot status:', err);
    }
  };

  const checkHealth = async () => {
    setHealthStatus('checking');
    try {
      const result = await window.electronAPI.clawdbot.health();
      setHealthStatus(result.ok ? 'healthy' : 'unhealthy');
    } catch {
      setHealthStatus('unhealthy');
    }
  };

  const handleToggle = async () => {
    const newEnabled = !enabled;
    try {
      await window.electronAPI.clawdbot.configure({ enabled: newEnabled });
      setEnabled(newEnabled);
      if (newEnabled) {
        toast.success('Clawdbot enabled - env var KURORYUU_CLAWD_ENABLED=1 set');
      } else {
        toast.info('Clawdbot disabled');
      }
    } catch (err) {
      toast.error('Failed to configure Clawdbot');
    }
  };

  const handleStart = async () => {
    setIsStarting(true);
    try {
      const result = await window.electronAPI.clawdbot.start();
      if (result.ok) {
        toast.success('Clawdbot container started');
        await loadStatus();
      } else {
        toast.error(result.error || 'Failed to start container');
      }
    } catch (err) {
      toast.error('Failed to start container');
    } finally {
      setIsStarting(false);
    }
  };

  const handleStop = async () => {
    setIsStopping(true);
    try {
      const result = await window.electronAPI.clawdbot.stop();
      if (result.ok) {
        toast.info('Clawdbot container stopped');
        await loadStatus();
      } else {
        toast.error(result.error || 'Failed to stop container');
      }
    } catch (err) {
      toast.error('Failed to stop container');
    } finally {
      setIsStopping(false);
    }
  };

  return (
    <div>
      {/* Header with toggle */}
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-cyan-500/10 rounded">
            <Bot className="w-3.5 h-3.5 text-cyan-400" />
          </div>
          <div>
            <h3 className="text-sm font-medium text-foreground">Clawdbot Worker</h3>
            <p className="text-[10px] text-muted-foreground">Autonomous AI in Docker</p>
          </div>
        </div>
        <button
          onClick={handleToggle}
          className={`w-8 h-4 rounded-full p-0.5 transition-all duration-200 ${
            enabled ? 'bg-cyan-500' : 'bg-muted'
          }`}
        >
          <div
            className={`w-3 h-3 rounded-full bg-white transition-transform duration-200 ${
              enabled ? 'translate-x-4' : 'translate-x-0'
            }`}
          />
        </button>
      </div>

      {/* Configuration (when enabled) */}
      {enabled && (
        <div className="space-y-2 mt-2">
          {/* Status Row */}
          <div className="flex items-center gap-3 text-xs">
            {/* Docker Status */}
            <span className="flex items-center gap-1">
              <span className="text-muted-foreground">Docker:</span>
              {dockerAvailable ? (
                <Check className="w-2.5 h-2.5 text-green-400" />
              ) : (
                <AlertCircle className="w-2.5 h-2.5 text-red-400" />
              )}
            </span>

            {/* Container Status */}
            {dockerAvailable && (
              <span className="flex items-center gap-1">
                <span className="text-muted-foreground">Container:</span>
                {containerRunning ? (
                  <span className="text-green-400">Running</span>
                ) : containerExists ? (
                  <span className="text-yellow-400">Stopped</span>
                ) : (
                  <span className="text-muted-foreground">None</span>
                )}
              </span>
            )}
          </div>

          {/* Container Controls */}
          {dockerAvailable && (
            <div className="flex items-center gap-2">
              {!containerRunning ? (
                <button
                  onClick={handleStart}
                  disabled={isStarting}
                  className="flex items-center gap-1 px-2 py-1 bg-cyan-500/20 text-cyan-400 rounded hover:bg-cyan-500/30 transition-colors text-xs disabled:opacity-50"
                >
                  {isStarting ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    <Play className="w-3 h-3" />
                  )}
                  Start
                </button>
              ) : (
                <>
                  <button
                    onClick={handleStop}
                    disabled={isStopping}
                    className="flex items-center gap-1 px-2 py-1 bg-red-500/20 text-red-400 rounded hover:bg-red-500/30 transition-colors text-xs disabled:opacity-50"
                  >
                    {isStopping ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <Square className="w-3 h-3" />
                    )}
                    Stop
                  </button>

                  {/* Control UI Link */}
                  {controlUiUrl && (
                    <a
                      href={controlUiUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1 px-2 py-1 text-xs text-cyan-400 hover:underline"
                    >
                      Dashboard <ExternalLink className="w-2.5 h-2.5" />
                    </a>
                  )}
                </>
              )}
            </div>
          )}

          {/* Provider Config Link (when container exists) */}
          {containerExists && (
            <details className="text-xs">
              <summary className="text-muted-foreground hover:text-foreground cursor-pointer">
                Provider Settings
              </summary>
              <div className="mt-2 pt-2 border-t border-border/50">
                <ClawdbotProvidersConfig />
              </div>
            </details>
          )}
        </div>
      )}

      {/* Disabled hint */}
      {!enabled && (
        <p className="text-[10px] text-muted-foreground mt-1">
          Delegate tasks to autonomous AI worker
        </p>
      )}
    </div>
  );
}

export function IntegrationsDialog() {
  const { activeDialog, closeDialog } = useSettingsStore();
  const isOpen = activeDialog === 'integrations';
  const { isKuroryuu, isGrunge } = useIsThemedStyle();

  const [statuses, setStatuses] = useState<Record<string, ProviderStatus>>({});
  const [githubUser, setGithubUser] = useState<{ name: string; avatar: string } | null>(null);
  
  // GitHub OAuth App configuration state
  const [showGitHubConfig, setShowGitHubConfig] = useState(false);
  const [githubClientId, setGithubClientId] = useState('');
  const [githubClientSecret, setGithubClientSecret] = useState('');
  const [githubConfigStatus, setGithubConfigStatus] = useState<'idle' | 'saving' | 'saved' | 'error'>('idle');
  const [hasStoredGithubCreds, setHasStoredGithubCreds] = useState(false);

  // Load provider statuses
  useEffect(() => {
    if (isOpen && window.electronAPI?.auth) {
      loadStatuses();
      loadGitHubConfig();
    }
  }, [isOpen]);

  // Listen for OAuth callback results
  useEffect(() => {
    if (!window.electronAPI?.on?.oauthCallback) return;

    const unsubscribe = window.electronAPI.on.oauthCallback((data) => {
      if (data.success) {
        // Reload statuses on successful OAuth
        loadStatuses();
        toast.success('OAuth connected successfully');
      } else if (data.error) {
        toast.error(`OAuth failed: ${data.error}`);
      }
    });

    return () => { unsubscribe(); };
  }, []);

  const loadStatuses = async () => {
    const result = await window.electronAPI.auth.getAllStatuses();
    setStatuses(result);

    // Load GitHub user if connected
    if (result.github?.connected) {
      const user = await window.electronAPI.auth.github.getUser();
      if (user) {
        setGithubUser({ name: user.login, avatar: user.avatar_url });
      }
    }
  };
  
  // Load stored GitHub OAuth App credentials
  const loadGitHubConfig = async () => {
    try {
      const creds = await window.electronAPI.auth.oauthApp.get('github');
      if (creds) {
        setGithubClientId(creds.clientId);
        setHasStoredGithubCreds(true);
      } else {
        setHasStoredGithubCreds(false);
      }
    } catch (err) {
      console.error('Failed to load GitHub config:', err);
    }
  };
  
  // Save GitHub OAuth App credentials
  const handleSaveGitHubConfig = async () => {
    if (!githubClientId.trim()) return;
    
    setGithubConfigStatus('saving');
    try {
      // Save credentials securely
      await window.electronAPI.auth.oauthApp.save('github', githubClientId.trim(), githubClientSecret.trim() || undefined);
      setGithubConfigStatus('saved');
      setHasStoredGithubCreds(true);
      setGithubClientSecret(''); // Clear secret from memory
      
      // Load the credentials into the GitHub service and start OAuth
      const loadResult = await window.electronAPI.auth.github.loadFromStore();
      if (loadResult.ok) {
        setTimeout(async () => {
          setGithubConfigStatus('idle');
          setShowGitHubConfig(false);
          // Start OAuth flow
          const authResult = await window.electronAPI.auth.github.startAuth();
          if (!authResult.ok) {
            toast.error(`GitHub OAuth failed: ${authResult.error}`);
          }
        }, 500);
      }
    } catch (err) {
      setGithubConfigStatus('error');
      console.error('Failed to save GitHub config:', err);
    }
  };

  // API Key handlers
  const handleSetAnthropicKey = async (key: string) => {
    await window.electronAPI.auth.anthropic.setKey(key);
    await loadStatuses();
  };

  const handleVerifyAnthropicKey = async (key: string) => {
    return window.electronAPI.auth.anthropic.verify(key);
  };

  const handleSetOpenAIKey = async (key: string) => {
    await window.electronAPI.auth.openai.setKey(key);
    await loadStatuses();
  };

  const handleVerifyOpenAIKey = async (key: string) => {
    return window.electronAPI.auth.openai.verify(key);
  };

  // Disconnect handlers
  const handleDisconnect = async (provider: string) => {
    await window.electronAPI.auth.disconnect(provider);
    if (provider === 'github') {
      setGithubUser(null);
    }
    await loadStatuses();
  };

  // GitHub OAuth
  const handleGitHubConnect = async () => {
    // Try to load from secure storage first
    const loadResult = await window.electronAPI.auth.github.loadFromStore();

    if (!loadResult.ok) {
      // No stored credentials - show configuration UI
      setShowGitHubConfig(true);
      return;
    }

    try {
      // Start the OAuth flow (opens browser)
      const authResult = await window.electronAPI.auth.github.startAuth();
      if (!authResult.ok) {
        toast.error(`GitHub OAuth failed: ${authResult.error}`);
      }
    } catch (err) {
      console.error('GitHub OAuth failed:', err);
      toast.error(`GitHub OAuth failed: ${String(err)}`);
    }
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="lg"
            className="w-[750px] max-h-[85vh] overflow-hidden flex flex-col"
            contentClassName="flex-1 flex flex-col min-h-0"
          >
            {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <Dialog.Title className="text-lg font-semibold text-foreground">
              Integrations
            </Dialog.Title>
            <Dialog.Close className="p-2 hover:bg-secondary rounded-lg transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0 p-4 space-y-4">
            {/* Row 1: API Keys + Source Control */}
            <div className="grid grid-cols-2 gap-4">
              {/* API Keys Column */}
              <div className="bg-card/30 rounded-lg p-3 border border-border/50">
                <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  API Keys
                </h2>
                <ApiKeyInput
                  provider="anthropic"
                  label="Anthropic (Claude)"
                  docsUrl="https://console.anthropic.com/settings/keys"
                  isConnected={statuses.anthropic?.connected ?? false}
                  onSetKey={handleSetAnthropicKey}
                  onDisconnect={() => handleDisconnect('anthropic')}
                  verifyKey={handleVerifyAnthropicKey}
                />
                <ApiKeyInput
                  provider="openai"
                  label="OpenAI (GPT)"
                  docsUrl="https://platform.openai.com/api-keys"
                  isConnected={statuses.openai?.connected ?? false}
                  onSetKey={handleSetOpenAIKey}
                  onDisconnect={() => handleDisconnect('openai')}
                  verifyKey={handleVerifyOpenAIKey}
                />
              </div>

              {/* Source Control Column */}
              <div className="bg-card/30 rounded-lg p-3 border border-border/50">
                <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                  Source Control
                </h2>
                <OAuthProvider
                  provider="github"
                  label="GitHub"
                  description="Clone repos, create PRs, manage issues"
                  icon={GitHubIcon}
                  isConnected={statuses.github?.connected ?? false}
                  onConnect={handleGitHubConnect}
                  onDisconnect={() => handleDisconnect('github')}
                  userInfo={githubUser}
                />

                {/* Show configure button if not connected but has stored creds */}
                {!statuses.github?.connected && hasStoredGithubCreds && !showGitHubConfig && (
                  <button
                    onClick={() => setShowGitHubConfig(true)}
                    className="text-[10px] text-muted-foreground hover:text-foreground mt-1"
                  >
                    Reconfigure OAuth App
                  </button>
                )}

                {/* Placeholder for GitLab */}
                <div className="py-2 border-b border-border/30 opacity-50">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-secondary rounded">
                      <Key className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground">GitLab</h3>
                      <p className="text-[10px] text-muted-foreground">Coming soon</p>
                    </div>
                  </div>
                </div>

                {/* Placeholder for Bitbucket */}
                <div className="py-2 opacity-50">
                  <div className="flex items-center gap-2">
                    <div className="p-1.5 bg-secondary rounded">
                      <Key className="w-3.5 h-3.5 text-muted-foreground" />
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-muted-foreground">Bitbucket</h3>
                      <p className="text-[10px] text-muted-foreground">Coming soon</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* GitHub OAuth App Configuration (full width when shown) */}
            {showGitHubConfig && (
              <div className="bg-card/50 border border-border rounded-lg p-4">
                <h4 className="text-sm font-medium text-foreground mb-2">Configure GitHub OAuth App</h4>
                <p className="text-xs text-muted-foreground mb-3">
                  Create an OAuth App in{' '}
                  <a
                    href="https://github.com/settings/developers"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    GitHub Developer Settings
                  </a>
                  {' · '}
                  <span className="text-muted-foreground">Callback: kuroryuu://oauth/callback/github</span>
                </p>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Client ID *</label>
                    <input
                      type="text"
                      value={githubClientId}
                      onChange={(e) => setGithubClientId(e.target.value)}
                      placeholder="Ov23..."
                      className="w-full px-2.5 py-1.5 bg-secondary border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs text-muted-foreground mb-1">Client Secret (optional)</label>
                    <input
                      type="password"
                      value={githubClientSecret}
                      onChange={(e) => setGithubClientSecret(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-2.5 py-1.5 bg-secondary border border-border rounded text-sm text-foreground placeholder-muted-foreground focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-2 mt-3">
                  <button
                    onClick={handleSaveGitHubConfig}
                    disabled={!githubClientId.trim() || githubConfigStatus === 'saving'}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-primary text-black rounded hover:bg-primary/80 transition-colors text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    {githubConfigStatus === 'saving' ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    ) : githubConfigStatus === 'saved' ? (
                      <Check className="w-3.5 h-3.5" />
                    ) : (
                      'Save & Connect'
                    )}
                  </button>
                  <button
                    onClick={() => setShowGitHubConfig(false)}
                    className="px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            )}

            {/* Row 2: Local Services */}
            <div className="bg-card/30 rounded-lg p-3 border border-border/50">
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Local Services
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <CLIProxySection />
                </div>
                <div>
                  <ClawdbotSection />
                </div>
                <div>
                  <FullDesktopSection />
                </div>
              </div>
            </div>

            {/* Row 3: Optional Services */}
            <div className="bg-card/30 rounded-lg p-3 border border-border/50">
              <h2 className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-2">
                Optional
              </h2>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <CLIBootstrapInstall />
                </div>
                <div>
                  <GraphitiSection />
                </div>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border flex-shrink-0">
            <button
              onClick={closeDialog}
              className="px-4 py-2 text-sm text-foreground hover:text-foreground transition-colors"
            >
              Close
            </button>
          </div>
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
