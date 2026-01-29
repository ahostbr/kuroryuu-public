import { useState, useEffect } from 'react';
import { Settings, RefreshCw } from 'lucide-react';

interface TtsControlsProps {
  settings: {
    engine: 'windows' | 'edge';
    windowsRate: number;
    windowsVolume: number;
    windowsVoice: string;
    edgeRate: number;
    edgeVoice: string;
  };
  onUpdateSettings: (settings: any) => void;
}

function TtsControls({ settings, onUpdateSettings }: TtsControlsProps): React.JSX.Element {
  const [voices, setVoices] = useState<string[]>([]);
  const [loadingVoices, setLoadingVoices] = useState(false);

  useEffect(() => {
    if (settings.engine) {
      loadVoices();
    }
  }, [settings.engine]);

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
        <div className="grid grid-cols-2 gap-3">
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
    </div>
  );
}

export default TtsControls;
