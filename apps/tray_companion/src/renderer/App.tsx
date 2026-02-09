import { useState, useEffect } from 'react';
import { Settings, Volume2, VolumeX, MessageSquare } from 'lucide-react';
import TtsControls from './components/TtsControls';
import VoiceAssistantControls from './components/VoiceAssistantControls';

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
  engine: 'windows' | 'edge' | 'elevenlabs';
}

function EngineSeal({ engine }: EngineSealProps) {
  const sealClass = engine === 'edge' ? 'edge' : engine === 'elevenlabs' ? 'elevenlabs' : '';
  const displayName = engine === 'elevenlabs' ? '11LABS' : engine.toUpperCase();
  return (
    <div className={`engine-seal ${sealClass}`}>
      <div className="seal-ring">
        <div className="seal-badge">
          <span className="engine-name">{displayName}</span>
        </div>
      </div>
      <div className="status-dot" />
    </div>
  );
}

interface AppSettings {
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
}

type View = 'tts-settings' | 'voice';

interface NavItem {
  id: View;
  label: string;
  icon: React.ElementType;
}

const navItems: NavItem[] = [
  { id: 'tts-settings', label: 'TTS Settings', icon: Settings },
  { id: 'voice', label: 'Voice Assistant', icon: MessageSquare },
];

function App(): React.JSX.Element {
  const [settings, setSettings] = useState<AppSettings | null>(null);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [activeView, setActiveView] = useState<View>('tts-settings');
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
    <div className="h-screen w-screen flex flex-col overflow-hidden" style={{ backgroundColor: 'var(--bg-shrine)', color: 'var(--text-primary)' }}>

      {/* Top Bar */}
      <div className="shrine-topbar">
        {/* Left: Tab navigation */}
        <div className="flex items-center gap-1">
          {navItems.map((item) => (
            <button
              key={item.id}
              onClick={() => setActiveView(item.id)}
              className={`shrine-topbar-tab ${activeView === item.id ? 'active' : ''}`}
            >
              <item.icon className="w-4 h-4" strokeWidth={1.5} />
              <span>{item.label}</span>
            </button>
          ))}
        </div>

        {/* Right: Action buttons + Engine seal */}
        <div className="shrine-topbar-actions">
          <ShrineActionButton
            onClick={handleSpeak}
            icon={<Volume2 className="w-4 h-4" style={{ color: 'var(--gold-primary)' }} strokeWidth={1.5} />}
            label="INVOKE"
            isSpeaking={isSpeaking}
            disabled={isSpeaking}
          />
          <ShrineActionButton
            onClick={handleStop}
            icon={<VolumeX className="w-4 h-4" style={{ color: 'var(--text-secondary)' }} strokeWidth={1.5} />}
            label="SILENCE"
            variant="silence"
          />
          <div className="gold-divider-v" />
          <EngineSeal engine={settings.engine} />
        </div>
      </div>

      {/* Main Content */}
      <div className="flex-1 overflow-hidden">
        <div className="h-full overflow-auto">

          {activeView === 'tts-settings' && (
            <div className="p-6">
              <TtsControls settings={settings} onUpdateSettings={updateSettings} />
            </div>
          )}

          {activeView === 'voice' && (
            <div className="p-6">
              <VoiceAssistantControls settings={settings} onUpdateSettings={updateSettings} />
            </div>
          )}

        </div>
      </div>
    </div>
  );
}

export default App;
