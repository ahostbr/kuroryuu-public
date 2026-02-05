/**
 * App Settings Dialog
 * Theme selector, UI scale, language, terminal font, update settings
 */

import * as Dialog from '@radix-ui/react-dialog';
import {
  X,
  Palette,
  Monitor,
  Type,
  Globe,
  Sparkles,
  Check,
  Bot,
  Database,
  AlertTriangle,
  Code,
} from 'lucide-react';
import { BackupRestorePanel } from './BackupRestorePanel';
import { FullResetDialog } from './FullResetDialog';
import { useState } from 'react';
import { toast } from '../ui/toaster';
import { useSettingsStore } from '../../stores/settings-store';
import {
  THEMES,
  UI_SCALE_OPTIONS,
  LANGUAGE_OPTIONS,
  TERMINAL_FONT_OPTIONS,
} from '../../types/settings';
import type { ThemeId, UIScale, Language, TerminalFont } from '../../types/settings';
import { ThemedFrame } from '../ui/ThemedFrame';
import { useIsThemedStyle } from '../../hooks/useTheme';

function SettingSection({
  icon: Icon,
  title,
  description,
  children
}: {
  icon: React.ElementType;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <div className="py-4 border-b border-border last:border-b-0">
      <div className="flex items-start gap-3 mb-3">
        <div className="p-2 bg-secondary rounded-lg">
          <Icon className="w-4 h-4 text-primary" />
        </div>
        <div className="flex-1">
          <h3 className="text-sm font-medium text-foreground">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>
      <div className="ml-11">
        {children}
      </div>
    </div>
  );
}

function ThemeGrid({
  currentTheme,
  onSelect
}: {
  currentTheme: ThemeId;
  onSelect: (theme: ThemeId) => void;
}) {
  return (
    <div className="grid grid-cols-4 gap-2">
      {THEMES.map((theme) => (
        <button
          key={theme.id}
          onClick={() => onSelect(theme.id)}
          className={`
            relative p-2 rounded-lg border transition-all
            ${currentTheme === theme.id
              ? 'border-primary ring-1 ring-primary/30'
              : 'border-border hover:border-muted-foreground'
            }
          `}
        >
          {/* Theme Preview */}
          <div 
            className="h-12 rounded-md mb-2 flex items-end p-1.5 gap-1"
            style={{ backgroundColor: theme.background }}
          >
            <div 
              className="w-2 h-6 rounded-sm"
              style={{ backgroundColor: theme.primary }}
            />
            <div 
              className="w-2 h-4 rounded-sm"
              style={{ backgroundColor: theme.card }}
            />
            <div 
              className="w-2 h-5 rounded-sm"
              style={{ backgroundColor: theme.muted }}
            />
          </div>
          <p className="text-xs text-foreground text-center truncate">{theme.name}</p>

          {/* Selected Check */}
          {currentTheme === theme.id && (
            <div className="absolute top-1 right-1 w-4 h-4 bg-primary rounded-full flex items-center justify-center">
              <Check className="w-2.5 h-2.5 text-background" />
            </div>
          )}
        </button>
      ))}
    </div>
  );
}

