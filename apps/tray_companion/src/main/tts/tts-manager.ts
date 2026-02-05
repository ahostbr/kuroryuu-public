import { getSettings } from '../settings';
import { WindowsTTS } from './windows-tts';
import { EdgeTTS } from './edge-tts';
import { ElevenLabsTTS } from './elevenlabs-tts';
import { getApiKey } from '../token-store';

export interface TTSBackend {
  speak(text: string): Promise<{ success: boolean; error?: string }>;
  stop(): void;
  getVoices(): Promise<string[]>;
  setRate(rate: number): void;
  setVolume(volume: number): void;
  setVoice(voice: string): void;
}

export interface TTSResult {
  success: boolean;
  error?: string;
}

let windowsTTS: WindowsTTS;
let edgeTTS: EdgeTTS;
let elevenlabsTTS: ElevenLabsTTS | null = null;
let currentBackend: TTSBackend;
let isSpeaking = false;

export function initializeTTS(): void {
  console.log('[TTS] initializeTTS() called');
  windowsTTS = new WindowsTTS();
  edgeTTS = new EdgeTTS();

  // Initialize ElevenLabs if API key exists
  const apiKey = getApiKey('elevenlabs');
  if (apiKey) {
    const settings = getSettings();
    elevenlabsTTS = new ElevenLabsTTS({
      apiKey,
      voiceId: settings.elevenlabsVoice,
      modelId: settings.elevenlabsModelId,
      stability: settings.elevenlabsStability,
      similarityBoost: settings.elevenlabsSimilarity
    });
    console.log('[TTS] ElevenLabs initialized');
  }

  // Set initial backend based on settings
  const settings = getSettings();
  console.log('[TTS] Settings engine:', settings.engine);
  currentBackend = selectBackend(settings.engine);

  console.log('[TTS] Manager initialized with backend:', settings.engine);
}

function selectBackend(engine: string): TTSBackend {
  switch (engine) {
    case 'elevenlabs':
      if (elevenlabsTTS) return elevenlabsTTS;
      console.warn('[TTS] ElevenLabs not configured, falling back to Edge');
      return edgeTTS;
    case 'windows':
      return windowsTTS;
    case 'edge':
    default:
      return edgeTTS;
  }
}

export async function speakText(text: string): Promise<TTSResult> {
  console.log('[TTS] speakText() called, text length:', text.length);
  if (isSpeaking) {
    console.log('[TTS] Already speaking, stopping first');
    stopSpeaking();
  }
  
  const settings = getSettings();
  console.log('[TTS] Settings engine:', settings.engine);

  // Switch backend if needed
  const newBackend = selectBackend(settings.engine);
  if (newBackend !== currentBackend) {
    console.log('[TTS] Switching backend to:', settings.engine);
    currentBackend = newBackend;
  }
  
  // Truncate text if too long
  let processedText = text.trim();
  if (processedText.length > settings.maxChars) {
    processedText = processedText.substring(0, settings.maxChars) + '...';
  }
  
  if (!processedText) {
    return { success: false, error: 'No text to speak' };
  }
  
  try {
    isSpeaking = true;
    
    // Configure backend with current settings
    if (currentBackend === windowsTTS) {
      console.log('[TTS] Configuring Windows TTS - rate:', settings.windowsRate, 'volume:', settings.windowsVolume, 'voice:', settings.windowsVoice);
      currentBackend.setRate(settings.windowsRate);
      currentBackend.setVolume(settings.windowsVolume);
      if (settings.windowsVoice) {
        currentBackend.setVoice(settings.windowsVoice);
      }
    } else if (currentBackend === edgeTTS) {
      console.log('[TTS] Configuring Edge TTS - rate:', settings.edgeRate, 'voice:', settings.edgeVoice);
      currentBackend.setRate(settings.edgeRate);
      if (settings.edgeVoice) {
        currentBackend.setVoice(settings.edgeVoice);
      }
    } else if (currentBackend === elevenlabsTTS && elevenlabsTTS) {
      console.log('[TTS] Configuring ElevenLabs TTS - voice:', settings.elevenlabsVoice, 'model:', settings.elevenlabsModelId);
      elevenlabsTTS.updateConfig({
        voiceId: settings.elevenlabsVoice,
        modelId: settings.elevenlabsModelId,
        stability: settings.elevenlabsStability,
        similarityBoost: settings.elevenlabsSimilarity
      });
    }
    
    console.log('[TTS] Speaking text with backend...');
    const result = await currentBackend.speak(processedText);
    console.log('[TTS] Speak result:', result);
    isSpeaking = false;
    
    console.log('TTS speak result:', result);
    return result;
  } catch (error) {
    isSpeaking = false;
    const errorMessage = error instanceof Error ? error.message : 'Unknown TTS error';
    console.error('TTS speak error:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

export function stopSpeaking(): void {
  if (currentBackend && isSpeaking) {
    currentBackend.stop();
    isSpeaking = false;
    console.log('TTS stopped');
  }
}

export async function getVoices(): Promise<string[]> {
  const settings = getSettings();
  let backend: TTSBackend;
  if (settings.engine === 'elevenlabs' && elevenlabsTTS) {
    backend = elevenlabsTTS;
  } else if (settings.engine === 'edge') {
    backend = edgeTTS;
  } else {
    backend = windowsTTS;
  }

  try {
    return await backend.getVoices();
  } catch (error) {
    console.error('Error getting voices:', error);
    return [];
  }
}

export function isTTSSpeaking(): boolean {
  return isSpeaking;
}

export function getCurrentEngine(): string {
  const settings = getSettings();
  return settings.engine;
}

export function reinitializeElevenLabs(): void {
  const apiKey = getApiKey('elevenlabs');
  if (apiKey) {
    const settings = getSettings();
    elevenlabsTTS = new ElevenLabsTTS({
      apiKey,
      voiceId: settings.elevenlabsVoice,
      modelId: settings.elevenlabsModelId,
      stability: settings.elevenlabsStability,
      similarityBoost: settings.elevenlabsSimilarity
    });
    console.log('[TTS] ElevenLabs reinitialized');
  } else {
    elevenlabsTTS = null;
    console.log('[TTS] ElevenLabs cleared (no API key)');
  }
}

export async function getElevenLabsVoices(): Promise<any[]> {
  if (!elevenlabsTTS) return [];
  return await elevenlabsTTS.getVoicesFromApi();
}
