import { useState, useEffect } from 'react';
import { Settings, Volume2, VolumeX, Keyboard, Clipboard, Database, MessageSquare } from 'lucide-react';
import TtsControls from './components/TtsControls';
import VoiceAssistantControls from './components/VoiceAssistantControls';
import MCPControls from './components/MCPControls';

// Shrine Action Button Component
interface ShrineActionButtonProps {
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
  isSpeaking?: boolean;
  variant?: 'default' | 'silence';
  disabled?: boolean;
}

function ShrineActionButton({ onClick, icon, label, isSpeaking, variant = 'default', disabled }: ShrineActionButtonProps) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      className={`shrine-action-btn ${isSpeaking ? 'speaking' : ''} ${variant === 'silence' ? 'silence' : ''}`}
    >
      <div className="icon-container">
        {icon}
        {isSpeaking && (
          <>
            <div className="pulse-ring" />
            <div className="pulse-ring" />
            <div className="pulse-ring" />
          </>
        )}
      </div>
      <span className="micro-label">{label}</span>
    </button>
  );
}

// Engine Seal Badge Component
interface EngineSealProps {
  engine: 'windows' | 'edge';
}

function EngineSeal({ engine }: EngineSealProps) {
  return (
    <div className={`engine-seal ${engine === 'edge' ? 'edge' : ''}`}>
      <div className="seal-ring">
        <div className="seal-badge">
          <span className="engine-name">{engine.toUpperCase()}</span>
        </div>
      </div>
      <div className="status-dot" />
    </div>
  );
}

interface AppSettings {
  engine: 'windows' | 'edge';
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
  // Voice Assistant settings (provider-agnostic)
  voiceEnabled: boolean;
  localLlmUrl: string;
  voiceModel: string;
  voicePromptPath: string;
  voiceSystemPrompt: string;
  voiceAlwaysListen: boolean;
  voiceAutoSpeak: boolean;
  voiceWakeWord: string;
}

type View = 'tts' | 'hotkeys' | 'clipboard' | 'voice' | 'mcp';

interface NavItem {
  id: View;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { id: 'tts', label: 'TTS Engine', icon: Settings },
  { id: 'hotkeys', label: 'Hotkeys', icon: Keyboard },
  { id: 'clipboard', label: 'Auto-speak', icon: Clipboard },
  { id: 'voice', label: 'Voice Assistant', icon: MessageSquare },
  // { id: 'mcp', label: 'MCP Core', icon: Database }, // Hidden - MCP controls available in Desktop app
];

