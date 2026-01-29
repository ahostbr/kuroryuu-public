/**
 * PrivacyStep - Privacy policy acceptance and data sharing toggles
 */
import React from 'react';
import { Shield, ExternalLink, Check } from 'lucide-react';
import { Button } from '../../ui/button';
import { PrivacyConfig } from '../../../types/onboarding';
import { cn } from '../../../lib/utils';

interface PrivacyStepProps {
  config: PrivacyConfig;
  onUpdatePrivacy: (updates: Partial<PrivacyConfig>) => void;
  onContinue: () => void;
  onBack: () => void;
}

interface ToggleProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  label: string;
  description?: string;
  required?: boolean;
}

function Toggle({ checked, onChange, label, description, required }: ToggleProps) {
  return (
    <button
      onClick={() => onChange(!checked)}
      className={cn(
        'w-full flex items-start gap-4 p-4 rounded-xl border-2 transition-all duration-200 text-left',
        checked ? 'border-primary/30 bg-primary/5' : 'border-border bg-card/50 hover:border-border'
      )}
    >
      <div
        className={cn(
          'w-6 h-6 rounded-md border-2 flex items-center justify-center flex-shrink-0 mt-0.5 transition-all',
          checked ? 'border-primary bg-primary' : 'border-muted bg-transparent'
        )}
      >
        {checked && <Check className="w-4 h-4 text-background" />}
      </div>
      <div className="flex-1">
        <div className="flex items-center gap-2">
          <span className="font-medium text-white">{label}</span>
          {required && (
            <span className="px-1.5 py-0.5 text-[10px] font-medium bg-red-500/20 text-red-400 rounded">
              REQUIRED
            </span>
          )}
        </div>
        {description && <p className="text-sm text-muted-foreground mt-1">{description}</p>}
      </div>
    </button>
  );
}

export function PrivacyStep({ config, onUpdatePrivacy, onContinue, onBack }: PrivacyStepProps) {
  const canContinue = config.acceptedTerms && config.acceptedPrivacyPolicy;

  return (
    <div className="flex flex-col flex-1 p-8 overflow-hidden">
      {/* Header */}
      <div className="text-center mb-6 flex-shrink-0">
        <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mx-auto mb-4">
          <Shield className="w-7 h-7 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-white mb-2">Privacy & Data</h2>
        <p className="text-muted-foreground">
          Review our privacy practices and choose your data sharing preferences
        </p>
      </div>

      {/* Content - scrollable */}
      <div className="flex-1 overflow-y-auto min-h-0">
        <div className="max-w-lg mx-auto space-y-4 pb-4">
          {/* Required agreements */}
          <div className="space-y-3">
            <h3 className="text-xs text-muted-foreground uppercase tracking-wider px-1">Legal Agreements</h3>
            
            <Toggle
              checked={config.acceptedTerms}
              onChange={(checked) => onUpdatePrivacy({ acceptedTerms: checked })}
              label="Terms of Service"
              description="I agree to the Kuroryuu Terms of Service"
              required
            />

            <Toggle
              checked={config.acceptedPrivacyPolicy}
              onChange={(checked) => onUpdatePrivacy({ acceptedPrivacyPolicy: checked })}
              label="Privacy Policy"
              description="I have read and accept the Privacy Policy"
              required
            />
          </div>

          {/* Optional data sharing */}
          <div className="space-y-3 pt-4">
            <h3 className="text-xs text-muted-foreground uppercase tracking-wider px-1">Optional Data Sharing</h3>
            
            <Toggle
              checked={config.sendErrorReports}
              onChange={(checked) => onUpdatePrivacy({ sendErrorReports: checked })}
              label="Send Error Reports"
              description="Help us improve by automatically sending crash reports and error logs"
            />

            <Toggle
              checked={config.sendUsageAnalytics}
              onChange={(checked) => onUpdatePrivacy({ sendUsageAnalytics: checked })}
              label="Usage Analytics"
              description="Share anonymous usage statistics to help improve the product"
            />

            <Toggle
              checked={config.shareAnonymousData}
              onChange={(checked) => onUpdatePrivacy({ shareAnonymousData: checked })}
              label="Anonymous Improvement Data"
              description="Share anonymized interaction patterns to improve AI responses"
            />
          </div>

          {/* Links */}
          <div className="flex items-center justify-center gap-4 pt-4 text-sm">
            <a
              href="https://anthropic.com/terms"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            >
              Terms of Service
              <ExternalLink className="w-3 h-3" />
            </a>
            <span className="text-muted">•</span>
            <a
              href="https://anthropic.com/privacy"
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-primary inline-flex items-center gap-1"
            >
              Privacy Policy
              <ExternalLink className="w-3 h-3" />
            </a>
          </div>

          {/* Info box */}
          <div className="p-4 rounded-lg bg-card/50 border border-border mt-4">
            <p className="text-sm text-muted-foreground">
              <span className="text-foreground">Your data stays local.</span> Your code and project files 
              are never sent to our servers. Only the prompts you explicitly send to Claude are processed.
            </p>
          </div>
        </div>
      </div>

      {/* Navigation buttons - always visible */}
      <div className="flex items-center justify-between pt-6 border-t border-border flex-shrink-0">
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
          {canContinue ? 'Continue' : 'Accept to Continue'}
        </Button>
      </div>
    </div>
  );
}
