/**
 * WelcomeStep - First step of onboarding wizard
 * Introduces Kuroryuu with branding and get-started message
 */
import React from 'react';
import { Sparkles, Zap, Shield, Brain } from 'lucide-react';
import { Button } from '../../ui/button';

interface WelcomeStepProps {
  onContinue: () => void;
}

export function WelcomeStep({ onContinue }: WelcomeStepProps) {
  return (
    <div className="flex flex-col items-center justify-center flex-1 p-8 text-center">
      {/* Logo/Icon */}
      <div className="relative mb-8">
        <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-[#D6D876] to-[#a8a858] flex items-center justify-center shadow-2xl shadow-[#D6D876]/20">
          <Sparkles className="w-12 h-12 text-background" />
        </div>
        <div className="absolute -bottom-2 -right-2 w-8 h-8 rounded-lg bg-background border border-primary/50 flex items-center justify-center">
          <span className="text-xs font-bold text-primary">AI</span>
        </div>
      </div>

      {/* Title */}
      <h1 className="text-3xl font-bold text-white mb-3">
        Welcome to <span className="text-primary">Kuroryuu</span>
      </h1>

      {/* Subtitle */}
      <p className="text-muted-foreground text-lg mb-8 max-w-md">
        Build software autonomously with AI-powered agents that understand your codebase and execute tasks intelligently.
      </p>

      {/* Feature highlights */}
      <div className="grid grid-cols-3 gap-6 mb-10 max-w-xl">
        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card/50 border border-border">
          <div className="w-10 h-10 rounded-lg bg-blue-500/10 flex items-center justify-center">
            <Zap className="w-5 h-5 text-blue-400" />
          </div>
          <span className="text-sm font-medium text-white">Fast Execution</span>
          <span className="text-xs text-muted-foreground text-center">Parallel agent processing</span>
        </div>

        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card/50 border border-border">
          <div className="w-10 h-10 rounded-lg bg-green-500/10 flex items-center justify-center">
            <Shield className="w-5 h-5 text-green-400" />
          </div>
          <span className="text-sm font-medium text-white">Secure</span>
          <span className="text-xs text-muted-foreground text-center">Your data stays local</span>
        </div>

        <div className="flex flex-col items-center gap-2 p-4 rounded-xl bg-card/50 border border-border">
          <div className="w-10 h-10 rounded-lg bg-purple-500/10 flex items-center justify-center">
            <Brain className="w-5 h-5 text-purple-400" />
          </div>
          <span className="text-sm font-medium text-white">Intelligent</span>
          <span className="text-xs text-muted-foreground text-center">Context-aware memory</span>
        </div>
      </div>

      {/* CTA */}
      <Button
        onClick={onContinue}
        className="px-8 py-3 text-base bg-primary hover:bg-[#c5c76a] text-background font-semibold rounded-lg transition-all duration-200 hover:scale-105"
      >
        Get Started
      </Button>

      {/* Skip link */}
      <p className="mt-6 text-xs text-muted-foreground">
        Already set up?{' '}
        <button 
          onClick={onContinue}
          className="text-muted-foreground hover:text-primary underline"
        >
          Skip setup
        </button>
      </p>
    </div>
  );
}