function SelectGrid<T extends string | number>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {options.map((option) => (
        <button
          key={String(option.value)}
          onClick={() => onChange(option.value)}
          className={`
            px-3 py-1.5 text-sm rounded-lg border transition-colors
            ${value === option.value
              ? 'bg-primary text-background border-primary'
              : 'bg-secondary text-foreground border-border hover:border-muted-foreground'
            }
          `}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({
  enabled,
  onChange,
  label,
}: {
  enabled: boolean;
  onChange: (enabled: boolean) => void;
  label: string;
}) {
  return (
    <label className="flex items-center justify-between cursor-pointer">
      <span className="text-sm text-foreground">{label}</span>
      <button
        onClick={() => onChange(!enabled)}
        className={`
          relative w-10 h-5 rounded-full transition-colors
          ${enabled ? 'bg-primary' : 'bg-muted'}
        `}
      >
        <span
          className={`
            absolute top-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform
            ${enabled ? 'left-5' : 'left-0.5'}
          `}
        />
      </button>
    </label>
  );
}

export function AppSettingsDialog() {
  const {
    activeDialog,
    closeDialog,
    appSettings,
    setTheme,
    setUIScale,
    setLanguage,
    setTerminalFont,
    setTerminalFontSize,
    setCheckUpdates,
    setShowWelcome,
    setEnableAnimations,
    setMatrixRainOpacity,
    setKuroryuuDecorativeFrames,
    setTrayCompanionLaunchOnStartup,
    setEnableRichToolVisualizations,
    setDevMode,
    saveSettings,
  } = useSettingsStore();

  const [isLaunchingTrayCompanion, setIsLaunchingTrayCompanion] = useState(false);
  const [showFullResetDialog, setShowFullResetDialog] = useState(false);

  const isOpen = activeDialog === 'app';
  const { isKuroryuu, isGrunge } = useIsThemedStyle();

  const handleSave = async () => {
    await saveSettings();
    closeDialog();
  };

  return (
    <Dialog.Root open={isOpen} onOpenChange={(open) => !open && closeDialog()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50" />
        <Dialog.Content className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50">
          <ThemedFrame
            variant={isKuroryuu ? 'dragon' : 'grunge-square'}
            size="lg"
            className="w-[550px] max-h-[85vh] overflow-hidden flex flex-col"
            contentClassName="flex-1 flex flex-col min-h-0"
          >
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-border flex-shrink-0">
            <div>
              <Dialog.Title className="text-lg font-semibold text-foreground">
                App Settings
              </Dialog.Title>
              <Dialog.Description className="text-sm text-muted-foreground sr-only">
                Configure theme, fonts, language, and other application preferences
              </Dialog.Description>
            </div>
            <Dialog.Close className="p-2 hover:bg-secondary rounded-lg transition-colors">
              <X className="w-5 h-5 text-muted-foreground" />
            </Dialog.Close>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto min-h-0 p-4">
            {/* Theme */}
            <SettingSection
              icon={Palette}
              title="Theme"
              description="Choose your preferred color scheme"
            >
              <ThemeGrid currentTheme={appSettings.theme} onSelect={setTheme} />

              {/* Matrix Rain Opacity - only shown when Matrix theme is active */}
              {appSettings.theme === 'matrix' && (
                <div className="mt-4 p-3 bg-[#0D0208] border border-[#003B00] rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm text-[#00FF41]">Digital Rain Intensity</span>
                    <span className="text-sm text-[#008F11] font-mono">{appSettings.matrixRainOpacity}%</span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="80"
                    value={appSettings.matrixRainOpacity}
                    onChange={(e) => setMatrixRainOpacity(Number(e.target.value))}
                    className="w-full accent-[#00FF41]"
                  />
                  <div className="flex justify-between text-xs text-[#008F11] mt-1">
                    <span>Subtle</span>
                    <span>Intense</span>
                  </div>
                </div>
              )}

              {/* Kuroryuu Decorative Frames - HIDDEN: feature not fully polished, may revisit later
              {appSettings.theme === 'kuroryuu' && (
                <div className="mt-4 p-3 bg-[#12100e] border border-[#3a3028] rounded-lg">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-[#e8d5b5]">Decorative Dragon Frames</span>
                      <p className="text-xs text-[#9a8a6a] mt-0.5">
                        Enable ornate dragon border frames on modals
                      </p>
                    </div>
                    <button
                      onClick={() => setKuroryuuDecorativeFrames(!appSettings.kuroryuuDecorativeFrames)}
                      className={`relative w-11 h-6 rounded-full transition-colors ${
                        appSettings.kuroryuuDecorativeFrames
                          ? 'bg-[#c9a227]'
                          : 'bg-[#2a2420]'
                      }`}
                    >
                      <span
                        className={`absolute top-1 left-1 w-4 h-4 rounded-full bg-[#e8d5b5] transition-transform ${
                          appSettings.kuroryuuDecorativeFrames ? 'translate-x-5' : ''
                        }`}
                      />
                    </button>
                  </div>
                </div>
              )}
              */}
            </SettingSection>

            {/* UI Scale - HIDDEN: Not implemented, out of scope
            <SettingSection
              icon={Monitor}
              title="UI Scale"
              description="Adjust the interface size"
            >
              <SelectGrid
                options={UI_SCALE_OPTIONS}
                value={appSettings.uiScale}
                onChange={setUIScale}
              />
            </SettingSection>
            */}

            {/* Language - HIDDEN: Not implemented, out of scope
            <SettingSection
              icon={Globe}
              title="Language"
              description="Select your preferred language"
            >
              <SelectGrid
                options={LANGUAGE_OPTIONS}
                value={appSettings.language}
                onChange={setLanguage}
              />
            </SettingSection>
            */}

            {/* Terminal Font */}
            <SettingSection
              icon={Type}
              title="Terminal Font"
              description="Font family for terminal output"
            >
              <SelectGrid
                options={TERMINAL_FONT_OPTIONS}
                value={appSettings.terminalFont}
                onChange={setTerminalFont}
              />
              <div className="mt-3 flex items-center gap-3">
                <span className="text-sm text-muted-foreground">Size:</span>
                <input
                  type="range"
                  min="10"
                  max="20"
                  value={appSettings.terminalFontSize}
                  onChange={(e) => setTerminalFontSize(Number(e.target.value))}
                  className="flex-1 accent-primary"
                />
                <span className="text-sm text-foreground w-8">{appSettings.terminalFontSize}px</span>
              </div>
            </SettingSection>

            {/* Toggles */}
            <SettingSection
              icon={Sparkles}
              title="Preferences"
              description="Customize app behavior"
            >
              <div className="space-y-3">
                <Toggle
                  enabled={appSettings.checkUpdatesOnStartup}
                  onChange={setCheckUpdates}
                  label="Check for updates on startup"
                />
                <Toggle
                  enabled={appSettings.enableRichToolVisualizations}
                  onChange={setEnableRichToolVisualizations}
                  label="Enable rich tool visualizations"
                />
{/* Show welcome & Enable animations - always on, hidden from settings */}
              </div>
            </SettingSection>

            {/* Tray Companion */}
            <SettingSection
              icon={Bot}
              title="Tray Companion"
              description="System tray integration with TTS and voice controls"
            >
              <div className="space-y-3">
                <Toggle
                  enabled={appSettings.integrations?.trayCompanion?.launchOnStartup ?? false}
                  onChange={setTrayCompanionLaunchOnStartup}
                  label="Launch on startup"
                />
                <button
                  onClick={async (e) => {
                    const debug = e.shiftKey;
                    setIsLaunchingTrayCompanion(true);
                    try {
                      const result = await window.electronAPI?.app?.launchTrayCompanion?.({ debug });
                      if (result?.ok) {
                        toast.success(debug ? 'Tray companion launched (debug mode)' : 'Tray companion launched successfully');
                      } else {
                        toast.error(result?.error || 'Failed to launch tray companion');
                      }
                    } catch (err: any) {
                      toast.error(`Error: ${err.message || 'Failed to launch tray companion'}`);
                    } finally {
                      setIsLaunchingTrayCompanion(false);
                    }
                  }}
                  disabled={isLaunchingTrayCompanion}
                  title="Shift+click for debug mode (shows terminal)"
                  className="w-full px-3 py-2 text-sm bg-primary/20 text-primary border border-primary/30 rounded-lg hover:bg-primary/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {isLaunchingTrayCompanion ? 'Launching...' : 'Launch Tray Companion Now'}
                </button>
              </div>
            </SettingSection>

            {/* Backup & Restore */}
            <SettingSection
              icon={Database}
              title="Backup & Restore"
              description="Create backups and restore from previous states"
            >
              <BackupRestorePanel />
            </SettingSection>

            {/* Developer Options */}
            <SettingSection
              icon={Code}
              title="Developer"
              description="Development and debugging features"
            >
              <div className="space-y-3">
                <Toggle
                  enabled={appSettings.devMode ?? false}
                  onChange={setDevMode}
                  label="Dev Mode (keyboard shortcuts + HMR)"
                />
                <p className="text-xs text-muted-foreground">
                  Keyboard shortcuts take effect immediately. HMR requires app restart.
                </p>
              </div>
            </SettingSection>

            {/* Full App Reset - Danger Zone */}
            <SettingSection
              icon={AlertTriangle}
              title="Full App Reset"
              description="Reset everything and return to the startup wizard"
            >
              <div className="p-3 bg-destructive/10 border border-destructive/30 rounded-lg">
                <p className="text-sm text-muted-foreground mb-3">
                  This will delete all settings, clear all data, and return the app to its initial state.
                  You will need to complete setup again.
                </p>
                <button
                  onClick={() => setShowFullResetDialog(true)}
                  className="px-4 py-2 bg-destructive text-destructive-foreground rounded-lg hover:bg-destructive/90 transition-colors text-sm font-medium"
                >
                  Full App Reset...
                </button>
              </div>
            </SettingSection>
          </div>

          {/* Full Reset Dialog */}
          <FullResetDialog
            open={showFullResetDialog}
            onOpenChange={setShowFullResetDialog}
          />

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-4 border-t border-border flex-shrink-0">
            <button
              onClick={closeDialog}
              className="px-4 py-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              className="flex items-center gap-2 px-4 py-2 bg-primary text-background rounded-lg hover:bg-primary/90 transition-colors text-sm font-medium"
            >
              <Check className="w-4 h-4" />
              Save Changes
            </button>
          </div>
          </ThemedFrame>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
