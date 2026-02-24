import { useState } from 'react';
import { CheckCircle2, XCircle, Loader2, Search, Settings2, Rocket, RotateCcw, PenTool, Server, Wrench, FolderOpen } from 'lucide-react';

interface ExcalidrawSetupWizardProps {
  onComplete: () => void;
}

interface CheckResult {
  status: 'idle' | 'checking' | 'ok' | 'error';
  error?: string;
}

const CHECKS = [
  { id: 'npm', label: 'Excalidraw Canvas', description: 'React canvas component (@excalidraw/excalidraw)', icon: PenTool },
  { id: 'mcp', label: 'MCP Core Server', description: 'Backend server at :8100 for tool execution', icon: Server },
  { id: 'tool', label: 'k_excalidraw Tool', description: 'Diagram creation tool registered in MCP Core', icon: Wrench },
  { id: 'dir', label: 'Output Directory', description: 'tools/excalidraw/output/ exists and is writable', icon: FolderOpen },
] as const;

type CheckId = (typeof CHECKS)[number]['id'];

export function ExcalidrawSetupWizard({ onComplete }: ExcalidrawSetupWizardProps) {
  const [stage, setStage] = useState<1 | 2>(1);
  const [checks, setChecks] = useState<Record<CheckId, CheckResult>>({
    npm: { status: 'idle' },
    mcp: { status: 'idle' },
    tool: { status: 'idle' },
    dir: { status: 'idle' },
  });
  const [testResult, setTestResult] = useState<{ status: 'idle' | 'running' | 'ok' | 'error'; path?: string; error?: string }>({ status: 'idle' });

  const updateCheck = (id: CheckId, result: CheckResult) => {
    setChecks((prev) => ({ ...prev, [id]: result }));
  };

  const runCheck = async (id: CheckId) => {
    updateCheck(id, { status: 'checking' });
    try {
      let result: { ok: boolean; error?: string };
      switch (id) {
        case 'npm':
          result = await window.electronAPI.excalidraw.checkNpmPackage();
          break;
        case 'mcp':
          result = await window.electronAPI.excalidraw.checkMcpCore();
          break;
        case 'tool':
          result = await window.electronAPI.excalidraw.checkMcpTool();
          break;
        case 'dir':
          result = await window.electronAPI.excalidraw.checkOutputDir();
          break;
      }
      updateCheck(id, result.ok ? { status: 'ok' } : { status: 'error', error: result.error });
    } catch (err) {
      updateCheck(id, { status: 'error', error: String(err) });
    }
  };

  const runAllChecks = async () => {
    for (const check of CHECKS) {
      await runCheck(check.id);
    }
  };

  const runTestDiagram = async () => {
    setTestResult({ status: 'running' });
    try {
      const result = await window.electronAPI.excalidraw.testDiagram();
      if (result.ok) {
        setTestResult({ status: 'ok', path: result.path });
      } else {
        setTestResult({ status: 'error', error: result.error });
      }
    } catch (err) {
      setTestResult({ status: 'error', error: String(err) });
    }
  };

  const allChecksOk = CHECKS.every((c) => checks[c.id].status === 'ok');
  const anyChecking = CHECKS.some((c) => checks[c.id].status === 'checking');

  const resetSetup = async () => {
    if (!confirm('Reset setup? This will clear verification state so you can re-run the wizard.')) return;
    try {
      await window.electronAPI.excalidraw.resetSetup();
      setStage(1);
      setChecks({
        npm: { status: 'idle' },
        mcp: { status: 'idle' },
        tool: { status: 'idle' },
        dir: { status: 'idle' },
      });
      setTestResult({ status: 'idle' });
    } catch (err) {
      console.error('[Excalidraw] Reset failed:', err);
    }
  };

  const StatusIcon = ({ status }: { status: CheckResult['status'] }) => {
    switch (status) {
      case 'ok':
        return <CheckCircle2 className="w-4 h-4 text-green-500" />;
      case 'error':
        return <XCircle className="w-4 h-4 text-red-500" />;
      case 'checking':
        return <Loader2 className="w-4 h-4 text-amber-500 animate-spin" />;
      default:
        return <div className="w-4 h-4 rounded-full border border-zinc-600" />;
    }
  };

  return (
    <div className="w-full h-full bg-zinc-900 text-zinc-100 overflow-auto p-8">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="mb-8 flex items-start justify-between">
          <div>
            <h1 className="text-3xl font-bold text-amber-500 mb-2">Excalidraw Workspace Setup</h1>
            <p className="text-zinc-400">
              Verify prerequisites for the diagramming workspace
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
            <Search className="w-4 h-4" />
            <span className="text-sm font-medium">1. Check Prerequisites</span>
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

        {/* Stage 1: Check Prerequisites */}
        {stage === 1 && (
          <div className="space-y-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-semibold">Check Prerequisites</h2>
              <div className="flex items-center gap-2">
                <button
                  onClick={runAllChecks}
                  disabled={anyChecking}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {anyChecking ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Checking...
                    </>
                  ) : allChecksOk ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      All Passed
                    </>
                  ) : (
                    <>
                      <Search className="w-4 h-4" />
                      Check All
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
              {CHECKS.map((check) => {
                const result = checks[check.id];
                const Icon = check.icon;

                return (
                  <div key={check.id} className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
                    <div className="flex items-start justify-between">
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <Icon className="w-4 h-4 text-amber-400" />
                          <h3 className="font-medium">{check.label}</h3>
                          <StatusIcon status={result.status} />
                        </div>
                        <p className="text-sm text-zinc-400">{check.description}</p>
                        {result.status === 'error' && result.error && (
                          <p className="text-xs text-red-400 mt-1">{result.error}</p>
                        )}
                      </div>
                      <button
                        onClick={() => runCheck(check.id)}
                        disabled={result.status === 'checking'}
                        className={`px-3 py-1.5 rounded text-sm font-medium transition-colors flex items-center gap-2 ${
                          result.status === 'ok'
                            ? 'bg-zinc-700 text-zinc-500 cursor-default'
                            : 'bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900'
                        }`}
                      >
                        {result.status === 'checking' ? (
                          <>
                            <Loader2 className="w-3 h-3 animate-spin" />
                            Checking
                          </>
                        ) : result.status === 'ok' ? (
                          <>
                            <CheckCircle2 className="w-3 h-3" />
                            Passed
                          </>
                        ) : (
                          <>
                            <Search className="w-3 h-3" />
                            Check
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

            {/* Checklist */}
            <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700 space-y-3">
              <h3 className="font-medium mb-3">Prerequisite Checks</h3>
              {CHECKS.map((check) => {
                const result = checks[check.id];
                return (
                  <div key={check.id} className="flex items-center justify-between">
                    <span className="text-sm text-zinc-300">{check.label}</span>
                    {result.status === 'ok' ? (
                      <div className="flex items-center gap-2 text-green-500 text-sm">
                        <CheckCircle2 className="w-4 h-4" />
                        Passed
                      </div>
                    ) : result.status === 'error' ? (
                      <div className="flex items-center gap-2 text-red-500 text-sm">
                        <XCircle className="w-4 h-4" />
                        Failed
                      </div>
                    ) : (
                      <div className="flex items-center gap-2 text-zinc-500 text-sm">
                        Not checked
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Test diagram */}
            <div className="bg-zinc-800 rounded-lg p-4 border border-zinc-700">
              <h3 className="font-medium mb-2">Test Diagram</h3>
              <p className="text-sm text-zinc-400 mb-3">
                Create a small test diagram to verify the full pipeline works end-to-end.
              </p>
              <div className="flex items-center gap-3">
                <button
                  onClick={runTestDiagram}
                  disabled={testResult.status === 'running'}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-600 disabled:bg-zinc-700 disabled:text-zinc-500 text-zinc-900 rounded text-sm font-medium transition-colors flex items-center gap-2"
                >
                  {testResult.status === 'running' ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Creating...
                    </>
                  ) : testResult.status === 'ok' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      Test Passed
                    </>
                  ) : (
                    <>
                      <PenTool className="w-4 h-4" />
                      Create Test Diagram
                    </>
                  )}
                </button>
                {testResult.status === 'ok' && testResult.path && (
                  <span className="text-xs text-zinc-500">{testResult.path}</span>
                )}
                {testResult.status === 'error' && testResult.error && (
                  <span className="text-xs text-red-400">{testResult.error}</span>
                )}
              </div>
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
                  await window.electronAPI.excalidraw.saveSetup({ complete: true });
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
