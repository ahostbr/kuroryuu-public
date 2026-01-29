/**
 * AuthMethodStep - Choose between OAuth, API Key, or Local LLM (LM Studio)
 */
import React from 'react';
import { KeyRound, ExternalLink, Check, Server, Zap } from 'lucide-react';
import { Button } from '../../ui/button';
import { AuthMethod } from '../../../types/onboarding';
import { cn } from '../../../lib/utils';

interface AuthMethodStepProps {
  selectedMethod: AuthMethod | null;
  onSelectMethod: (method: AuthMethod) => void;
  onContinue: () => void;
  onBack: () => void;
}

export function AuthMethodStep({ 
  selectedMethod, 
  onSelectMethod, 
  onContinue, 
  onBack 
}: AuthMethodStepProps) {
  return (
    <div className="flex flex-col flex-1 p-8 overflow-y-auto">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">Choose Your LLM Provider</h2>
        <p className="text-muted-foreground">
          Select how you'd like to connect to AI services
        </p>
      </div>

      {/* Auth options */}
      <div className="flex-1 flex flex-col gap-4 max-w-lg mx-auto w-full">
        {/* Local LLM Option (LM Studio) - Primary for testing */}
        <button
          onClick={() => onSelectMethod('local-llm')}
          className={cn(
            'relative flex items-start gap-4 p-6 rounded-xl border-2 transition-all duration-200 text-left',
            selectedMethod === 'local-llm'
              ? 'border-primary bg-primary/5'
              : 'border-border bg-card/50 hover:border-border'
          )}
        >
          {/* Selection indicator */}
          <div className={cn(
            'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
            selectedMethod === 'local-llm' 
              ? 'border-primary bg-primary' 
              : 'border-muted'
          )}>
            {selectedMethod === 'local-llm' && <Check className="w-4 h-4 text-background" />}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <Server className="w-5 h-5 text-purple-400" />
              <span className="font-semibold text-white">Local LLM (LM Studio)</span>
              <span className="px-2 py-0.5 text-[10px] font-medium bg-purple-500/20 text-purple-400 rounded">
                FASTEST SETUP
              </span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Connect to LM Studio or other local OpenAI-compatible servers. No API key needed.
            </p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <Zap className="w-3 h-3 text-primary" />
                <span>No API key required</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3 h-3 text-purple-400" />
                <span>100% offline / private</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3 h-3 text-purple-400" />
                <span>Works with Devstral, Qwen, Llama, etc.</span>
              </li>
            </ul>
          </div>
        </button>

        {/* OAuth Option */}
        <button
          onClick={() => onSelectMethod('oauth')}
          className={cn(
            'relative flex items-start gap-4 p-6 rounded-xl border-2 transition-all duration-200 text-left',
            selectedMethod === 'oauth'
              ? 'border-primary bg-primary/5'
              : 'border-border bg-card/50 hover:border-border'
          )}
        >
          {/* Selection indicator */}
          <div className={cn(
            'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
            selectedMethod === 'oauth' 
              ? 'border-primary bg-primary' 
              : 'border-muted'
          )}>
            {selectedMethod === 'oauth' && <Check className="w-4 h-4 text-background" />}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <ExternalLink className="w-5 h-5 text-primary" />
              <span className="font-semibold text-white">Sign in with Anthropic</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Securely connect your Anthropic account via OAuth.
            </p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <Check className="w-3 h-3 text-green-400" />
                <span>Automatic token refresh</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3 h-3 text-green-400" />
                <span>Usage dashboard access</span>
              </li>
            </ul>
          </div>
        </button>

        {/* API Key Option */}
        <button
          onClick={() => onSelectMethod('api-key')}
          className={cn(
            'relative flex items-start gap-4 p-6 rounded-xl border-2 transition-all duration-200 text-left',
            selectedMethod === 'api-key'
              ? 'border-primary bg-primary/5'
              : 'border-border bg-card/50 hover:border-border'
          )}
        >
          {/* Selection indicator */}
          <div className={cn(
            'w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 mt-0.5',
            selectedMethod === 'api-key' 
              ? 'border-primary bg-primary' 
              : 'border-muted'
          )}>
            {selectedMethod === 'api-key' && <Check className="w-4 h-4 text-background" />}
          </div>

          <div className="flex-1">
            <div className="flex items-center gap-2 mb-1">
              <KeyRound className="w-5 h-5 text-orange-400" />
              <span className="font-semibold text-white">Use API Key</span>
            </div>
            <p className="text-sm text-muted-foreground mb-3">
              Enter your Anthropic or OpenAI API key directly.
            </p>
            <ul className="space-y-1.5 text-xs text-muted-foreground">
              <li className="flex items-center gap-2">
                <Check className="w-3 h-3 text-muted-foreground" />
                <span>Direct API access</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="w-3 h-3 text-muted-foreground" />
                <span>Custom rate limits</span>
              </li>
            </ul>
          </div>
        </button>
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
        <Button
          onClick={onContinue}
          disabled={!selectedMethod}
          className="bg-primary hover:bg-[#c5c76a] text-background disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
