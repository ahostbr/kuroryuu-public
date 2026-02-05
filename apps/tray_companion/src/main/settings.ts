import Store from 'electron-store';

export interface Settings {
  engine: 'windows' | 'edge' | 'elevenlabs';
  sttEngine: 'google' | 'whisper';
  autoSpeak: boolean;
  hotkeyEnabled: boolean;
  hotkey: string;
  maxChars: number;
  windowsRate: number;
  windowsVolume: number;
  windowsVoice: string;
  edgeRate: number;
  edgeVoice: string;
  // ElevenLabs settings
  elevenlabsVoice: string;
  elevenlabsModelId: 'eleven_turbo_v2_5' | 'eleven_multilingual_v2';
  elevenlabsStability: number;
  elevenlabsSimilarity: number;
  // Voice Assistant settings (provider-agnostic)
  voiceEnabled: boolean;
  localLlmUrl: string;
  voiceModel: string;
  voicePromptPath: string;
  voiceSystemPrompt: string;
  voiceAlwaysListen: boolean;
  voiceAutoSpeak: boolean;
  voiceWakeWord: string;
  // CLIProxyAPI settings (fallback backend)
  cliproxyApiUrl: string;
  cliproxyApiModel: string;
  cliproxyApiEnabled: boolean;
  // Backend preference order
  backendPreference: 'lmstudio' | 'cliproxyapi';
  announceBackendSwitch: boolean;
}

export const DEFAULT_SETTINGS: Settings = {
  engine: 'edge',
  sttEngine: 'whisper',
  autoSpeak: false,
  hotkeyEnabled: true,
  hotkey: 'CommandOrControl+Shift+S',
  maxChars: 4000,
  windowsRate: 200,
  windowsVolume: 1.0,
  windowsVoice: '',
  edgeRate: 100,
  edgeVoice: 'en-US-AriaNeural',
  // ElevenLabs defaults
  elevenlabsVoice: 'rachel',
  elevenlabsModelId: 'eleven_turbo_v2_5',
  elevenlabsStability: 0.5,
  elevenlabsSimilarity: 0.75,
  // Voice Assistant defaults (provider-agnostic)
  voiceEnabled: false,
  localLlmUrl: 'http://127.0.0.1:1234',
  voiceModel: '',
  voicePromptPath: '',
  voiceSystemPrompt: '',
  voiceAlwaysListen: false,
  voiceAutoSpeak: true,
  voiceWakeWord: 'hey assistant',
  // CLIProxyAPI defaults
  cliproxyApiUrl: 'http://127.0.0.1:8317',
  cliproxyApiModel: 'claude-sonnet-4-20250514',
  cliproxyApiEnabled: true,
  // Backend preference
  backendPreference: 'lmstudio',
  announceBackendSwitch: true
};

let store: Store<Settings>;

export function initializeSettings(): void {
  store = new Store<Settings>({
    name: 'kuroryuu-tray-companion',
    defaults: DEFAULT_SETTINGS,
    // Store in Kuroryuu app data directory
    cwd: 'Kuroryuu/tray_companion'
  });

  // Migrate from old devstral* settings to new voice* settings
  migrateFromDevstralSettings();

  console.log('Settings initialized:', store.store);
}

/**
 * Migrate from legacy devstral* settings to new voice* settings
 * This preserves existing user settings after the rename
 */
function migrateFromDevstralSettings(): void {
  const migrations: [string, keyof Settings][] = [
    ['devstralEnabled', 'voiceEnabled'],
    ['devstralUrl', 'localLlmUrl'],
    ['devstralModel', 'voiceModel'],
    ['devstralPromptPath', 'voicePromptPath'],
    ['devstralSystemPrompt', 'voiceSystemPrompt'],
    ['devstralAlwaysListen', 'voiceAlwaysListen'],
    ['devstralAutoSpeak', 'voiceAutoSpeak'],
    ['devstralWakeWord', 'voiceWakeWord'],
  ];

  let migrated = false;
  for (const [oldKey, newKey] of migrations) {
    const oldValue = (store as any).get(oldKey);
    if (oldValue !== undefined) {
      store.set(newKey, oldValue);
      (store as any).delete(oldKey);
      console.log(`[Settings] Migrated ${oldKey} -> ${newKey}`);
      migrated = true;
    }
  }

  if (migrated) {
    console.log('[Settings] Migration from devstral to voice settings complete');
  }
}

export function getSettings(): Settings {
  return store.store;
}

export function updateSettings(newSettings: Partial<Settings>): Settings {
  console.log('[Settings] updateSettings called with:', JSON.stringify(newSettings));
  
  // Validate and sanitize settings
  const sanitized = sanitizeSettings(newSettings);
  console.log('[Settings] Sanitized settings:', JSON.stringify(sanitized));
  
  // Update store
  for (const [key, value] of Object.entries(sanitized)) {
    console.log(`[Settings] Setting ${key} = ${value}`);
    store.set(key as keyof Settings, value);
  }
  
  const finalSettings = store.store;
  console.log('[Settings] Final settings after update:', JSON.stringify(finalSettings));
  console.log('[Settings] voiceAlwaysListen is now:', finalSettings.voiceAlwaysListen);
  return finalSettings;
}

