/**
 * AuthStep - API Key input or OAuth flow depending on selected method
 */
import React, { useState } from 'react';
import { Eye, EyeOff, CheckCircle2, XCircle, Loader2, ExternalLink, AlertTriangle } from 'lucide-react';
import { Button } from '../../ui/button';
import { AuthMethod, OAuthState, ApiKeyState } from '../../../types/onboarding';
import { cn } from '../../../lib/utils';

interface AuthStepProps {
  authMethod: AuthMethod;
  oauth: OAuthState;
  apiKey: ApiKeyState;
  onStartOAuth: () => void;
  onSetApiKey: (key: string) => void;
  onTestApiKey: () => void;
  onContinue: () => void;
  onBack: () => void;
}

export function AuthStep({
  authMethod,
  oauth,
  apiKey,
  onStartOAuth,
  onSetApiKey,
  onTestApiKey,
  onContinue,
  onBack,
}: AuthStepProps) {
  const [showKey, setShowKey] = useState(false);

  const isOAuthComplete = oauth.status === 'connected';
  const isApiKeyValid = apiKey.status === 'valid';
  const canContinue = authMethod === 'oauth' ? isOAuthComplete : isApiKeyValid;

  return (
    <div className="flex flex-col flex-1 p-8">
      {/* Header */}
      <div className="text-center mb-8">
        <h2 className="text-2xl font-bold text-white mb-2">
          {authMethod === 'oauth' ? 'Sign in with Anthropic' : 'Enter API Key'}
        </h2>
        <p className="text-muted-foreground">
          {authMethod === 'oauth'
            ? 'Connect your Anthropic account securely'
            : 'Paste your Anthropic API key to continue'}
        </p>
      </div>

      {/* Content */}
      <div className="flex-1 flex flex-col items-center justify-center max-w-md mx-auto w-full">
        {authMethod === 'oauth' ? (
          // OAuth Flow
          <div className="w-full space-y-6">
            {oauth.status === 'idle' && (
              <Button
                onClick={onStartOAuth}
                className="w-full py-6 text-base bg-white hover:bg-foreground text-black font-semibold"
              >
                <ExternalLink className="w-5 h-5 mr-2" />
                Connect with Anthropic
              </Button>
            )}

            {oauth.status === 'connecting' && (
              <div className="flex flex-col items-center gap-4 p-8 rounded-xl bg-card/50 border border-border">
                <Loader2 className="w-8 h-8 text-primary animate-spin" />
                <p className="text-foreground">Waiting for authentication...</p>
                <p className="text-xs text-muted-foreground">Complete sign-in in your browser</p>
              </div>
            )}

            {oauth.status === 'connected' && (
              <div className="flex flex-col items-center gap-4 p-8 rounded-xl bg-green-500/5 border border-green-500/20">
                <CheckCircle2 className="w-12 h-12 text-green-400" />
                <div className="text-center">
                  <p className="text-white font-medium">Connected!</p>
                  <p className="text-sm text-muted-foreground">{oauth.email}</p>
                </div>
              </div>
            )}

            {oauth.status === 'error' && (
              <div className="flex flex-col items-center gap-4 p-8 rounded-xl bg-red-500/5 border border-red-500/20">
                <XCircle className="w-12 h-12 text-red-400" />
                <div className="text-center">
                  <p className="text-white font-medium">Connection Failed</p>
                  <p className="text-sm text-red-400">{oauth.error}</p>
                </div>
                <Button
                  onClick={onStartOAuth}
                  variant="outline"
                  className="border-red-500/50 text-red-400 hover:bg-red-500/10"
                >
                  Try Again
                </Button>
              </div>
            )}
          </div>
        ) : (
          // API Key Flow
          <div className="w-full space-y-6">
            {/* API Key Input */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-foreground">API Key</label>
              <div className="relative">
                <input
                  type={showKey ? 'text' : 'password'}
                  value={apiKey.key}
                  onChange={(e) => onSetApiKey(e.target.value)}
                  placeholder="sk-ant-..."
                  className={cn(
                    'w-full px-4 py-3 pr-20 rounded-lg bg-card border text-white font-mono text-sm',
                    'focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent',
                    apiKey.status === 'valid' && 'border-green-500/50',
                    apiKey.status === 'invalid' && 'border-red-500/50',
                    apiKey.status === 'idle' && 'border-border',
                    apiKey.status === 'testing' && 'border-primary/50'
                  )}
                />
                <button
                  type="button"
                  onClick={() => setShowKey(!showKey)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                >
                  {showKey ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                </button>
              </div>

              {/* Status indicator */}
              {apiKey.status === 'testing' && (
                <div className="flex items-center gap-2 text-sm text-primary">
                  <Loader2 className="w-4 h-4 animate-spin" />
                  <span>Testing connection...</span>
                </div>
              )}
              {apiKey.status === 'valid' && (
                <div className="flex items-center gap-2 text-sm text-green-400">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>API key is valid</span>
                </div>
              )}
              {apiKey.status === 'invalid' && (
                <div className="flex items-center gap-2 text-sm text-red-400">
                  <XCircle className="w-4 h-4" />
                  <span>{apiKey.error || 'Invalid API key'}</span>
                </div>
              )}
            </div>

            {/* Test Connection Button */}
            <Button
              onClick={onTestApiKey}
              disabled={!apiKey.key || apiKey.status === 'testing'}
              variant="outline"
              className="w-full border-border hover:bg-secondary"
            >
              {apiKey.status === 'testing' ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Testing...
                </>
              ) : (
                'Test Connection'
              )}
            </Button>

            {/* Help text */}
            <div className="flex items-start gap-3 p-4 rounded-lg bg-card/50 border border-border">
              <AlertTriangle className="w-5 h-5 text-amber-400 flex-shrink-0 mt-0.5" />
              <div className="text-sm">
                <p className="text-foreground mb-1">Get your API key from Anthropic Console</p>
                <a
                  href="https://console.anthropic.com/settings/keys"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary hover:underline inline-flex items-center gap-1"
                >
                  console.anthropic.com/settings/keys
                  <ExternalLink className="w-3 h-3" />
                </a>
              </div>
            </div>
          </div>
        )}
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
          disabled={!canContinue}
          className="bg-primary hover:bg-[#c5c76a] text-background disabled:opacity-50 disabled:cursor-not-allowed"
        >
          Continue
        </Button>
      </div>
    </div>
  );
}
