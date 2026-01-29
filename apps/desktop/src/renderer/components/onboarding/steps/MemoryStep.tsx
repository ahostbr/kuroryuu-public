/**
 * MemoryStep - Configure Graphiti AI memory (optional)
 */
import React, { useState } from 'react';
import { Brain, Database, Eye, EyeOff, AlertTriangle, CheckCircle2, Settings2 } from 'lucide-react';
import { Button } from '../../ui/button';
import { MemoryConfig } from '../../../types/onboarding';
import { cn } from '../../../lib/utils';

interface MemoryStepProps {
  config: MemoryConfig;
  onUpdateMemory: (updates: Partial<MemoryConfig>) => void;
  onContinue: () => void;
  onSkip: () => void;
  onBack: () => void;
}

export function MemoryStep({ config, onUpdateMemory, onContinue, onSkip, onBack }: MemoryStepProps) {
  const [showPassword, setShowPassword] = useState(false);
  const [showAdvanced, setShowAdvanced] = useState(false);

  return (
    <div className="flex flex-col flex-1 p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <div className="w-14 h-14 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-4">
          <Brain className="w-7 h-7 text-purple-400" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">AI Memory</h2>
        <p className="text-muted-foreground">
          Enable Graphiti to give Claude long-term memory across conversations
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto">
        <div className="max-w-lg mx-auto space-y-6">
          {/* Enable toggle */}
          <button
            onClick={() => onUpdateMemory({ enabled: !config.enabled })}
            className={cn(
              'w-full flex items-start gap-4 p-5 rounded-xl border-2 transition-all duration-200 text-left',
              config.enabled
                ? 'border-purple-500/30 bg-purple-500/5'
                : 'border-border bg-card/50 hover:border-border'
            )}
          >
            <div
              className={cn(
                'w-12 h-6 rounded-full p-1 transition-all duration-200 flex-shrink-0',
                config.enabled ? 'bg-purple-500' : 'bg-muted'
              )}
            >
              <div
                className={cn(
                  'w-4 h-4 rounded-full bg-white transition-transform duration-200',
                  config.enabled ? 'translate-x-6' : 'translate-x-0'
                )}
              />
            </div>
            <div className="flex-1">
              <span className="font-medium text-white">Enable Graphiti Memory</span>
              <p className="text-sm text-muted-foreground mt-1">
                Claude will remember context from previous conversations, making interactions more personalized and efficient.
              </p>
            </div>
          </button>

          {/* Configuration (if enabled) */}
          {config.enabled && (
            <div className="space-y-4 pl-2">
              {/* Auto-sync toggle */}
              <label className="flex items-center justify-between p-4 rounded-lg bg-card/50 border border-border">
                <div>
                  <span className="text-sm text-white">Auto-sync conversations</span>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    Automatically save conversation context to memory
                  </p>
                </div>
                <button
                  onClick={() => onUpdateMemory({ autoSyncConversations: !config.autoSyncConversations })}
                  className={cn(
                    'w-10 h-5 rounded-full p-0.5 transition-all duration-200',
                    config.autoSyncConversations ? 'bg-purple-500' : 'bg-muted'
                  )}
                >
                  <div
                    className={cn(
                      'w-4 h-4 rounded-full bg-white transition-transform duration-200',
                      config.autoSyncConversations ? 'translate-x-5' : 'translate-x-0'
                    )}
                  />
                </button>
              </label>

              {/* Advanced settings toggle */}
              <button
                onClick={() => setShowAdvanced(!showAdvanced)}
                className="flex items-center gap-2 text-sm text-muted-foreground hover:text-white"
              >
                <Settings2 className="w-4 h-4" />
                <span>{showAdvanced ? 'Hide' : 'Show'} advanced settings</span>
              </button>

              {/* Advanced configuration */}
              {showAdvanced && (
                <div className="space-y-4 p-4 rounded-lg bg-card/50 border border-border">
                  {/* Neo4j URI */}
                  <div className="space-y-2">
                    <label className="text-sm text-foreground">Neo4j URI</label>
                    <input
                      type="text"
                      value={config.neo4jUri || ''}
                      onChange={(e) => onUpdateMemory({ neo4jUri: e.target.value })}
                      placeholder="bolt://localhost:7687"
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>

                  {/* Neo4j User */}
                  <div className="space-y-2">
                    <label className="text-sm text-foreground">Neo4j Username</label>
                    <input
                      type="text"
                      value={config.neo4jUser || ''}
                      onChange={(e) => onUpdateMemory({ neo4jUser: e.target.value })}
                      placeholder="neo4j"
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                  </div>

                  {/* Neo4j Password */}
                  <div className="space-y-2">
                    <label className="text-sm text-foreground">Neo4j Password</label>
                    <div className="relative">
                      <input
                        type={showPassword ? 'text' : 'password'}
                        value={config.neo4jPassword || ''}
                        onChange={(e) => onUpdateMemory({ neo4jPassword: e.target.value })}
                        placeholder="••••••••"
                        className="w-full px-3 py-2 pr-10 rounded-lg bg-secondary border border-border text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                      >
                        {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>

                  {/* Max memory nodes */}
                  <div className="space-y-2">
                    <label className="text-sm text-foreground">Max Memory Nodes</label>
                    <input
                      type="number"
                      value={config.maxMemoryNodes}
                      onChange={(e) => onUpdateMemory({ maxMemoryNodes: parseInt(e.target.value) || 1000 })}
                      min={100}
                      max={10000}
                      className="w-full px-3 py-2 rounded-lg bg-secondary border border-border text-white text-sm focus:outline-none focus:ring-2 focus:ring-purple-500 focus:border-transparent"
                    />
                    <p className="text-xs text-muted-foreground">Maximum number of memory nodes to store</p>
                  </div>
                </div>
              )}

              {/* Info box */}
              <div className="flex items-start gap-3 p-4 rounded-lg bg-purple-500/5 border border-purple-500/20">
                <Database className="w-5 h-5 text-purple-400 flex-shrink-0 mt-0.5" />
                <div className="text-sm">
                  <p className="text-foreground mb-1">Local memory storage</p>
                  <p className="text-muted-foreground text-xs">
                    Graphiti uses a local Neo4j database to store conversation context. 
                    Your memories never leave your machine.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Disabled state hint */}
          {!config.enabled && (
            <div className="flex items-start gap-3 p-4 rounded-lg bg-card/50 border border-border">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-foreground">Memory is optional</p>
                <p className="text-muted-foreground text-xs mt-1">
                  You can enable this feature later in Settings if you change your mind.
                </p>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Navigation buttons */}
      <div className="flex items-center justify-between mt-8 pt-6 border-t border-border">
        <Button
          variant="ghost"
          onClick={onBack}
          className="text-muted-foreground hover:text-white"
        >
          Back
        </Button>
        <div className="flex items-center gap-3">
          <Button
            variant="ghost"
            onClick={onSkip}
            className="text-muted-foreground hover:text-white"
          >
            Skip
          </Button>
          <Button
            onClick={onContinue}
            className="bg-primary hover:bg-[#c5c76a] text-background"
          >
            Continue
          </Button>
        </div>
      </div>
    </div>
  );
}
