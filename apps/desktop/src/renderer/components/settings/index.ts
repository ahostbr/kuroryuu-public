/**
 * Settings index - exports all settings dialogs and store
 */

export { AppSettingsDialog } from './AppSettingsDialog';
export { ProjectSettingsDialog } from './ProjectSettingsDialog';
export { ClaudeProfilesDialog } from './ClaudeProfilesDialog';
export { ModelConfigDialog } from './ModelConfigDialog';
export { DomainConfigDialog } from './DomainConfigDialog';
export { GroupedModelSelect } from './GroupedModelSelect';
export { IntegrationsDialog } from './IntegrationsDialog';
export { AboutDialog } from './AboutDialog';
export { CLIProxySection } from './CLIProxySection';
export { CLIProxyWizard } from './CLIProxyWizard';
export { useSettingsStore } from '../../stores/settings-store';
export { useDomainConfigStore } from '../../stores/domain-config-store';

// Feature settings
export { 
  FeatureSettingsPanel, 
  DEFAULT_FEATURE_SETTINGS,
  type FeatureSettings,
  type CapturePreset,
  type VoiceInputSettings,
  type TTSSettings,
  type FeatureSettingsPanelProps,
} from './FeatureSettingsPanel';
