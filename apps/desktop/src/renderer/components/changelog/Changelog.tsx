/**
 * Changelog Generator Screen
 * 
 * 3-step wizard for generating release changelogs:
 * - Step 1: Source selection (Done tasks vs Git history)
 * - Step 2: Configuration (Version, Format, Audience, Emoji)
 * - Step 3: Review + Save/Copy
 */
import { useEffect, useState } from 'react';
import {
  FileText,
  GitCommit,
  CheckSquare,
  Settings,
  CheckCircle,
  Copy,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Calendar,
  Tag,
  Hash,
  Users,
  Smile,
  FileCode,
  Globe,
  Code,
  ListChecks,
  X,
  Check,
} from 'lucide-react';
import { useChangelogStore } from '../../stores/changelog-store';
import type { ChangelogEntry, ChangelogSource, GitHistoryOptions, ChangelogConfig, EmojiLevel } from '../../types/changelog';
import { ENTRY_TYPE_CONFIG } from '../../types/changelog';

// ============================================================================
// StepIndicator - Progress indicator at top
// ============================================================================
function StepIndicator({ currentStep }: { currentStep: 1 | 2 | 3 }) {
  const steps = [
    { num: 1, label: 'Source', icon: CheckSquare },
    { num: 2, label: 'Configure', icon: Settings },
    { num: 3, label: 'Review', icon: CheckCircle },
  ];

  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      {steps.map((step, i) => {
        const Icon = step.icon;
        const isActive = currentStep === step.num;
        const isComplete = currentStep > step.num;

        return (
          <div key={step.num} className="flex items-center">
            <div className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              isActive ? 'bg-primary/20 text-primary' :
              isComplete ? 'bg-green-500/10 text-green-400' :
              'bg-secondary text-muted-foreground'
            }`}>
              <Icon className="w-4 h-4" />
              <span className="text-sm font-medium">{step.label}</span>
            </div>
            {i < steps.length - 1 && (
              <ChevronRight className="w-4 h-4 mx-2 text-muted-foreground" />
            )}
          </div>
        );
      })}
    </div>
  );
}

// ============================================================================
// Step1SourceSelection - Choose tasks or git history
// ============================================================================
function Step1SourceSelection() {
  const {
    source, setSource, gitOptions, setGitOptions, entries,
    loadDoneTasks, loadGitHistory, isLoading, loadError
  } = useChangelogStore();

  // Load real data from backend when source changes
  useEffect(() => {
    if (source === 'tasks') {
      loadDoneTasks();
    } else if (source === 'git') {
      loadGitHistory();
    }
  }, [source, loadDoneTasks, loadGitHistory]);

  // Reload git history when options change
  useEffect(() => {
    if (source === 'git') {
      loadGitHistory();
    }
  }, [gitOptions.mode, gitOptions.count, gitOptions.startDate, gitOptions.endDate, gitOptions.includeMergeCommits]);

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Select Source</h2>
        <p className="text-muted-foreground">Choose where to pull changelog entries from</p>
      </div>

      {/* Source Toggle */}
      <div className="grid grid-cols-2 gap-4">
        <button
          onClick={() => setSource('tasks')}
          className={`p-6 rounded-xl border-2 text-left transition-all ${
            source === 'tasks'
              ? 'border-primary bg-primary/10'
              : 'border-border bg-secondary/50 hover:border-muted-foreground'
          }`}
        >
          <ListChecks className={`w-8 h-8 mb-3 ${source === 'tasks' ? 'text-primary' : 'text-muted-foreground'}`} />
          <h3 className="font-medium text-foreground mb-1">Done Tasks</h3>
          <p className="text-sm text-muted-foreground">Generate from completed tasks in your board</p>
        </button>

        <button
          onClick={() => setSource('git')}
          className={`p-6 rounded-xl border-2 text-left transition-all ${
            source === 'git'
              ? 'border-primary bg-primary/10'
              : 'border-border bg-secondary/50 hover:border-muted-foreground'
          }`}
        >
          <GitCommit className={`w-8 h-8 mb-3 ${source === 'git' ? 'text-primary' : 'text-muted-foreground'}`} />
          <h3 className="font-medium text-foreground mb-1">Git History</h3>
          <p className="text-sm text-muted-foreground">Generate from git commits and history</p>
        </button>
      </div>

      {/* Git Options */}
      {source === 'git' && (
        <div className="p-4 bg-card rounded-xl border border-border space-y-4">
          <h4 className="font-medium text-foreground">Git History Options</h4>
          
          {/* Mode selector */}
          <div className="grid grid-cols-4 gap-2">
            {(['count', 'date-range', 'tags', 'version'] as const).map(mode => (
              <button
                key={mode}
                onClick={() => setGitOptions({ mode })}
                className={`px-3 py-2 rounded-lg text-sm transition-colors ${
                  gitOptions.mode === mode
                    ? 'bg-primary/20 text-primary'
                    : 'bg-secondary text-muted-foreground hover:bg-muted'
                }`}
              >
                {mode === 'count' && <><Hash className="w-3 h-3 inline mr-1" /> Last N</>}
                {mode === 'date-range' && <><Calendar className="w-3 h-3 inline mr-1" /> Date Range</>}
                {mode === 'tags' && <><Tag className="w-3 h-3 inline mr-1" /> Tags</>}
                {mode === 'version' && <><FileCode className="w-3 h-3 inline mr-1" /> Version</>}
              </button>
            ))}
          </div>

          {/* Mode-specific options */}
          {gitOptions.mode === 'count' && (
            <div>
              <label className="text-sm text-muted-foreground block mb-2">Number of commits</label>
              <input
                type="number"
                value={gitOptions.count || 50}
                onChange={(e) => setGitOptions({ count: parseInt(e.target.value) || 50 })}
                className="w-32 px-3 py-2 bg-secondary border border-border rounded-lg text-foreground"
              />
            </div>
          )}

          {gitOptions.mode === 'date-range' && (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm text-muted-foreground block mb-2">Start Date</label>
                <input
                  type="date"
                  value={gitOptions.startDate || ''}
                  onChange={(e) => setGitOptions({ startDate: e.target.value })}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground"
                />
              </div>
              <div>
                <label className="text-sm text-muted-foreground block mb-2">End Date</label>
                <input
                  type="date"
                  value={gitOptions.endDate || ''}
                  onChange={(e) => setGitOptions({ endDate: e.target.value })}
                  className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground"
                />
              </div>
            </div>
          )}

          {/* Merge commits toggle */}
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={gitOptions.includeMergeCommits}
              onChange={(e) => setGitOptions({ includeMergeCommits: e.target.checked })}
              className="rounded border-border bg-secondary text-primary"
            />
            <span className="text-sm text-foreground">Include merge commits</span>
          </label>
        </div>
      )}

      {/* Loading State */}
      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-primary mr-2" />
          <span className="text-muted-foreground">Loading {source === 'tasks' ? 'tasks' : 'git history'}...</span>
        </div>
      )}

      {/* Error State */}
      {loadError && !isLoading && (
        <div className="p-4 bg-red-500/10 border border-red-500/30 rounded-lg">
          <p className="text-red-400 text-sm">{loadError}</p>
          <button
            onClick={() => source === 'tasks' ? loadDoneTasks() : loadGitHistory()}
            className="mt-2 text-xs text-red-300 hover:text-red-200 underline"
          >
            Retry
          </button>
        </div>
      )}

      {/* Entry Selection */}
      {!isLoading && !loadError && entries.length > 0 && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="font-medium text-foreground">Select Entries ({entries.filter(e => e.selected).length}/{entries.length})</h4>
            <div className="flex gap-2">
              <button
                onClick={() => useChangelogStore.getState().selectAll()}
                className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground hover:text-foreground"
              >
                Select All
              </button>
              <button
                onClick={() => useChangelogStore.getState().deselectAll()}
                className="text-xs px-2 py-1 rounded bg-secondary text-muted-foreground hover:text-foreground"
              >
                Deselect All
              </button>
            </div>
          </div>

          <div className="max-h-64 overflow-y-auto space-y-2">
            {entries.map(entry => (
              <EntryRow key={entry.id} entry={entry} />
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!isLoading && !loadError && entries.length === 0 && (
        <div className="text-center py-8 text-muted-foreground">
          <p>No {source === 'tasks' ? 'completed tasks' : 'commits'} found.</p>
          <p className="text-sm mt-1">
            {source === 'tasks'
              ? 'Mark tasks as done in ai/todo.md to see them here.'
              : 'Adjust your git history filters above.'}
          </p>
        </div>
      )}
    </div>
  );
}

// ============================================================================
// EntryRow - Single changelog entry with checkbox
// ============================================================================
function EntryRow({ entry }: { entry: ChangelogEntry }) {
  const { toggleEntry, updateEntryType } = useChangelogStore();
  const typeConfig = ENTRY_TYPE_CONFIG[entry.type];

  return (
    <div className={`flex items-center gap-3 p-3 rounded-lg border transition-colors ${
      entry.selected ? 'bg-secondary/50 border-border' : 'bg-card/50 border-border'
    }`}>
      <button
        onClick={() => toggleEntry(entry.id)}
        className={`w-5 h-5 rounded flex items-center justify-center transition-colors ${
          entry.selected ? 'bg-primary text-background' : 'bg-muted text-muted-foreground'
        }`}
      >
        {entry.selected && <Check className="w-3 h-3" />}
      </button>

      <select
        value={entry.type}
        onChange={(e) => updateEntryType(entry.id, e.target.value as ChangelogEntry['type'])}
        className={`px-2 py-1 rounded text-xs bg-secondary border-none ${typeConfig.color}`}
      >
        {Object.entries(ENTRY_TYPE_CONFIG).map(([type, config]) => (
          <option key={type} value={type}>{config.emoji} {config.label}</option>
        ))}
      </select>

      <div className="flex-1 min-w-0">
        <div className="text-sm text-foreground truncate">{entry.title}</div>
        {entry.description && (
          <div className="text-xs text-muted-foreground truncate">{entry.description}</div>
        )}
      </div>
    </div>
  );
}

// ============================================================================
// Step2Configuration - Configure changelog output
// ============================================================================
function Step2Configuration() {
  const { config, setConfig } = useChangelogStore();

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-foreground mb-2">Configure Output</h2>
        <p className="text-muted-foreground">Customize how your changelog will be formatted</p>
      </div>

      <div className="grid grid-cols-2 gap-6">
        {/* Version & Date */}
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground block mb-2">Version Number</label>
            <input
              type="text"
              value={config.version}
              onChange={(e) => setConfig({ version: e.target.value })}
              placeholder="1.0.0"
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground"
            />
          </div>

          <div>
            <label className="text-sm text-muted-foreground block mb-2">Release Date</label>
            <input
              type="date"
              value={config.releaseDate}
              onChange={(e) => setConfig({ releaseDate: e.target.value })}
              className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground"
            />
          </div>
        </div>

        {/* Format & Audience */}
        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground block mb-2">Format</label>
            <div className="flex gap-2">
              {([
                { value: 'markdown', icon: FileText, label: 'Markdown' },
                { value: 'plain', icon: FileCode, label: 'Plain' },
                { value: 'html', icon: Globe, label: 'HTML' },
              ] as const).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setConfig({ format: value })}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    config.format === value
                      ? 'bg-primary/20 text-primary'
                      : 'bg-secondary text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground block mb-2">Target Audience</label>
            <div className="flex gap-2">
              {([
                { value: 'developers', icon: Code, label: 'Developers' },
                { value: 'end-users', icon: Users, label: 'End Users' },
                { value: 'stakeholders', icon: Globe, label: 'Stakeholders' },
              ] as const).map(({ value, icon: Icon, label }) => (
                <button
                  key={value}
                  onClick={() => setConfig({ audience: value })}
                  className={`flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg text-sm transition-colors ${
                    config.audience === value
                      ? 'bg-primary/20 text-primary'
                      : 'bg-secondary text-muted-foreground hover:bg-muted'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Emoji Level */}
      <div>
        <label className="text-sm text-muted-foreground block mb-2">
          <Smile className="w-4 h-4 inline mr-1" />
          Emoji Level
        </label>
        <div className="flex gap-2">
          {([
            { value: 'none', label: 'None' },
            { value: 'minimal', label: 'Minimal (headers only)' },
            { value: 'all', label: 'All (headers + items)' },
          ] as const).map(({ value, label }) => (
            <button
              key={value}
              onClick={() => setConfig({ emojiLevel: value })}
              className={`px-4 py-2 rounded-lg text-sm transition-colors ${
                config.emojiLevel === value
                  ? 'bg-primary/20 text-primary'
                  : 'bg-secondary text-muted-foreground hover:bg-muted'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Custom Instructions */}
      <div>
        <label className="text-sm text-muted-foreground block mb-2">Custom Instructions (optional)</label>
        <textarea
          value={config.customInstructions || ''}
          onChange={(e) => setConfig({ customInstructions: e.target.value })}
          placeholder="Add any special formatting or content instructions..."
          rows={3}
          className="w-full px-3 py-2 bg-secondary border border-border rounded-lg text-foreground placeholder:text-muted-foreground resize-none"
        />
      </div>
    </div>
  );
}

// ============================================================================
// Step3Review - Preview and save/copy
// ============================================================================
function Step3Review() {
  const { generatedContent, isGenerating, generateChangelog, copyToClipboard, saveToFile, entries } = useChangelogStore();

  // Generate on mount
  useEffect(() => {
    if (!generatedContent && entries.filter(e => e.selected).length > 0) {
      generateChangelog();
    }
  }, []);

  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await copyToClipboard();
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-semibold text-foreground mb-2">Review & Save</h2>
          <p className="text-muted-foreground">Preview your changelog and export it</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={handleCopy}
            disabled={isGenerating || !generatedContent}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-secondary text-foreground hover:bg-muted disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-green-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied!' : 'Copy'}
          </button>
          <button
            onClick={saveToFile}
            disabled={isGenerating || !generatedContent}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-background hover:bg-primary disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Download className="w-4 h-4" />
            Save to File
          </button>
        </div>
      </div>

      {/* Preview */}
      <div className="relative">
        {isGenerating && (
          <div className="absolute inset-0 flex items-center justify-center bg-card/80 rounded-xl z-10">
            <div className="flex items-center gap-3 text-primary">
              <Loader2 className="w-6 h-6 animate-spin" />
              <span>Generating changelog...</span>
            </div>
          </div>
        )}
        <pre className="p-6 bg-card border border-border rounded-xl overflow-auto max-h-[500px] text-sm text-foreground font-mono whitespace-pre-wrap">
          {generatedContent || 'No content generated yet...'}
        </pre>
      </div>

      {/* Regenerate button */}
      <button
        onClick={generateChangelog}
        disabled={isGenerating}
        className="flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
      >
        <Loader2 className={`w-4 h-4 ${isGenerating ? 'animate-spin' : ''}`} />
        Regenerate
      </button>
    </div>
  );
}

// ============================================================================
// Changelog - Main Component
// ============================================================================
export function Changelog() {
  const { currentStep, nextStep, prevStep, entries, reset } = useChangelogStore();
  const selectedCount = entries.filter(e => e.selected).length;

  const canProceed = currentStep === 1 ? selectedCount > 0 : true;

  return (
    <div className="h-full flex flex-col bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-border">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-green-400/20 to-emerald-500/20 flex items-center justify-center">
            <FileText className="w-5 h-5 text-green-400" />
          </div>
          <div>
            <h1 className="text-lg font-semibold text-foreground">Changelog Generator</h1>
            <p className="text-sm text-muted-foreground">Create release notes from tasks or git history</p>
          </div>
        </div>
        <button
          onClick={reset}
          className="text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          Start Over
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-3xl mx-auto">
          <StepIndicator currentStep={currentStep} />

          {currentStep === 1 && <Step1SourceSelection />}
          {currentStep === 2 && <Step2Configuration />}
          {currentStep === 3 && <Step3Review />}
        </div>
      </div>

      {/* Footer Navigation */}
      <div className="flex items-center justify-between px-6 py-4 border-t border-border">
        <button
          onClick={prevStep}
          disabled={currentStep === 1}
          className="flex items-center gap-2 px-4 py-2 rounded-lg text-muted-foreground hover:text-foreground disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
          Previous
        </button>

        <div className="text-sm text-muted-foreground">
          Step {currentStep} of 3
        </div>

        {currentStep < 3 ? (
          <button
            onClick={nextStep}
            disabled={!canProceed}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-background hover:bg-primary disabled:bg-muted disabled:text-muted-foreground disabled:cursor-not-allowed transition-colors"
          >
            Next
            <ChevronRight className="w-4 h-4" />
          </button>
        ) : (
          <div className="w-24" /> // Spacer for alignment
        )}
      </div>
    </div>
  );
}
