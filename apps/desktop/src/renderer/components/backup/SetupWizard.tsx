/**
 * SetupWizard - First-run setup for backup configuration
 *
 * Steps:
 * 0. Welcome/Introduction - Overview of backup features
 * 1. Select source directory
 * 2. Set repository password
 * 3. Configure exclusions
 * 4. Initialize repository
 */

import { useState, useEffect, useRef } from 'react';
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
  Shield,
  History,
  HardDrive,
  Zap,
  GitBranch,
  Clock,
  Database,
} from 'lucide-react';
import { useBackupStore } from '../../stores/backup-store';
import { useSettingsStore } from '../../stores/settings-store';
import type { BackupConfig } from '../../types/backup';

// ============================================================================
// Types
// ============================================================================

type WizardStep = 'welcome' | 'source' | 'password' | 'exclusions' | 'initialize';

interface StepProps {
  onNext: () => void;
  onBack?: () => void;
  config: Partial<BackupConfig>;
  setConfig: (config: Partial<BackupConfig>) => void;
  passwordRef?: React.MutableRefObject<string>;
}

// ============================================================================
// Step Components
// ============================================================================

function WelcomeStep({ onNext }: StepProps) {
  return (
    <div className="space-y-6">
      {/* Hero Section */}
      <div className="text-center mb-6">
        <div className="w-20 h-20 rounded-full bg-gradient-to-br from-primary/30 to-primary/10 flex items-center justify-center mx-auto mb-4 ring-4 ring-primary/20">
          <Database className="w-10 h-10 text-primary" />
        </div>
        <h2 className="text-2xl font-bold text-foreground">Welcome to Backup</h2>
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto">
          Enterprise-grade backup protection for your important files, powered by Restic
        </p>
      </div>

      {/* Feature Grid */}
      <div className="grid grid-cols-2 gap-3">
        <FeatureCard
          icon={<Shield className="w-5 h-5" />}
          title="AES-256 Encryption"
          description="Your backups are encrypted with military-grade security. Only you can access them."
        />
        <FeatureCard
          icon={<Zap className="w-5 h-5" />}
          title="Fast & Efficient"
          description="Deduplication ensures only changed data is stored, saving space and time."
        />
        <FeatureCard
          icon={<GitBranch className="w-5 h-5" />}
          title="Git-like Snapshots"
          description="Browse and restore from any point in time with versioned snapshots."
        />
        <FeatureCard
          icon={<Clock className="w-5 h-5" />}
          title="Retention Policies"
          description="Automatic cleanup keeps daily, weekly, and monthly backups organized."
        />
      </div>

      {/* Setup Steps Preview */}
      <div className="p-4 bg-secondary/30 rounded-lg border border-border/50">
        <h4 className="text-sm font-semibold text-foreground mb-3 flex items-center gap-2">
          <History className="w-4 h-4 text-primary" />
          Setup Process
        </h4>
        <div className="space-y-2.5">
          <SetupStepPreview
            number={1}
            title="Choose Source"
            description="Select the folder you want to protect"
          />
          <SetupStepPreview
            number={2}
            title="Set Password"
            description="Create an encryption password (store it safely!)"
          />
          <SetupStepPreview
            number={3}
            title="Configure Exclusions"
            description="Optionally exclude files like node_modules"
          />
          <SetupStepPreview
            number={4}
            title="Initialize"
            description="Create your encrypted backup repository"
          />
        </div>
      </div>

      {/* Requirements Note */}
      <div className="p-3 bg-primary/5 border border-primary/20 rounded-lg">
        <div className="flex items-start gap-2">
          <HardDrive className="w-4 h-4 text-primary flex-shrink-0 mt-0.5" />
          <div className="text-xs text-muted-foreground">
            <span className="text-foreground font-medium">Storage:</span> Backups are stored locally in{' '}
            <code className="text-primary bg-primary/10 px-1 rounded">~/.kuroryuu/backups</code>.
            Ensure you have adequate disk space for your data.
          </div>
        </div>
      </div>

      <div className="flex justify-center pt-2">
        <button
          onClick={onNext}
          className="flex items-center gap-2 px-8 py-3 bg-primary text-primary-foreground rounded-lg font-medium hover:bg-primary/90 transition-colors"
        >
          Get Started
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    </div>
  );
}

function FeatureCard({
  icon,
  title,
  description,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
}) {
  return (
    <div className="p-3 bg-secondary/30 rounded-lg border border-border/50 hover:border-primary/30 transition-colors">
      <div className="flex items-center gap-2 mb-1.5">
        <div className="text-primary">{icon}</div>
        <h5 className="text-sm font-medium text-foreground">{title}</h5>
      </div>
      <p className="text-xs text-muted-foreground leading-relaxed">{description}</p>
    </div>
  );
}

function SetupStepPreview({
  number,
  title,
  description,
}: {
  number: number;
  title: string;
  description: string;
}) {
  return (
    <div className="flex items-center gap-3">
      <div className="w-6 h-6 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
        <span className="text-xs font-semibold text-primary">{number}</span>
      </div>
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-foreground">{title}</span>
        <span className="text-muted-foreground"> — </span>
        <span className="text-xs text-muted-foreground">{description}</span>
      </div>
    </div>
  );
}

function SourceStep({ onNext, onBack, config, setConfig }: StepProps) {
  const { projectSettings } = useSettingsStore();
  const [sourcePath, setSourcePath] = useState(config?.backup?.source_path || projectSettings.projectPath || '');
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

        {/* Tips Box */}
        <div className="p-3 bg-secondary/30 rounded-lg border border-border/50 space-y-2">
          <p className="text-xs font-medium text-foreground">Tips for choosing a source:</p>
          <ul className="text-xs text-muted-foreground space-y-1 ml-4 list-disc">
            <li>Select your main project folder or documents directory</li>
            <li>All files and subdirectories will be included by default</li>
            <li>You can exclude specific patterns (like node_modules) in the next steps</li>
            <li>Only one source directory per backup configuration</li>
          </ul>
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

function PasswordStep({ onNext, onBack, config, setConfig, passwordRef }: StepProps) {
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
    if (passwordRef) {
      passwordRef.current = password;
    }
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

function InitializeStep({ onBack, config, passwordRef }: StepProps) {
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
      const password = passwordRef?.current;
      if (!password) {
        throw new Error('Password not set. Please go back and set a password.');
      }

      const initResult = await initRepository(password);
      if (!initResult) {
        // The store sets the actual error detail — use it instead of a generic message
        const storeError = useBackupStore.getState().error;
        throw new Error(storeError || 'Failed to initialize repository');
      }

      // Step 3: Save config
      setStatus('saving');
      const finalConfig = {
        ...config,
        repository: {
          ...config.repository,
          initialized: true,
        },
      } as BackupConfig;
      await saveConfig(finalConfig);

      // Clean up password
      if (passwordRef) {
        passwordRef.current = '';
      }

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
  const [step, setStep] = useState<WizardStep>('welcome');
  const [config, setConfig] = useState<Partial<BackupConfig>>({});
  const passwordRef = useRef<string>('');

  const steps: WizardStep[] = ['welcome', 'source', 'password', 'exclusions', 'initialize'];
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
      passwordRef,
    };

    switch (step) {
      case 'welcome':
        return <WelcomeStep {...props} />;
      case 'source':
        return <SourceStep {...props} />;
      case 'password':
        return <PasswordStep {...props} />;
      case 'exclusions':
        return <ExclusionsStep {...props} />;
      case 'initialize':
        return <InitializeStep {...props} />;
      default:
        return <WelcomeStep {...props} />;
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
