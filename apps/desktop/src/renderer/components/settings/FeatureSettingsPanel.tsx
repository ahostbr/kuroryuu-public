/**
 * Feature Settings Panel
 * 
 * Settings panel for capture, voice input, and TTS features.
 * Provides UI for configuring presets, timeouts, and backends.
 * 
 * Requirements: 6.1, 6.2, 6.3, 6.4
 */

import React, { useState, useCallback, useEffect } from 'react';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface CapturePreset {
  id: string;
  name: string;
  format: 'png' | 'jpeg' | 'webp';
  quality: number;
  region: 'full' | 'window' | 'selection';
}

export interface VoiceInputSettings {
  timeout: number;
  language: string;
  continuous: boolean;
  interimResults: boolean;
}

export interface TTSSettings {
  backend: 'native' | 'google' | 'azure' | 'amazon';
  voice: string | null;
  rate: number;
  pitch: number;
  volume: number;
}

export interface FeatureSettings {
  capture: {
    defaultPreset: string;
    presets: CapturePreset[];
    outputDir: string;
  };
  voiceInput: VoiceInputSettings;
  tts: TTSSettings;
}

export interface FeatureSettingsPanelProps {
  settings: FeatureSettings;
  onSettingsChange: (settings: FeatureSettings) => void;
  availableVoices?: Array<{ id: string; name: string; lang: string }>;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Settings
// ═══════════════════════════════════════════════════════════════════════════════

export const DEFAULT_FEATURE_SETTINGS: FeatureSettings = {
  capture: {
    defaultPreset: 'default',
    presets: [
      { id: 'default', name: 'Default', format: 'png', quality: 90, region: 'full' },
      { id: 'high-quality', name: 'High Quality', format: 'png', quality: 100, region: 'full' },
      { id: 'quick', name: 'Quick JPEG', format: 'jpeg', quality: 75, region: 'full' },
    ],
    outputDir: './captures',
  },
  voiceInput: {
    timeout: 5000,
    language: 'en-US',
    continuous: false,
    interimResults: true,
  },
  tts: {
    backend: 'native',
    voice: null,
    rate: 1.0,
    pitch: 1.0,
    volume: 1.0,
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Styles
// ═══════════════════════════════════════════════════════════════════════════════

const styles = {
  container: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '24px',
    padding: '24px',
    backgroundColor: '#1e1e2e',
    borderRadius: '8px',
    color: '#cdd6f4',
  },
  section: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '16px',
  },
  sectionTitle: {
    fontSize: '16px',
    fontWeight: 600,
    color: '#cba6f7',
    margin: 0,
    paddingBottom: '8px',
    borderBottom: '1px solid #45475a',
  },
  fieldGroup: {
    display: 'flex',
    flexDirection: 'column' as const,
    gap: '8px',
  },
  label: {
    fontSize: '14px',
    fontWeight: 500,
    color: '#a6adc8',
  },
  input: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #45475a',
    backgroundColor: '#313244',
    color: '#cdd6f4',
    fontSize: '14px',
    outline: 'none',
  },
  select: {
    padding: '8px 12px',
    borderRadius: '6px',
    border: '1px solid #45475a',
    backgroundColor: '#313244',
    color: '#cdd6f4',
    fontSize: '14px',
    outline: 'none',
    cursor: 'pointer',
  },
  slider: {
    width: '100%',
    accentColor: '#cba6f7',
  },
  sliderValue: {
    fontSize: '12px',
    color: '#6c7086',
    textAlign: 'right' as const,
  },
  row: {
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
  },
  checkbox: {
    width: '16px',
    height: '16px',
    accentColor: '#cba6f7',
  },
  checkboxLabel: {
    fontSize: '14px',
    color: '#cdd6f4',
    cursor: 'pointer',
  },
};

// ═══════════════════════════════════════════════════════════════════════════════
// Component
// ═══════════════════════════════════════════════════════════════════════════════