function App(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeView, setActiveView] = useState<View>('tts');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  useEffect(() => {
    loadSettings();
  }, [retryCount]);

  const loadSettings = async () => {
    setLoadError(null);

    // Check if API is available (preload script loaded)
    if (!(window as any).api) {
      console.error('[App] window.api is not available - preload may not have loaded');
      setLoadError('API not available. Preload script may not have loaded correctly.');
      return;
    }

    try {
      const currentSettings = await (window as any).api.settings.get();
      if (!currentSettings) {
        throw new Error('Settings returned null');
      }
      setSettings(currentSettings);
      setLoadError(null);
    } catch (error) {
      console.error('Error loading settings:', error);
      setLoadError(`Failed to load settings: ${error instanceof Error ? error.message : String(error)}`);
    }
  };

  const handleRetry = () => {
    setRetryCount(c => c + 1);
  };

  const updateSettings = async (newSettings: Partial<AppSettings>) => {
    if (!settings) return;
    try {
      const updatedSettings = { ...settings, ...newSettings };
      await (window as any).api.settings.update(newSettings);
      setSettings(updatedSettings);
    } catch (error) {
      console.error('Error updating settings:', error);
    }
  };

  const handleSpeak = async () => {
    const testText = "Kuroryuu TTS Companion is working perfectly.";
    setIsSpeaking(true);
    try {
      const result = await (window as any).api.tts.speak(testText);
      if (!result.success) {
        alert(`TTS Error: ${result.error}`);
      }
    } catch (error) {
      console.error('Error speaking:', error);
    } finally {
      setIsSpeaking(false);
    }
  };

  const handleStop = async () => {
    try {
      await (window as any).api.tts.stop();
      setIsSpeaking(false);
    } catch (error) {
      console.error('Error stopping:', error);
    }
  };

  if (!settings) {
    return (
      <div className="h-screen w-screen flex bg-zinc-950 text-zinc-100">
        <div className="flex-1 flex flex-col items-center justify-center gap-4">
          {loadError ? (
            <>
              <div className="text-red-400 text-center max-w-md px-4">
                <p className="font-semibold mb-2">Failed to Initialize</p>
                <p className="text-sm text-zinc-400 mb-4">{loadError}</p>
                <p className="text-xs text-zinc-500 mb-4">
                  window.api: {(window as any).api ? 'available' : 'NOT available'}<br/>
                  Retry count: {retryCount}
                </p>
              </div>
              <button
                onClick={handleRetry}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 text-black rounded-lg transition-colors"
              >
                Retry
              </button>
            </>
          ) : (
            <div className="flex items-center gap-3">
              <div className="w-5 h-5 border-2 border-yellow-500 border-t-transparent rounded-full animate-spin" />
              <span className="text-zinc-400">Loading...</span>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen flex overflow-hidden" style={{ backgroundColor: 'var(--bg-shrine)', color: 'var(--text-primary)' }}>

      {/* Sidebar - Dragon's Compact Shrine */}
      <div className="w-16 h-full flex flex-col justify-between py-3 relative z-20" style={{ backgroundColor: 'var(--bg-shrine)', borderRight: '1px solid var(--gold-muted)' }}>

        {/* Nav Items */}
        <div className="flex flex-col items-center gap-1 px-2">
          {navItems.map((item) => {
            const isActive = activeView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => setActiveView(item.id)}
                className="relative w-12 h-12 rounded-xl flex items-center justify-center transition-all duration-300 group"
                style={{
                  backgroundColor: isActive ? 'var(--bg-card)' : 'transparent',
                  color: isActive ? 'var(--gold-primary)' : 'var(--text-secondary)',
                }}
                onMouseEnter={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'var(--bg-panel)';
                    e.currentTarget.style.color = 'var(--text-primary)';
                    e.currentTarget.style.transform = 'translateX(2px)';
                  }
                }}
                onMouseLeave={(e) => {
                  if (!isActive) {
                    e.currentTarget.style.backgroundColor = 'transparent';
                    e.currentTarget.style.color = 'var(--text-secondary)';
                    e.currentTarget.style.transform = 'translateX(0)';
                  }
                }}
              >
                <item.icon className="w-5 h-5" strokeWidth={1.5} />

                {/* Gold active bar */}
                {isActive && (
                  <div className="absolute left-0 top-2 bottom-2 w-1 rounded-r-full" style={{ backgroundColor: 'var(--gold-primary)' }} />
                )}

                {/* Tooltip */}
                <div
                  className="absolute left-14 px-2 py-1 text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none whitespace-nowrap"
                  style={{
                    backgroundColor: 'var(--bg-card)',
                    border: '1px solid var(--gold-muted)',
                    color: 'var(--text-primary)',
                    zIndex: 9999,
                  }}
                >
                  {item.label}
                </div>
              </button>
            );
          })}
        </div>

        {/* Bottom Actions */}
        <div className="flex flex-col items-center gap-2 px-2">
          {/* Gold Divider */}
          <div className="gold-divider" />

          {/* Invoke Button */}
          <ShrineActionButton
            onClick={handleSpeak}
            icon={<Volume2 className="w-5 h-5" style={{ color: 'var(--gold-primary)' }} strokeWidth={1.5} />}
            label="INVOKE"
            isSpeaking={isSpeaking}
            disabled={isSpeaking}
          />

          {/* Silence Button */}
          <ShrineActionButton
            onClick={handleStop}
            icon={<VolumeX className="w-5 h-5" style={{ color: 'var(--text-secondary)' }} strokeWidth={1.5} />}
            label="SILENCE"
            variant="silence"
          />

          {/* Gold Divider */}
          <div className="gold-divider" />

          {/* Engine Seal */}
          <EngineSeal engine={settings.engine} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-auto">
          
          {activeView === 'tts' && (
            <div className="p-6">
              <TtsControls settings={settings} onUpdateSettings={updateSettings} />
            </div>
          )}

          {activeView === 'hotkeys' && (
            <div className="p-6">
              <div className="max-w-2xl">
                <h2 className="shrine-header">
                  <div className="header-icon-shrine">
                    <Keyboard />
                  </div>
                  <span className="header-text">Global Hotkeys</span>
                </h2>

                <div className="content-card p-5">
                  <label className="flex items-center gap-3 mb-5 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.hotkeyEnabled}
                      onChange={(e) => updateSettings({ hotkeyEnabled: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className={`shrine-toggle ${settings.hotkeyEnabled ? 'active' : ''}`} />
                    <span style={{ color: 'var(--text-primary)' }}>Enable global hotkeys</span>
                  </label>

                  <div>
                    <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Speak Clipboard Hotkey</label>
                    <input
                      type="text"
                      value={settings.hotkey}
                      onChange={(e) => updateSettings({ hotkey: e.target.value })}
                      placeholder="CommandOrControl+Shift+S"
                      className="shrine-input"
                    />
                    <p className="text-xs mt-2" style={{ color: 'var(--text-muted)' }}>Format: CommandOrControl+Shift+S</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeView === 'clipboard' && (
            <div className="p-6">
              <div className="max-w-2xl">
                <h2 className="shrine-header">
                  <div className="header-icon-shrine">
                    <Clipboard />
                  </div>
                  <span className="header-text">Auto-speak</span>
                </h2>

                <div className="content-card p-5 space-y-5">
                  <label className="flex items-center gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={settings.autoSpeak}
                      onChange={(e) => updateSettings({ autoSpeak: e.target.checked })}
                      className="sr-only peer"
                    />
                    <div className={`shrine-toggle ${settings.autoSpeak ? 'active' : ''}`} />
                    <span style={{ color: 'var(--text-primary)' }}>Auto-speak on clipboard change</span>
                  </label>

                  <div>
                    <label className="block text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                      Max characters: <span style={{ color: 'var(--gold-primary)', fontFamily: 'var(--font-mono)' }}>{settings.maxChars}</span>
                    </label>
                    <input
                      type="range"
                      min="50"
                      max="10000"
                      value={settings.maxChars}
                      onChange={(e) => updateSettings({ maxChars: parseInt(e.target.value) })}
                      className="w-full"
                    />
                    <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                      <span>50</span>
                      <span>5000</span>
                      <span>10000</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activeView === 'voice' && (
            <div className="p-6">
              <VoiceAssistantControls settings={settings} onUpdateSettings={updateSettings} />
            </div>
          )}

          {activeView === 'mcp' && (
            <div className="p-6">
              <MCPControls />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default App;
