/**
 * Voice/Microphone Types
 * For speech-to-text and TTS integration
 */

export type VoiceState = 
  | 'idle'
  | 'listening'
  | 'processing'
  | 'speaking'
  | 'error';

export interface VoiceConfig {
  enabled: boolean;
  language: string;
  autoSubmit: boolean;
  continuousListening: boolean;
  silenceTimeout: number;
}

export interface TTSConfig {
  enabled: boolean;
  voice: string;
  rate: number;
  pitch: number;
  volume: number;
  autoPlay: boolean;
}

export interface VoiceTranscript {
  text: string;
  confidence: number;
  isFinal: boolean;
  timestamp: number;
}

export interface SpeechRecognitionResult {
  transcript: string;
  confidence: number;
  alternatives: Array<{ transcript: string; confidence: number }>;
}

export const SUPPORTED_LANGUAGES = [
  { code: 'en-US', name: 'English (US)' },
  { code: 'en-GB', name: 'English (UK)' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'zh-CN', name: 'Chinese (Simplified)' },
  { code: 'ko-KR', name: 'Korean' },
  { code: 'pt-BR', name: 'Portuguese (Brazil)' },
  { code: 'it-IT', name: 'Italian' },
];
