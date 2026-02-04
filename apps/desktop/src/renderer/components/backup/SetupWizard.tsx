/**
 * SetupWizard - First-run setup for backup configuration
 *
 * Steps:
 * 1. Select source directory
 * 2. Set repository password
 * 3. Configure exclusions
 * 4. Initialize repository
 */

import { useState, useEffect } from 'react';
import {
  FolderOpen,
  Lock,
  Filter,
  Rocket,
  ChevronRight,
  ChevronLeft,
  Check,
  AlertCircle,
  RefreshCw,
  Eye,
  EyeOff,
  Plus,
  X,
  Download,
} from 'lucide-react';
import { useBackupStore } from '../../stores/backup-store';
import type { BackupConfig } from '../../types/backup';

// ============================================================================
// Types
// ============================================================================

type WizardStep = 'source' | 'password' | 'exclusions' | 'initialize';

interface StepProps {
  onNext: () => void;
  onBack?: () => void;
  config: Partial<BackupConfig>;
  setConfig: (config: Partial<BackupConfig>) => void;
}

// ============================================================================
// Step Components
// ============================================================================

function SourceStep({ onNext, config, setConfig }: StepProps) {
  const [sourcePath, setSourcePath] = useState(config?.backup?.source_path || '');
  const [error, setError] = useState<string | null>(null);

  const handleSelectFolder = async () => {
    const result = await window.electronAPI.backup.selectSourceDir();
    if (result.ok && result.data?.path) {
      setSourcePath(result.data.path);
      setError(null);
    }
  };

  const handleNext = async () => {
    if (!sourcePath) {
      setError('Please select a source directory');
      return;
    }

    // Create default config with source path
    const defaultConfig = await useBackupStore.getState().createDefaultConfig(sourcePath);
    if (defaultConfig) {
      setConfig(defaultConfig);
      onNext();
    } else {
      setError('Failed to create configuration');
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
          <FolderOpen className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Select Source Directory</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Choose the folder you want to back up
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={sourcePath}
            onChange={(e) => setSourcePath(e.target.value)}
            placeholder="Select or enter directory path..."
            className="flex-1 px-4 py-2 bg-secondary/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={handleSelectFolder}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            Browse...
          </button>
        </div>

        {error && (
          <div className="flex items-center gap-2 text-red-500 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <p className="text-xs text-muted-foreground">
          This will be the root directory for your backups. All files and subdirectories
          will be included unless explicitly excluded.
        </p>
      </div>

      <div className="flex justify-end pt-4">
        <button
          onClick={handleNext}
          className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function PasswordStep({ onNext, onBack, config, setConfig }: StepProps) {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleNext = () => {
    if (!password) {
      setError('Please enter a password');
      return;
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    // Store password temporarily (will be used in initialize step)
    (window as any).__backupPassword = password;
    onNext();
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
          <Lock className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Set Repository Password</h2>
        <p className="text-sm text-muted-foreground mt-1">
          This password encrypts your backups. Keep it safe - it cannot be recovered.
        </p>
      </div>

      <div className="space-y-4">
        <div className="relative">
          <input
            type={showPassword ? 'text' : 'password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Enter password..."
            className="w-full px-4 py-2 pr-10 bg-secondary/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            type="button"
            onClick={() => setShowPassword(!showPassword)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
          >
            {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
          </button>
        </div>

        <input
          type={showPassword ? 'text' : 'password'}
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          placeholder="Confirm password..."
          className="w-full px-4 py-2 bg-secondary/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
        />

        {error && (
          <div className="flex items-center gap-2 text-red-500 text-sm">
            <AlertCircle className="w-4 h-4" />
            {error}
          </div>
        )}

        <div className="p-4 bg-amber-500/10 border border-amber-500/30 rounded-lg">
          <div className="flex items-start gap-2">
            <AlertCircle className="w-5 h-5 text-amber-500 flex-shrink-0 mt-0.5" />
            <div className="text-sm text-amber-200">
              <p className="font-medium">Important</p>
              <p className="text-amber-200/70">
                Store this password securely. Without it, you cannot restore your backups.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleNext}
          className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function ExclusionsStep({ onNext, onBack, config, setConfig }: StepProps) {
  const [exclusions, setExclusions] = useState<string[]>(config?.backup?.exclusions || []);
  const [newExclusion, setNewExclusion] = useState('');

  const addExclusion = () => {
    if (newExclusion && !exclusions.includes(newExclusion)) {
      setExclusions([...exclusions, newExclusion]);
      setNewExclusion('');
    }
  };

  const removeExclusion = (pattern: string) => {
    setExclusions(exclusions.filter((e) => e !== pattern));
  };

  const handleNext = () => {
    setConfig({
      ...config,
      backup: {
        ...config.backup!,
        exclusions,
      },
    });
    onNext();
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
          <Filter className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Configure Exclusions</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Exclude files and folders from backups (e.g., node_modules, .git)
        </p>
      </div>

      <div className="space-y-4">
        <div className="flex gap-2">
          <input
            type="text"
            value={newExclusion}
            onChange={(e) => setNewExclusion(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && addExclusion()}
            placeholder="Add pattern (e.g., **/node_modules/)"
            className="flex-1 px-4 py-2 bg-secondary/50 border border-border rounded-lg text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          />
          <button
            onClick={addExclusion}
            className="px-4 py-2 bg-primary text-primary-foreground rounded-lg text-sm font-medium hover:bg-primary/90 transition-colors"
          >
            <Plus className="w-4 h-4" />
          </button>
        </div>

        <div className="max-h-48 overflow-y-auto space-y-1">
          {exclusions.map((pattern) => (
            <div
              key={pattern}
              className="flex items-center justify-between px-3 py-2 bg-secondary/50 rounded-lg group"
            >
              <code className="text-sm text-foreground">{pattern}</code>
              <button
                onClick={() => removeExclusion(pattern)}
                className="text-muted-foreground hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          ))}
        </div>

        {exclusions.length === 0 && (
          <p className="text-center text-sm text-muted-foreground py-4">
            No exclusions configured. All files will be backed up.
          </p>
        )}
      </div>

      <div className="flex justify-between pt-4">
        <button
          onClick={onBack}
          className="flex items-center gap-2 px-6 py-2 text-muted-foreground hover:text-foreground transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Back
        </button>
        <button
          onClick={handleNext}
          className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Next
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function InitializeStep({ onBack, config }: StepProps) {
  const { saveConfig, initRepository, ensureRestic, setShowSetupWizard } = useBackupStore();
  const [status, setStatus] = useState<'idle' | 'restic' | 'init' | 'saving' | 'done' | 'error'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [resticStatus, setResticStatus] = useState<{ installed: boolean; downloading?: boolean } | null>(null);

  const handleInitialize = async () => {
    setStatus('restic');
    setError(null);

    try {
      // Step 1: Ensure restic is installed
      const restic = await ensureRestic();
      if (!restic?.installed) {
        setResticStatus({ installed: false, downloading: true });
        // Wait and retry
        await new Promise((r) => setTimeout(r, 2000));
        const retryRestic = await ensureRestic();
        if (!retryRestic?.installed) {
          throw new Error('Failed to install Restic. Please try again.');
        }
      }
      setResticStatus({ installed: true });

      // Step 2: Initialize repository
      setStatus('init');
      const password = (window as any).__backupPassword;
      if (!password) {
        throw new Error('Password not set. Please go back and set a password.');
      }

      const initResult = await initRepository(password);
      if (!initResult) {
        throw new Error('Failed to initialize repository');
      }

      // Step 3: Save config
      setStatus('saving');
      await saveConfig(config as BackupConfig);

      // Clean up password
      delete (window as any).__backupPassword;

      setStatus('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unknown error occurred');
      setStatus('error');
    }
  };

  const handleFinish = () => {
    setShowSetupWizard(false);
  };

  return (
    <div className="space-y-6">
      <div className="text-center mb-8">
        <div className="w-16 h-16 rounded-full bg-primary/20 flex items-center justify-center mx-auto mb-4">
          <Rocket className="w-8 h-8 text-primary" />
        </div>
        <h2 className="text-xl font-semibold text-foreground">Initialize Repository</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Ready to set up your backup repository
        </p>
      </div>

      {/* Progress Steps */}
      <div className="space-y-3">
        <ProgressItem
          label="Download Restic"
          status={
            status === 'idle'
              ? 'pending'
              : status === 'restic'
              ? 'active'
              : resticStatus?.installed
              ? 'done'
              : 'pending'
          }
        />
        <ProgressItem
          label="Initialize Repository"
          status={
            status === 'init' ? 'active' : ['saving', 'done'].includes(status) ? 'done' : 'pending'
          }
        />
        <ProgressItem
          label="Save Configuration"
          status={status === 'saving' ? 'active' : status === 'done' ? 'done' : 'pending'}
        />
      </div>

      {error && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-red-500">
            <AlertCircle className="w-5 h-5" />
            <span className="text-sm">{error}</span>
          </div>
        </div>
      )}

      {status === 'done' && (
        <div className="p-4 bg-green-500/10 border border-green-500/30 rounded-lg">
          <div className="flex items-center gap-2 text-green-500">
            <Check className="w-5 h-5" />
            <span className="text-sm">Repository initialized successfully!</span>
          </div>
        </div>
      )}

      {/* Summary */}
      <div className="p-4 bg-secondary/50 rounded-lg space-y-2">
        <h4 className="text-sm font-medium text-foreground">Configuration Summary</h4>
        <div className="text-xs text-muted-foreground space-y-1">
          <p>
            <span className="text-foreground">Source:</span> {config?.backup?.source_path}
          </p>
          <p>
            <span className="text-foreground">Repository:</span> {config?.repository?.path}
          </p>
          <p>
            <span className="text-foreground">Exclusions:</span> {config?.backup?.exclusions?.length || 0} patterns
          </p>
        </div>
      </div>

      <div className="flex justify-between pt-4">
        {status !== 'done' && (
          <button
            onClick={onBack}
            disabled={['restic', 'init', 'saving'].includes(status)}
            className="flex items-center gap-2 px-6 py-2 text-muted-foreground hover:text-foreground transition-colors disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
            Back
          </button>
        )}
        {status === 'idle' || status === 'error' ? (
          <button
            onClick={handleInitialize}
            className="flex items-center gap-2 px-6 py-2 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors ml-auto"
          >
            Initialize
            <Rocket className="w-4 h-4" />
          </button>
        ) : status === 'done' ? (
          <button
            onClick={handleFinish}
            className="flex items-center gap-2 px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition-colors ml-auto"
          >
            Get Started
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground ml-auto">
            <RefreshCw className="w-4 h-4 animate-spin" />
            <span className="text-sm">Initializing...</span>
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressItem({
  label,
  status,
}: {
  label: string;
  status: 'pending' | 'active' | 'done';
}) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-6 h-6 rounded-full flex items-center justify-center ${
          status === 'done'
            ? 'bg-green-500'
            : status === 'active'
            ? 'bg-primary'
            : 'bg-secondary'
        }`}
      >
        {status === 'done' ? (
          <Check className="w-4 h-4 text-white" />
        ) : status === 'active' ? (
          <RefreshCw className="w-3 h-3 text-white animate-spin" />
        ) : (
          <span className="w-2 h-2 rounded-full bg-muted-foreground" />
        )}
      </div>
      <span
        className={`text-sm ${
          status === 'done'
            ? 'text-green-500'
            : status === 'active'
            ? 'text-foreground'
            : 'text-muted-foreground'
        }`}
      >
        {label}
      </span>
    </div>
  );
}

// ============================================================================
// Main Wizard Component
// ============================================================================

export function SetupWizard() {
  const [step, setStep] = useState<WizardStep>('source');
  const [config, setConfig] = useState<Partial<BackupConfig>>({});

  const steps: WizardStep[] = ['source', 'password', 'exclusions', 'initialize'];
  const currentIndex = steps.indexOf(step);

  const handleNext = () => {
    const nextIndex = currentIndex + 1;
    if (nextIndex < steps.length) {
      setStep(steps[nextIndex]);
    }
  };

  const handleBack = () => {
    const prevIndex = currentIndex - 1;
    if (prevIndex >= 0) {
      setStep(steps[prevIndex]);
    }
  };

  const renderStep = () => {
    const props: StepProps = {
      onNext: handleNext,
      onBack: handleBack,
      config,
      setConfig,
    };

    switch (step) {
      case 'source':
        return <SourceStep {...props} />;
      case 'password':
        return <PasswordStep {...props} />;
      case 'exclusions':
        return <ExclusionsStep {...props} />;
      case 'initialize':
        return <InitializeStep {...props} />;
      default:
        return <SourceStep {...props} />;
    }
  };

  return (
    <div className="max-w-lg mx-auto py-8">
      {/* Progress Indicator */}
      <div className="flex items-center justify-center gap-2 mb-8">
        {steps.map((s, i) => (
          <div
            key={s}
            className={`w-2 h-2 rounded-full transition-colors ${
              i <= currentIndex ? 'bg-primary' : 'bg-secondary'
            }`}
          />
        ))}
      </div>

      {renderStep()}
    </div>
  );
}

export default SetupWizard;
