import { useState, useEffect } from 'react';
import { CheckCircle2, XCircle, Loader2, Download, Settings2, Rocket } from 'lucide-react';
import type { ToolStatus } from '../../types/marketing';

interface MarketingSetupWizardProps {
  onComplete: () => void;
}

const TOOLS: Array<{ id: string; name: string; description: string; repoUrl: string; targetDir: string }> = [
  {
    id: 'google-image-gen',
    name: 'Google Image Generator',
    description: 'Generate images using Google Gemini AI',
    repoUrl: 'https://github.com/kuroryuu/google-image-gen',
    targetDir: 'tools/marketing/google-image-gen',
  },
  {
    id: 'video-toolkit',
    name: 'Claude Code Video Toolkit',
    description: 'Video, voiceover, and music generation',
    repoUrl: 'https://github.com/kuroryuu/claude-code-video-toolkit',
    targetDir: 'tools/marketing/claude-code-video-toolkit',
  },
];

export function MarketingSetupWizard({ onComplete }: MarketingSetupWizardProps) {
  const [stage, setStage] = useState<1 | 2>(1);
  const [tools, setTools] = useState<ToolStatus[]>([]);
  const [installing, setInstalling] = useState<string | null>(null);
  const [gatewayOnline, setGatewayOnline] = useState(false);
  const [cliProxyConnected, setCliProxyConnected] = useState(false);
  const [googleApiKey, setGoogleApiKey] = useState('');

  // Load tool status on mount
  useEffect(() => {
    loadToolStatus();
    checkHealth();
  }, []);

  const loadToolStatus = async () => {
    try {
      const result = await window.api.marketing.getToolStatus();
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

  const installTool = async (toolId: string) => {
    const tool = TOOLS.find((t) => t.id === toolId);
    if (!tool) return;

    setInstalling(toolId);
    try {
      // Clone repo
      const cloneResult = await window.api.marketing.cloneRepo(tool.repoUrl, tool.targetDir);
      if (!cloneResult.ok) {
        console.error(`[Marketing] Clone failed: ${cloneResult.error}`);
        setInstalling(null);
        return;
      }

      // Install deps
      const installResult = await window.api.marketing.installDeps(tool.targetDir);
      if (!installResult.ok) {
        console.error(`[Marketing] Install failed: ${installResult.error}`);
        setInstalling(null);
        return;
      }

      // Reload status
      await loadToolStatus();
    } catch (err) {
      console.error(`[Marketing] Install error:`, err);
    } finally {
      setInstalling(null);
    }
  };

  const installAll = async () => {
    for (const tool of TOOLS) {
      await installTool(tool.id);
    }
  };

  const allToolsInstalled = TOOLS.every((t) => tools.find((ts) => ts.id === t.id)?.installed);

  return (
    <div className="w-full h-full bg-zinc-900 text-zinc-100 overflow-auto p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-amber-500 mb-2">Marketing Workspace Setup</h1>
          <p className="text-zinc-400">
            Install tools and configure your marketing automation workspace
          </p>
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
                  disabled={installing !== null || allToolsInstalled}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {installing ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Installing...
                    </>
                  ) : allToolsInstalled ? (
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

            <div className="grid gap-4">
              {TOOLS.map((tool) => {
                const status = tools.find((t) => t.id === tool.id);
                const isInstalling = installing === tool.id;
                const isInstalled = status?.installed || false;

                return (
                  <div key={tool.id} className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <h3 className="font-medium">{tool.name}</h3>
                          {isInstalled && <CheckCircle2 className="w-4 h-4 text-green-500" />}
                        </div>
                        <p className="text-sm text-zinc-400 mb-2">{tool.description}</p>
                        <p className="text-xs text-zinc-500">{tool.repoUrl}</p>
                      </div>
                      <button
                        onClick={() => installTool(tool.id)}
                        disabled={isInstalling || isInstalled}
                        className="px-3 py-1.5 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded text-sm font-medium transition-colors flex items-center gap-2"
                      >
                        {isInstalling ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Installing
                          </>
                        ) : isInstalled ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            Installed
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
                <span className="text-sm text-zinc-300">Tools Installed</span>
                {allToolsInstalled ? (
                  <div className="flex items-center gap-2 text-green-500 text-sm">
                    <CheckCircle2 className="w-4 h-4" />
                    {tools.filter((t) => t.installed).length} / {TOOLS.length}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-amber-500 text-sm">
                    <Loader2 className="w-4 h-4" />
                    {tools.filter((t) => t.installed).length} / {TOOLS.length}
                  </div>
                )}
              </div>
            </div>

            {/* Optional API key */}
            <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
              <h3 className="font-medium mb-2">Google AI API Key (Optional)</h3>
              <p className="text-sm text-zinc-400 mb-3">
                Required for Google Image Generator. Get your key from{' '}
                <a
                  href="https://makersuite.google.com/app/apikey"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-amber-500 hover:underline"
                >
                  Google AI Studio
                </a>
              </p>
              <input
                type="password"
                value={googleApiKey}
                onChange={(e) => setGoogleApiKey(e.target.value)}
                placeholder="AIza..."
                className="w-full bg-zinc-900 border border-zinc-700 rounded px-3 py-2 text-sm text-zinc-100 placeholder-zinc-500 focus:outline-none focus:border-amber-500"
              />
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
                  await window.api.marketing.saveSetup({ complete: true, googleApiKey });
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
