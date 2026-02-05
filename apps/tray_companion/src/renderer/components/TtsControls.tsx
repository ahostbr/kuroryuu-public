import { useState, useEffect } from 'react';
import { Settings, RefreshCw, Play, Key, Trash2 } from 'lucide-react';

interface TtsControlsProps {
  settings: {
    engine: 'windows' | 'edge' | 'elevenlabs';
    windowsRate: number;
    windowsVolume: number;
    windowsVoice: string;
    edgeRate: number;
    edgeVoice: string;
    elevenlabsVoice: string;
    elevenlabsModelId: 'eleven_turbo_v2_5' | 'eleven_multilingual_v2';
    elevenlabsStability: number;
    elevenlabsSimilarity: number;
  };
  onUpdateSettings: (settings: any) => void;
}

function TtsControls({ settings, onUpdateSettings }: TtsControlsProps): React.JSX.Element {
  const [voices, setVoices] = useState<string[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);
  const [hasElevenLabsKey, setHasElevenLabsKey] = useState(false);
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [elevenlabsVoices, setElevenlabsVoices] = useState<{voice_id: string, name: string}[]>([]);
  const [loadingElevenLabsVoices, setLoadingElevenLabsVoices] = useState(false);
  const [testingVoice, setTestingVoice] = useState(false);

  useEffect(() => {
    if (settings.engine === 'windows' || settings.engine === 'edge') {
      loadVoices();
    }
  }, [settings.engine]);

  useEffect(() => {
    checkElevenLabsKey();
  }, []);

  const loadVoices = async () => {
    setLoadingVoices(true);
    try {
      const availableVoices = await (window as any).api.tts.getVoices();
      setVoices(availableVoices);
    } catch (error) {
      console.error('Error loading voices:', error);
      setVoices([]);
    } finally {
      setLoadingVoices(false);
    }
  };

  const checkElevenLabsKey = async () => {
    const has = await (window as any).api.elevenlabs.hasApiKey();
    setHasElevenLabsKey(has);
    if (has) loadElevenLabsVoices();
  };

  const saveElevenLabsKey = async () => {
    if (!apiKeyInput.trim()) return;
    const result = await (window as any).api.elevenlabs.setApiKey(apiKeyInput.trim());
    if (result.success) {
      setHasElevenLabsKey(true);
      setApiKeyInput('');
      loadElevenLabsVoices();
    }
  };

  const removeElevenLabsKey = async () => {
    await (window as any).api.elevenlabs.removeApiKey();
    setHasElevenLabsKey(false);
    setElevenlabsVoices([]);
  };

  const loadElevenLabsVoices = async () => {
    setLoadingElevenLabsVoices(true);
    try {
      const voices = await (window as any).api.elevenlabs.getVoices();
      setElevenlabsVoices(voices || []);
    } finally {
      setLoadingElevenLabsVoices(false);
    }
  };

  const previewVoice = async () => {
    setTestingVoice(true);
    try {
      await (window as any).api.elevenlabs.testVoice(
        settings.elevenlabsVoice,
        'Hello, this is a voice preview from ElevenLabs.'
      );
    } finally {
      setTestingVoice(false);
    }
  };

  return (
    <div className="max-w-2xl">
      <h2 className="shrine-header">
        <div className="header-icon-shrine">
          <Settings />
        </div>
        <span className="header-text">TTS Engine</span>
      </h2>
      
      {/* Engine Selection */}
      <div className="mb-6">
        <label className="block text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>Select Engine</label>
        <div className="grid grid-cols-3 gap-3">
          <button
            onClick={() => onUpdateSettings({ engine: 'windows' })}
            className="content-card p-4 text-left transition-all"
            style={{
              borderColor: settings.engine === 'windows' ? 'var(--gold-primary)' : undefined,
              boxShadow: settings.engine === 'windows' ? '0 0 12px var(--gold-glow)' : undefined,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                style={{ borderColor: settings.engine === 'windows' ? 'var(--gold-primary)' : 'var(--text-muted)' }}
              >
                {settings.engine === 'windows' && (
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--gold-primary)' }} />
                )}
              </div>
              <div>
                <div className="font-medium" style={{ color: 'var(--text-primary)' }}>Windows SAPI</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Built-in TTS</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => onUpdateSettings({ engine: 'edge' })}
            className="content-card p-4 text-left transition-all"
            style={{
              borderColor: settings.engine === 'edge' ? 'var(--gold-primary)' : undefined,
              boxShadow: settings.engine === 'edge' ? '0 0 12px var(--gold-glow)' : undefined,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                style={{ borderColor: settings.engine === 'edge' ? 'var(--gold-primary)' : 'var(--text-muted)' }}
              >
                {settings.engine === 'edge' && (
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: 'var(--gold-primary)' }} />
                )}
              </div>
              <div>
                <div className="font-medium" style={{ color: 'var(--text-primary)' }}>Edge TTS</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>Neural voices</div>
              </div>
            </div>
          </button>

          <button
            onClick={() => onUpdateSettings({ engine: 'elevenlabs' })}
            className="content-card p-4 text-left transition-all"
            style={{
              borderColor: settings.engine === 'elevenlabs' ? '#a855f7' : undefined,
              boxShadow: settings.engine === 'elevenlabs' ? '0 0 12px rgba(168, 85, 247, 0.5)' : undefined,
            }}
          >
            <div className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded-full border-2 flex items-center justify-center"
                style={{ borderColor: settings.engine === 'elevenlabs' ? '#a855f7' : 'var(--text-muted)' }}
              >
                {settings.engine === 'elevenlabs' && (
                  <div className="w-2 h-2 rounded-full" style={{ backgroundColor: '#a855f7' }} />
                )}
              </div>
              <div>
                <div className="font-medium" style={{ color: 'var(--text-primary)' }}>ElevenLabs</div>
                <div className="text-xs" style={{ color: 'var(--text-muted)' }}>AI voices</div>
              </div>
            </div>
          </button>
        </div>
      </div>

      {/* Windows SAPI Settings */}
      {settings.engine === 'windows' && (
        <div className="content-card p-5 space-y-5">
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>Windows SAPI Configuration</h3>

          <div>
            <label className="block text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Speech Rate: <span style={{ color: 'var(--gold-primary)', fontFamily: 'var(--font-mono)' }}>{settings.windowsRate}</span>
            </label>
            <input
              type="range"
              min="80"
              max="300"
              value={settings.windowsRate}
              onChange={(e) => onUpdateSettings({ windowsRate: parseInt(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              <span>Slow (80)</span>
              <span>Normal (200)</span>
              <span>Fast (300)</span>
            </div>
          </div>

          <div>
            <label className="block text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Volume: <span style={{ color: 'var(--gold-primary)', fontFamily: 'var(--font-mono)' }}>{Math.round(settings.windowsVolume * 100)}%</span>
            </label>
            <input
              type="range"
              min="0"
              max="1"
              step="0.1"
              value={settings.windowsVolume}
              onChange={(e) => onUpdateSettings({ windowsVolume: parseFloat(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              <span>0%</span>
              <span>50%</span>
              <span>100%</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Voice</label>
              <button
                onClick={loadVoices}
                disabled={loadingVoices}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--gold-muted)' }}
              >
                <RefreshCw className={`w-3 h-3 ${loadingVoices ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            <select
              value={settings.windowsVoice}
              onChange={(e) => onUpdateSettings({ windowsVoice: e.target.value })}
              disabled={loadingVoices}
              className="shrine-input"
            >
              <option value="">Default System Voice</option>
              {voices.map((voice) => (
                <option key={voice} value={voice}>{voice}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* Edge TTS Settings */}
      {settings.engine === 'edge' && (
        <div className="content-card p-5 space-y-5">
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>Edge TTS Configuration</h3>

          <div>
            <label className="block text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
              Speech Rate: <span style={{ color: 'var(--gold-primary)', fontFamily: 'var(--font-mono)' }}>{settings.edgeRate}%</span>
            </label>
            <input
              type="range"
              min="50"
              max="200"
              value={settings.edgeRate}
              onChange={(e) => onUpdateSettings({ edgeRate: parseInt(e.target.value) })}
              className="w-full"
            />
            <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
              <span>Slow (50%)</span>
              <span>Normal (100%)</span>
              <span>Fast (200%)</span>
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Neural Voice</label>
              <button
                onClick={loadVoices}
                disabled={loadingVoices}
                className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-colors disabled:opacity-50"
                style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid var(--gold-muted)' }}
              >
                <RefreshCw className={`w-3 h-3 ${loadingVoices ? 'animate-spin' : ''}`} />
                Refresh
              </button>
            </div>
            <select
              value={settings.edgeVoice}
              onChange={(e) => onUpdateSettings({ edgeVoice: e.target.value })}
              disabled={loadingVoices}
              className="shrine-input"
            >
              {voices.length === 0 && !loadingVoices && (
                <option value="en-US-AriaNeural">en-US-AriaNeural (Default)</option>
              )}
              {voices.map((voice) => (
                <option key={voice} value={voice}>{voice}</option>
              ))}
            </select>
          </div>
        </div>
      )}

      {/* ElevenLabs Settings */}
      {settings.engine === 'elevenlabs' && (
        <div className="content-card p-5 space-y-5">
          <h3 className="text-sm font-medium" style={{ color: 'var(--text-primary)', fontFamily: 'var(--font-mono)' }}>ElevenLabs Configuration</h3>

          {/* API Key Section */}
          <div>
            <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>API Key</label>
            {!hasElevenLabsKey ? (
              <div className="flex gap-2">
                <input
                  type="password"
                  value={apiKeyInput}
                  onChange={(e) => setApiKeyInput(e.target.value)}
                  placeholder="Enter your ElevenLabs API key"
                  className="shrine-input flex-1"
                />
                <button
                  onClick={saveElevenLabsKey}
                  disabled={!apiKeyInput.trim()}
                  className="flex items-center gap-1.5 px-3 py-2 text-xs rounded-lg transition-colors disabled:opacity-50"
                  style={{ backgroundColor: '#a855f7', color: 'white', border: 'none' }}
                >
                  <Key className="w-3 h-3" />
                  Save
                </button>
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 rounded-lg" style={{ backgroundColor: 'var(--bg-card)', border: '1px solid #a855f7' }}>
                <div className="flex items-center gap-2">
                  <Key className="w-4 h-4" style={{ color: '#a855f7' }} />
                  <span className="text-sm" style={{ color: 'var(--text-primary)' }}>API Key Configured</span>
                </div>
                <button
                  onClick={removeElevenLabsKey}
                  className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-colors hover:opacity-80"
                  style={{ backgroundColor: 'var(--bg-card)', color: '#ef4444', border: '1px solid #ef4444' }}
                >
                  <Trash2 className="w-3 h-3" />
                  Remove
                </button>
              </div>
            )}
          </div>

          {hasElevenLabsKey && (
            <>
              {/* Model Selection */}
              <div>
                <label className="block text-sm mb-2" style={{ color: 'var(--text-secondary)' }}>Model</label>
                <select
                  value={settings.elevenlabsModelId}
                  onChange={(e) => onUpdateSettings({ elevenlabsModelId: e.target.value })}
                  className="shrine-input"
                >
                  <option value="eleven_turbo_v2_5">Turbo v2.5 (Fast)</option>
                  <option value="eleven_multilingual_v2">Multilingual v2 (Quality)</option>
                </select>
              </div>

              {/* Voice Selection */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm" style={{ color: 'var(--text-secondary)' }}>Voice</label>
                  <div className="flex gap-2">
                    <button
                      onClick={loadElevenLabsVoices}
                      disabled={loadingElevenLabsVoices}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-colors disabled:opacity-50"
                      style={{ backgroundColor: 'var(--bg-card)', color: 'var(--text-primary)', border: '1px solid #a855f7' }}
                    >
                      <RefreshCw className={`w-3 h-3 ${loadingElevenLabsVoices ? 'animate-spin' : ''}`} />
                      Refresh
                    </button>
                    <button
                      onClick={previewVoice}
                      disabled={testingVoice || !settings.elevenlabsVoice}
                      className="flex items-center gap-1.5 px-2.5 py-1 text-xs rounded-lg transition-colors disabled:opacity-50"
                      style={{ backgroundColor: '#a855f7', color: 'white', border: 'none' }}
                    >
                      <Play className={`w-3 h-3 ${testingVoice ? 'animate-pulse' : ''}`} />
                      Preview
                    </button>
                  </div>
                </div>
                <select
                  value={settings.elevenlabsVoice}
                  onChange={(e) => onUpdateSettings({ elevenlabsVoice: e.target.value })}
                  disabled={loadingElevenLabsVoices}
                  className="shrine-input"
                >
                  <option value="">Select a voice...</option>
                  {elevenlabsVoices.map((voice) => (
                    <option key={voice.voice_id} value={voice.voice_id}>{voice.name}</option>
                  ))}
                </select>
              </div>

              {/* Stability Slider */}
              <div>
                <label className="block text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Stability: <span style={{ color: '#a855f7', fontFamily: 'var(--font-mono)' }}>{Math.round(settings.elevenlabsStability * 100)}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={settings.elevenlabsStability}
                  onChange={(e) => onUpdateSettings({ elevenlabsStability: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  <span>Variable (0%)</span>
                  <span>Stable (100%)</span>
                </div>
              </div>

              {/* Clarity + Similarity Slider */}
              <div>
                <label className="block text-sm mb-3" style={{ color: 'var(--text-secondary)' }}>
                  Clarity + Similarity: <span style={{ color: '#a855f7', fontFamily: 'var(--font-mono)' }}>{Math.round(settings.elevenlabsSimilarity * 100)}%</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  value={settings.elevenlabsSimilarity}
                  onChange={(e) => onUpdateSettings({ elevenlabsSimilarity: parseFloat(e.target.value) })}
                  className="w-full"
                />
                <div className="flex justify-between text-xs mt-1" style={{ color: 'var(--text-muted)' }}>
                  <span>Low (0%)</span>
                  <span>High (100%)</span>
                </div>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}

export default TtsControls;