export function getSetting<K extends keyof Settings>(key: K): Settings[K] {
  return store.get(key);
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]): void {
  store.set(key, value);
}

function sanitizeSettings(settings: Partial<Settings>): Partial<Settings> {
  const sanitized: Partial<Settings> = {};

  if (settings.engine && ['windows', 'edge', 'elevenlabs'].includes(settings.engine)) {
    sanitized.engine = settings.engine;
  }

  if (settings.sttEngine && ['google', 'whisper'].includes(settings.sttEngine)) {
    sanitized.sttEngine = settings.sttEngine;
  }

  if (typeof settings.autoSpeak === 'boolean') {
    sanitized.autoSpeak = settings.autoSpeak;
  }
  
  if (typeof settings.hotkeyEnabled === 'boolean') {
    sanitized.hotkeyEnabled = settings.hotkeyEnabled;
  }
  
  if (typeof settings.hotkey === 'string' && settings.hotkey.trim()) {
    sanitized.hotkey = settings.hotkey.trim();
  }
  
  if (typeof settings.maxChars === 'number' && settings.maxChars >= 50 && settings.maxChars <= 50000) {
    sanitized.maxChars = Math.floor(settings.maxChars);
  }
  
  if (typeof settings.windowsRate === 'number' && settings.windowsRate >= 80 && settings.windowsRate <= 300) {
    sanitized.windowsRate = Math.floor(settings.windowsRate);
  }
  
  if (typeof settings.windowsVolume === 'number' && settings.windowsVolume >= 0 && settings.windowsVolume <= 1) {
    sanitized.windowsVolume = Math.max(0, Math.min(1, settings.windowsVolume));
  }
  
  if (typeof settings.windowsVoice === 'string') {
    sanitized.windowsVoice = settings.windowsVoice;
  }
  
  if (typeof settings.edgeRate === 'number' && settings.edgeRate >= 50 && settings.edgeRate <= 200) {
    sanitized.edgeRate = Math.floor(settings.edgeRate);
  }
  
  if (typeof settings.edgeVoice === 'string' && settings.edgeVoice.trim()) {
    sanitized.edgeVoice = settings.edgeVoice.trim();
  }

  // ElevenLabs settings
  if (typeof settings.elevenlabsVoice === 'string' && settings.elevenlabsVoice.trim()) {
    sanitized.elevenlabsVoice = settings.elevenlabsVoice.trim();
  }

  if (settings.elevenlabsModelId && ['eleven_turbo_v2_5', 'eleven_multilingual_v2'].includes(settings.elevenlabsModelId)) {
    sanitized.elevenlabsModelId = settings.elevenlabsModelId;
  }

  if (typeof settings.elevenlabsStability === 'number') {
    sanitized.elevenlabsStability = Math.max(0, Math.min(1, settings.elevenlabsStability));
  }

  if (typeof settings.elevenlabsSimilarity === 'number') {
    sanitized.elevenlabsSimilarity = Math.max(0, Math.min(1, settings.elevenlabsSimilarity));
  }

  // Voice Assistant settings (provider-agnostic)
  if (typeof settings.voiceEnabled === 'boolean') {
    sanitized.voiceEnabled = settings.voiceEnabled;
  }

  if (typeof settings.localLlmUrl === 'string' && settings.localLlmUrl.trim()) {
    sanitized.localLlmUrl = settings.localLlmUrl.trim();
  }

  if (typeof settings.voiceModel === 'string') {
    sanitized.voiceModel = settings.voiceModel.trim();
  }

  if (typeof settings.voicePromptPath === 'string') {
    sanitized.voicePromptPath = settings.voicePromptPath.trim();
  }

  if (typeof settings.voiceSystemPrompt === 'string') {
    sanitized.voiceSystemPrompt = settings.voiceSystemPrompt;
  }

  if (typeof settings.voiceAlwaysListen === 'boolean') {
    sanitized.voiceAlwaysListen = settings.voiceAlwaysListen;
  }

  if (typeof settings.voiceAutoSpeak === 'boolean') {
    sanitized.voiceAutoSpeak = settings.voiceAutoSpeak;
  }

  if (typeof settings.voiceWakeWord === 'string') {
    sanitized.voiceWakeWord = settings.voiceWakeWord.trim().toLowerCase();
  }

  // CLIProxyAPI settings
  if (typeof settings.cliproxyApiUrl === 'string' && settings.cliproxyApiUrl.trim()) {
    sanitized.cliproxyApiUrl = settings.cliproxyApiUrl.trim();
  }

  if (typeof settings.cliproxyApiModel === 'string') {
    sanitized.cliproxyApiModel = settings.cliproxyApiModel.trim();
  }

  if (typeof settings.cliproxyApiEnabled === 'boolean') {
    sanitized.cliproxyApiEnabled = settings.cliproxyApiEnabled;
  }

  if (settings.backendPreference && ['lmstudio', 'cliproxyapi'].includes(settings.backendPreference)) {
    sanitized.backendPreference = settings.backendPreference;
  }

  if (typeof settings.announceBackendSwitch === 'boolean') {
    sanitized.announceBackendSwitch = settings.announceBackendSwitch;
  }

  return sanitized;
}