export const FeatureSettingsPanel: React.FC<FeatureSettingsPanelProps> = ({
  settings,
  onSettingsChange,
  availableVoices = [],
}) => {
  // ─────────────────────────────────────────────────────────────────────────────
  // Handlers
  // ─────────────────────────────────────────────────────────────────────────────
  
  const updateCapture = useCallback((updates: Partial<FeatureSettings['capture']>) => {
    onSettingsChange({
      ...settings,
      capture: { ...settings.capture, ...updates },
    });
  }, [settings, onSettingsChange]);
  
  const updateVoiceInput = useCallback((updates: Partial<VoiceInputSettings>) => {
    onSettingsChange({
      ...settings,
      voiceInput: { ...settings.voiceInput, ...updates },
    });
  }, [settings, onSettingsChange]);
  
  const updateTTS = useCallback((updates: Partial<TTSSettings>) => {
    onSettingsChange({
      ...settings,
      tts: { ...settings.tts, ...updates },
    });
  }, [settings, onSettingsChange]);
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Render
  // ─────────────────────────────────────────────────────────────────────────────
  
  return (
    <div style={styles.container}>
      {/* Capture Settings */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>📸 Capture Settings</h3>
        
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Default Preset</label>
          <select
            style={styles.select}
            value={settings.capture.defaultPreset}
            onChange={(e) => updateCapture({ defaultPreset: e.target.value })}
          >
            {settings.capture.presets.map((preset) => (
              <option key={preset.id} value={preset.id}>
                {preset.name}
              </option>
            ))}
          </select>
        </div>
        
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Output Directory</label>
          <input
            type="text"
            style={styles.input}
            value={settings.capture.outputDir}
            onChange={(e) => updateCapture({ outputDir: e.target.value })}
            placeholder="./captures"
          />
        </div>
      </section>
      
      {/* Voice Input Settings */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>🎤 Voice Input Settings</h3>
        
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Timeout (ms)</label>
          <div style={styles.row}>
            <input
              type="range"
              style={styles.slider}
              min={1000}
              max={30000}
              step={1000}
              value={settings.voiceInput.timeout}
              onChange={(e) => updateVoiceInput({ timeout: Number(e.target.value) })}
            />
            <span style={styles.sliderValue}>{settings.voiceInput.timeout}ms</span>
          </div>
        </div>
        
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Language</label>
          <select
            style={styles.select}
            value={settings.voiceInput.language}
            onChange={(e) => updateVoiceInput({ language: e.target.value })}
          >
            <option value="en-US">English (US)</option>
            <option value="en-GB">English (UK)</option>
            <option value="es-ES">Spanish</option>
            <option value="fr-FR">French</option>
            <option value="de-DE">German</option>
            <option value="ja-JP">Japanese</option>
            <option value="zh-CN">Chinese (Simplified)</option>
          </select>
        </div>
        
        <div style={styles.row}>
          <input
            type="checkbox"
            id="continuous"
            style={styles.checkbox}
            checked={settings.voiceInput.continuous}
            onChange={(e) => updateVoiceInput({ continuous: e.target.checked })}
          />
          <label htmlFor="continuous" style={styles.checkboxLabel}>
            Continuous listening mode
          </label>
        </div>
        
        <div style={styles.row}>
          <input
            type="checkbox"
            id="interimResults"
            style={styles.checkbox}
            checked={settings.voiceInput.interimResults}
            onChange={(e) => updateVoiceInput({ interimResults: e.target.checked })}
          />
          <label htmlFor="interimResults" style={styles.checkboxLabel}>
            Show interim results
          </label>
        </div>
      </section>
      
      {/* TTS Settings */}
      <section style={styles.section}>
        <h3 style={styles.sectionTitle}>🔊 Text-to-Speech Settings</h3>
        
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Backend</label>
          <select
            style={styles.select}
            value={settings.tts.backend}
            onChange={(e) => updateTTS({ backend: e.target.value as TTSSettings['backend'] })}
          >
            <option value="native">Native (Web Speech API)</option>
            <option value="google">Google Cloud TTS</option>
            <option value="azure">Azure Cognitive Services</option>
            <option value="amazon">Amazon Polly</option>
          </select>
        </div>
        
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Voice</label>
          <select
            style={styles.select}
            value={settings.tts.voice || ''}
            onChange={(e) => updateTTS({ voice: e.target.value || null })}
          >
            <option value="">System Default</option>
            {availableVoices.map((voice) => (
              <option key={voice.id} value={voice.id}>
                {voice.name} ({voice.lang})
              </option>
            ))}
          </select>
        </div>
        
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Speech Rate</label>
          <div style={styles.row}>
            <input
              type="range"
              style={styles.slider}
              min={0.5}
              max={2.0}
              step={0.1}
              value={settings.tts.rate}
              onChange={(e) => updateTTS({ rate: Number(e.target.value) })}
            />
            <span style={styles.sliderValue}>{settings.tts.rate.toFixed(1)}x</span>
          </div>
        </div>
        
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Pitch</label>
          <div style={styles.row}>
            <input
              type="range"
              style={styles.slider}
              min={0.5}
              max={2.0}
              step={0.1}
              value={settings.tts.pitch}
              onChange={(e) => updateTTS({ pitch: Number(e.target.value) })}
            />
            <span style={styles.sliderValue}>{settings.tts.pitch.toFixed(1)}</span>
          </div>
        </div>
        
        <div style={styles.fieldGroup}>
          <label style={styles.label}>Volume</label>
          <div style={styles.row}>
            <input
              type="range"
              style={styles.slider}
              min={0}
              max={1}
              step={0.1}
              value={settings.tts.volume}
              onChange={(e) => updateTTS({ volume: Number(e.target.value) })}
            />
            <span style={styles.sliderValue}>{Math.round(settings.tts.volume * 100)}%</span>
          </div>
        </div>
      </section>
    </div>
  );
};

export default FeatureSettingsPanel;
