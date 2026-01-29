/**
 * Tool Executor
 *
 * Executes a tool with dynamic parameter form and result viewer.
 */
import React from 'react';
import { Play, RotateCcw, Lock, Clock, History } from 'lucide-react';
import { useToolExecution } from '../../../hooks/useCommandCenter';
import { ParameterForm } from './ParameterForm';
import { ResultViewer } from './ResultViewer';
import { ExecutionHistory } from './ExecutionHistory';
import type { ToolSchema } from '../../../types/command-center';

interface ToolExecutorProps {
  tool: ToolSchema;
}

export function ToolExecutor({ tool }: ToolExecutorProps) {
  const {
    toolArgs,
    setToolArg,
    resetToolArgs,
    executeTool,
    currentExecution,
    executionHistory,
  } = useToolExecution();

  const [showHistory, setShowHistory] = React.useState(false);

  const isExecuting = currentExecution?.status === 'running';
  const canExecute = !tool.leaderOnly && !isExecuting;

  const handleExecute = async () => {
    if (!canExecute) return;
    await executeTool();
  };

  // Get history for current tool
  const toolHistory = executionHistory.filter((e) => e.toolName === tool.name);

  return (
    <div className="flex flex-col h-full">
      {/* Tool Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-semibold text-foreground">{tool.name}</h2>
            {tool.leaderOnly && (
              <div className="flex items-center gap-1 px-2 py-0.5 bg-amber-500/20 text-amber-500 rounded text-xs font-medium">
                <Lock className="w-3 h-3" />
                Leader Only
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            {toolHistory.length > 0 && (
              <button
                onClick={() => setShowHistory(!showHistory)}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  showHistory
                    ? 'bg-primary text-primary-foreground'
                    : 'bg-secondary text-muted-foreground hover:text-foreground'
                }`}
              >
                <History className="w-4 h-4" />
                History ({toolHistory.length})
              </button>
            )}
          </div>
        </div>

        {tool.description && (
          <p className="text-sm text-muted-foreground">{tool.description}</p>
        )}
      </div>

      {/* Main Content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Parameter Form & Result */}
        <div className="flex-1 flex flex-col overflow-hidden">
          {/* Parameters */}
          <div className="p-4 border-b border-border overflow-auto">
            <h3 className="text-sm font-medium text-foreground mb-3">Parameters</h3>

            {Object.keys(tool.inputSchema.properties).length > 0 ? (
              <ParameterForm
                schema={tool.inputSchema}
                values={toolArgs}
                onChange={setToolArg}
              />
            ) : (
              <p className="text-sm text-muted-foreground italic">
                This tool has no parameters.
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex items-center gap-3 mt-4 pt-4 border-t border-border">
              <button
                onClick={handleExecute}
                disabled={!canExecute}
                className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
                  canExecute
                    ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                    : 'bg-muted text-muted-foreground cursor-not-allowed'
                }`}
              >
                {isExecuting ? (
                  <>
                    <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    Executing...
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4" />
                    Execute
                  </>
                )}
              </button>

              <button
                onClick={resetToolArgs}
                className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-foreground hover:bg-secondary/80 transition-colors"
              >
                <RotateCcw className="w-4 h-4" />
                Reset
              </button>

              {tool.leaderOnly && (
                <span className="text-sm text-amber-500 ml-auto">
                  This tool requires leader privileges
                </span>
              )}
            </div>
          </div>

          {/* Result Viewer */}
          <div className="flex-1 overflow-hidden">
            <ResultViewer execution={currentExecution} />
          </div>
        </div>

        {/* History Panel */}
        {showHistory && (
          <div className="w-80 border-l border-border overflow-hidden">
            <ExecutionHistory
              history={toolHistory}
              onClose={() => setShowHistory(false)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

export default ToolExecutor;
