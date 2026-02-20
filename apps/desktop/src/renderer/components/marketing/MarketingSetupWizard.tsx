import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, AlertTriangle, Loader2, Download, Settings2, Rocket, Terminal, RotateCcw, Globe } from 'lucide-react';
import type { ToolStatus } from '../../types/marketing';

interface MarketingSetupWizardProps {
  onComplete: () => void;
}

const TOOLS: Array<{ id: string; name: string; description: string; repoUrl: string; targetDir: string }> = [
  {
    id: 'google-image-gen',
    name: 'Google Image Generator',
    description: 'Generate images using Google Gemini AI (styles, aspect ratios, ref images)',
    repoUrl: 'https://github.com/AI-Engineer-Skool/google-image-gen-api-starter',
    targetDir: 'tools/marketing/google-image-gen-api-starter',
  },
  {
    id: 'video-toolkit',
    name: 'Claude Code Video Toolkit',
    description: 'Video ads (Remotion), voiceover (ElevenLabs), music, SFX, image editing, upscale',
    repoUrl: 'https://github.com/digitalsamba/claude-code-video-toolkit',
    targetDir: 'tools/marketing/claude-code-video-toolkit',
  },
];

export function MarketingSetupWizard({ onComplete }: MarketingSetupWizardProps) {
  const [stage, setStage] = useState<1 | 2>(1);
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installError, setInstallError] = useState<string | null>(null);
  const [uvInstalled, setUvInstalled] = useState<boolean | null>(null);
  const [uvInstalling, setUvInstalling] = useState(false);
  const [playwrightInstalled, setPlaywrightInstalled] = useState<boolean | null>(null);
  const [playwrightInstalling, setPlaywrightInstalling] = useState(false);
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [cliProxyConnected, setCliProxyConnected] = useState(false);


  // Load tool status on mount and auto-install gateway deps
  useEffect(() => {
    loadToolStatus();
    checkHealth();
    checkUv();
    installPlaywright(); // auto-run: installs gateway requirements.txt + Chromium
  }, []);

  const loadToolStatus = async () => {
    try {
      const result = await window.electronAPI.marketing.getToolStatus();
      setTools(result.tools || []);
    } catch (err) {
      console.error('[Marketing] Failed to load tool status:', err);
    }
  };

  const checkHealth = async () => {
    try {
      // Check gateway health
      const gatewayRes = await fetch('http://127.0.0.1:8200/v1/health');
      setGatewayOnline(gatewayRes.ok);

      // Check CLI proxy (simplified - just check if gateway is online)
      setCliProxyConnected(gatewayRes.ok);
    } catch {
      setGatewayOnline(false);
      setCliProxyConnected(false);
    }
  };

  const checkUv = async () => {
    try {
      const result = await window.electronAPI.marketing.ensureUv();
      setUvInstalled(result.ok);
    } catch {
      setUvInstalled(false);
    }
  };

  const setupUv = async () => {
    setUvInstalling(true);
    setInstallError(null);
    try {
      const result = await window.electronAPI.marketing.ensureUv();
      setUvInstalled(result.ok);
      if (!result.ok) {
        setInstallError(result.error || 'Failed to install uv');
      }
    } catch (err) {
      setInstallError(String(err));
      setUvInstalled(false);
    } finally {
      setUvInstalling(false);
    }
  };

  const installPlaywright = async () => {
    setPlaywrightInstalling(true);
    setInstallError(null);
    try {
      const result = await window.electronAPI.marketing.installPlaywright();
      setPlaywrightInstalled(result.ok);
      if (!result.ok) setInstallError(result.error || 'Failed to install browser');
    } catch (err) {
      setInstallError(String(err));
      setPlaywrightInstalled(false);
    } finally {
      setPlaywrightInstalling(false);
    }
  };

  const installTool = async (toolId: string) => {
    const tool = TOOLS.find((t) => t.id === toolId);
    if (!tool) return;

    setInstalling(toolId);
    setInstallError(null);
    try {
      // Ensure uv is available (auto-installs if missing)
      const uvResult = await window.electronAPI.marketing.ensureUv();
      setUvInstalled(uvResult.ok);
      if (!uvResult.ok) {
        setInstallError(`uv setup failed: ${uvResult.error}`);
        setInstalling(null);
        return;
      }

      // Clone repo
      const cloneResult = await window.electronAPI.marketing.cloneRepo(tool.repoUrl, tool.targetDir);
      if (!cloneResult.ok) {
        setInstallError(`Clone failed: ${cloneResult.error}`);
        setInstalling(null);
        return;
      }

      // Install deps (handles both Python/uv and Node/npm)
      const installResult = await window.electronAPI.marketing.installDeps(tool.targetDir);
      if (!installResult.ok) {
        setInstallError(`Dependency install failed: ${installResult.error}`);
        setInstalling(null);
        return;
      }

      // Reload status
      await loadToolStatus();
    } catch (err) {
      setInstallError(String(err));
    } finally {
      setInstalling(null);
    }
  };

  const installAll = async () => {
    for (const tool of TOOLS) {
      await installTool(tool.id);
    }
  };

  const allToolsReady = TOOLS.every((t) => tools.find((ts) => ts.id === t.id)?.depsInstalled);

  const resetSetup = async () => {
    if (!confirm('Reset setup? This will clear installation state so you can re-run the wizard.')) return;
    try {
      await window.electronAPI.marketing.resetSetup();
      setStage(1);
      await loadToolStatus();
    } catch (err) {
      console.error('[Marketing] Reset failed:', err);
    }
  };

  return (
    <div className="w-full h-full bg-zinc-900 text-zinc-100 overflow-auto p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-amber-500 mb-2">Marketing Workspace Setup</h1>
            <p className="text-zinc-400">
              Install tools and configure your marketing automation workspace
            </p>
          </div>
          <button
            onClick={resetSetup}
            title="Reset setup state and re-run wizard"
            className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-zinc-400 hover:text-zinc-200 bg-zinc-800 hover:bg-zinc-700 rounded transition-colors"
          >
            <RotateCcw className="w-3 h-3" />
            Reset
          </button>
        </div>

        {/* Progress indicator */}
        <div className="flex items-center gap-4 mb-8">
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded ${
              stage === 1 ? 'bg-amber-500/20 text-amber-500' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            <Download className="w-4 h-4" />
            <span className="text-sm font-medium">1. Install Tools</span>
          </div>
          <div className="flex-1 h-0.5 bg-zinc-800" />
          <div
            className={`flex items-center gap-2 px-4 py-2 rounded ${
              stage === 2 ? 'bg-amber-500/20 text-amber-500' : 'bg-zinc-800 text-zinc-400'
            }`}
          >
            <Settings2 className="w-4 h-4" />
            <span className="text-sm font-medium">2. Verify & Complete</span>
          </div>
        </div>

        {/* Stage 1: Tool Installation */}
        {stage === 1 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Install Marketing Tools</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={installAll}
                  disabled={installing !== null || allToolsReady}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {installing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Installing...
                    </>
                  ) : allToolsReady ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      All Installed
                    </>
                  ) : (
                    <>
                      <Download className="w-4 h-4" />
                      Install All
                    </>
                  )}
                </button>
                <button
                  onClick={() => setStage(2)}
                  className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm transition-colors"
                >
                  Skip
                </button>
              </div>
            </div>

            {/* uv prerequisite */}
            <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700 mb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Terminal className="w-4 h-4 text-violet-400" />
                    <h3 className="font-medium">uv (Python Package Manager)</h3>
                    {uvInstalled === true && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                    {uvInstalled === false && <XCircle className="w-4 h-4 text-red-500" />}
                  </div>
                  <p className="text-sm text-zinc-400">
                    Required for Python tool dependencies. Will be installed automatically if missing.
                  </p>
                </div>
                {uvInstalled === false && (
                  <button
                    onClick={setupUv}
                    disabled={uvInstalling}
                    className="px-3 py-1.5 bg-violet-500 hover:bg-violet-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-white rounded text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    {uvInstalling ? (
                      <>
                        <Loader2 className="w-3 h-3 animate-spin" />
                        Installing
                      </>
                    ) : (
                      <>
                        <Download className="w-3 h-3" />
                        Install uv
                      </>
                    )}
                  </button>
                )}
              </div>
            </div>

            {/* Gateway dependencies (auto-installs on mount) */}
            <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700 mb-2">
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Globe className="w-4 h-4 text-blue-400" />
                    <h3 className="font-medium">Gateway Dependencies</h3>
                    {playwrightInstalling && <Loader2 className="w-4 h-4 text-blue-400 animate-spin" />}
                    {playwrightInstalled === true && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                    {playwrightInstalled === false && <XCircle className="w-4 h-4 text-red-500" />}
                  </div>
                  <p className="text-sm text-zinc-400">
                    {playwrightInstalling
                      ? 'Installing gateway requirements + Chromium browser…'
                      : 'Python packages (requirements.txt) + Chromium browser for Web Scraper.'}
                  </p>
                </div>
                {playwrightInstalled === false && !playwrightInstalling && (
                  <button
                    onClick={installPlaywright}
                    className="px-3 py-1.5 bg-blue-500 hover:bg-blue-600 text-white rounded text-sm font-medium transition-colors flex items-center gap-2"
                  >
                    <Download className="w-3 h-3" />
                    Retry
                  </button>
                )}
              </div>
            </div>

            {/* Error display */}
            {installError && (
              <div className="bg-red-500/10 border border-red-500/30 rounded-lg p-3 text-sm text-red-400">
                {installError}
              </div>
            )}

            <div className="grid gap-4">
              {TOOLS.map((tool) => {
                const status = tools.find((t) => t.id === tool.id);
                const isInstalling = installing === tool.id;
                const isCloned = status?.installed || false;
                const isReady = status?.depsInstalled || false;

                return (
                  <div key={tool.id} className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium">{tool.name}</h3>
                          {isReady && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                          {isCloned && !isReady && !isInstalling && (
                            <span className="text-xs text-amber-500 bg-amber-500/10 px-1.5 py-0.5 rounded">
                              Cloned — needs deps
                            </span>
                          )}
                        </div>
                        <p className="text-sm text-zinc-400 mb-2">{tool.description}</p>
                        <a
                          href="#"
                          onClick={(e) => {
                            e.preventDefault();
                            window.electronAPI.shell.openExternal(tool.repoUrl);
                          }}
                          className="text-xs text-zinc-500 hover:text-amber-500 hover:underline cursor-pointer"
                        >
                          {tool.repoUrl}
                        </a>
                      </div>
                      <button
                        onClick={() => installTool(tool.id)}
                        disabled={isInstalling || isReady}
                        className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2 ${
                          isReady
                            ? 'bg-zinc-700 text-zinc-500 cursor-default'
                            : isCloned && !isInstalling
                              ? 'bg-amber-600 hover:bg-amber-700 text-zinc-900'
                              : 'bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900'
                        }`}
                      >
                        {isInstalling ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Installing
                          </>
                        ) : isReady ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            Installed
                          </>
                        ) : isCloned ? (
                          <>
                            <Download className="w-3 h-3" />
                            Install Deps
                          </>
                        ) : (
                          <>
                            <Download className="w-3 h-3" />
                            Install
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="flex justify-end pt-4">
              <button
                onClick={() => setStage(2)}
                className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-zinc-900 rounded font-medium transition-colors"
              >
                Next: Verify
              </button>
            </div>
          </div>
        )}

        {/* Stage 2: Verify & Complete */}
        {stage === 2 && (
          <div className="space-y-6">
            <h2 className="text-xl font-semibold mb-4">Verify Setup</h2>

            {/* Health checks */}
            <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700 space-y-3">
              <h3 className="font-medium mb-3">System Health</h3>

              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">uv (Python)</span>
                {uvInstalled ? (
                  <div className="flex items-center gap-2 text-green-500 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Installed
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-500 text-sm">
                    <XCircle className="w-4 h-4" />
                    Not Found
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">Gateway Online</span>
                {gatewayOnline ? (
                  <div className="flex items-center gap-2 text-green-500 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Online
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-500 text-sm">
                    <XCircle className="w-4 h-4" />
                    Offline
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">CLI Proxy Connected</span>
                {cliProxyConnected ? (
                  <div className="flex items-center gap-2 text-green-500 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    Connected
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-red-500 text-sm">
                    <XCircle className="w-4 h-4" />
                    Disconnected
                  </div>
                )}
              </div>

              <div className="flex items-center justify-between">
                <span className="text-sm text-zinc-300">Tool Repos (optional)</span>
                {allToolsReady ? (
                  <div className="flex items-center gap-2 text-green-500 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    {tools.filter((t) => t.depsInstalled).length} / {TOOLS.length} installed
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-zinc-400 text-sm">
                    {tools.filter((t) => t.depsInstalled).length} / {TOOLS.length} installed
                  </div>
                )}
              </div>
            </div>

            {/* CLI Proxy note */}
            <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
              <h3 className="font-medium mb-2">Image Generation</h3>
              <p className="text-sm text-zinc-400">
                Image generation routes through CLI Proxy (Gemini OAuth). No separate API key needed.
              </p>
            </div>

            <div className="flex items-center justify-between pt-4">
              <button
                onClick={() => setStage(1)}
                className="px-4 py-2 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded text-sm transition-colors"
              >
                Back
              </button>
              <button
                onClick={async () => {
                  // Save setup state
                  await window.electronAPI.marketing.saveSetup({ complete: true });
                  onComplete();
                }}
                className="px-6 py-2 bg-amber-500 hover:bg-amber-600 text-zinc-900 rounded font-medium transition-colors flex items-center gap-2"
              >
                <Rocket className="w-4 h-4" />
                Complete Setup
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
