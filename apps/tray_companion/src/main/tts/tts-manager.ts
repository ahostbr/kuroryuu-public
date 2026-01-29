import { getSettings } from '../settings';
import { WindowsTTS } from './windows-tts';
import { EdgeTTS } from './edge-tts';

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
let currentBackend: TTSBackend;
let isSpeaking = false;

export function initializeTTS(): void {
  console.log('[TTS] initializeTTS() called');
  windowsTTS = new WindowsTTS();
  edgeTTS = new EdgeTTS();
  
  // Set initial backend based on settings
  const settings = getSettings();
  console.log('[TTS] Settings engine:', settings.engine);
  currentBackend = settings.engine === 'edge' ? edgeTTS : windowsTTS;
  
  console.log('[TTS] Manager initialized with backend:', settings.engine);
}

export async function speakText(text: string): Promise<TTSResult> {
  console.log('[TTS] speakText() called, text length:', text.length);
  if (isSpeaking) {
    console.log('[TTS] Already speaking, stopping first');
    stopSpeaking();
  }
  
  const settings = getSettings();
  console.log('[TTS] Settings engine:', settings.engine, 'currentBackend:', currentBackend === edgeTTS ? 'edge' : 'windows');
  
  // Switch backend if needed
  if (settings.engine === 'edge' && currentBackend !== edgeTTS) {
    console.log('[TTS] Switching to Edge TTS');
    currentBackend = edgeTTS;
  } else if (settings.engine === 'windows' && currentBackend !== windowsTTS) {
    console.log('[TTS] Switching to Windows TTS');
    currentBackend = windowsTTS;
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
  const backend = settings.engine === 'edge' ? edgeTTS : windowsTTS;
  
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
