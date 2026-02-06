/**
 * TTS Engine Wrapper
 * 
 * Wraps Web Speech API SpeechSynthesis with fallback
 * for main process (simulated) execution.
 * 
 * Requirements: 3.1, 3.2, 3.3
 */

import {
  VoiceInfo,
  SpeakParams,
  SpeechUtterance,
  TTSConfig,
} from './types';
import { EdgeTTSBackend } from './edge-tts-backend';
import { getApiKey as tokenGetApiKey } from '../../integrations/token-store';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import * as os from 'os';
import { execFileSync } from 'child_process';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

interface SpeakOptions {
  text: string;
  voice?: string;
  rate?: number;
  pitch?: number;
  volume?: number;
  onStart?: () => void;
  onEnd?: () => void;
  onError?: (error: Error) => void;
}

// ═══════════════════════════════════════════════════════════════════════════════
// TTS Engine
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * TTS Engine wrapper for speech synthesis
 * Requirements: 3.1, 3.2
 */
export class TTSEngine {
  private synthesis: SpeechSynthesis | null = null;
  private voices: VoiceInfo[] = [];
  private currentUtterance: SpeechSynthesisUtterance | null = null;
  private isSpeaking: boolean = false;
  private isPaused: boolean = false;
  private useSimulated: boolean = false;
  private simulatedTimeout: NodeJS.Timeout | null = null;
  private edgeTTS: EdgeTTSBackend;
  
  constructor() {
    // Initialize EdgeTTS backend
    this.edgeTTS = new EdgeTTSBackend();
    
    // Check if Web Speech API is available
    if (typeof window !== 'undefined' && window.speechSynthesis) {
      this.synthesis = window.speechSynthesis;
      this.loadVoices();
    } else {
      // Main process - use EdgeTTS
      console.log('[TTSEngine] Web Speech API not available, using EdgeTTS backend');
      this.useSimulated = true;
      this.loadEdgeTTSVoices();
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Voice Management
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Load voices from Speech Synthesis
   */
  private loadVoices(): void {
    if (!this.synthesis) return;
    
    const loadVoiceList = () => {
      const synthVoices = this.synthesis!.getVoices();
      this.voices = synthVoices.map(v => ({
        id: v.voiceURI,
        name: v.name,
        language: v.lang,
        isLocal: v.localService,
      }));
      console.log(`[TTSEngine] Loaded ${this.voices.length} voices`);
    };
    
    // Voices may load asynchronously
    if (this.synthesis.getVoices().length > 0) {
      loadVoiceList();
    } else {
      this.synthesis.onvoiceschanged = loadVoiceList;
    }
  }
  
  /**
   * Load Edge TTS voices
   */
  private async loadEdgeTTSVoices(): Promise<void> {
    const voiceNames = await this.edgeTTS.getVoices();
    this.voices = voiceNames.map(name => ({
      id: name,
      name: name.replace('Neural', ' (Neural)'),
      language: name.split('-').slice(0, 2).join('-'),
      isLocal: false,
    }));
    console.log(`[TTSEngine] Loaded ${this.voices.length} Edge TTS voices`);
  }
  
  /**
   * Get available voices
   */
  getVoices(): VoiceInfo[] {
    return [...this.voices];
  }
  
  /**
   * Check if TTS engine is available
   */
  isAvailable(): boolean {
    return this.synthesis !== null || this.useSimulated;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Speech Control
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Speak text
   * Requirements: 3.1
   */
  async speak(options: SpeakOptions): Promise<SpeechUtterance> {
    const {
      text,
      voice = 'default',
      rate = 1.0,
      pitch = 1.0,
      volume = 1.0,
      onStart,
      onEnd,
      onError,
    } = options;
    
    const utteranceId = `utterance-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const estimatedDuration = this.estimateDuration(text, rate);
    
    const utterance: SpeechUtterance = {
      id: utteranceId,
      text,
      voice,
      startTime: Date.now(),
      estimatedDuration,
      state: 'pending',
    };
    
    if (this.useSimulated) {
      // Check if ElevenLabs is the configured provider and key exists
      const provider = this.getConfiguredProvider();
      if (provider === 'elevenlabs' && tokenGetApiKey('elevenlabs')) {
        return this.speakElevenLabs(utterance, onStart, onEnd, onError);
      }
      return this.speakSimulated(utterance, onStart, onEnd, onError);
    }

    return this.speakNative(utterance, { rate, pitch, volume, voice }, onStart, onEnd, onError);
  }
  
  /**
   * Speak using native Web Speech API
   */
  private speakNative(
    utterance: SpeechUtterance,
    options: { rate: number; pitch: number; volume: number; voice: string },
    onStart?: () => void,
    onEnd?: () => void,
    onError?: (error: Error) => void
  ): Promise<SpeechUtterance> {
    return new Promise((resolve, reject) => {
      if (!this.synthesis) {
        reject(new Error('Speech synthesis not available'));
        return;
      }
      
      const synthUtterance = new SpeechSynthesisUtterance(utterance.text);
      synthUtterance.rate = Math.max(0.1, Math.min(2.0, options.rate));
      synthUtterance.pitch = Math.max(0.5, Math.min(2.0, options.pitch));
      synthUtterance.volume = Math.max(0, Math.min(1, options.volume));
      
      // Find voice
      const synthVoice = this.synthesis.getVoices().find(v => 
        v.voiceURI === options.voice || v.name === options.voice
      );
      if (synthVoice) {
        synthUtterance.voice = synthVoice;
      }
      
      synthUtterance.onstart = () => {
        this.isSpeaking = true;
        utterance.state = 'speaking';
        onStart?.();
      };
      
      synthUtterance.onend = () => {
        this.isSpeaking = false;
        this.currentUtterance = null;
        utterance.state = 'completed';
        onEnd?.();
        resolve(utterance);
      };
      
      synthUtterance.onerror = (event) => {
        this.isSpeaking = false;
        this.currentUtterance = null;
        utterance.state = 'cancelled';
        const error = new Error(event.error || 'Speech synthesis error');
        onError?.(error);
        reject(error);
      };
      
      this.currentUtterance = synthUtterance as any;
      this.synthesis.speak(synthUtterance);
    });
  }
  
  /**
   * Speak using EdgeTTS backend (for main process)
   */
  private async speakSimulated(
    utterance: SpeechUtterance,
    onStart?: () => void,
    onEnd?: () => void,
    onError?: (error: Error) => void
  ): Promise<SpeechUtterance> {
    console.log(`[TTSEngine] EdgeTTS speak: "${utterance.text.substring(0, 50)}..."`);
    
    this.isSpeaking = true;
    utterance.state = 'speaking';
    onStart?.();
    
    try {
      // Set voice if specified
      if (utterance.voice && utterance.voice !== 'default') {
        this.edgeTTS.setVoice(utterance.voice);
      }
      
      const result = await this.edgeTTS.speak(utterance.text);
      
      this.isSpeaking = false;
      
      if (result.success) {
        utterance.state = 'completed';
        onEnd?.();
      } else {
        utterance.state = 'cancelled';
        onError?.(new Error(result.error || 'TTS failed'));
      }
      
      return utterance;
    } catch (error) {
      this.isSpeaking = false;
      utterance.state = 'cancelled';
      const err = error instanceof Error ? error : new Error('Unknown TTS error');
      onError?.(err);
      return utterance;
    }
  }
  
  /**
   * Read configured TTS provider from .claude/settings.json
   */
  private getConfiguredProvider(): string {
    try {
      const projectRoot = process.env.KURORYUU_PROJECT_ROOT ||
                          process.env.KURORYUU_ROOT ||
                          join(__dirname, '../../../../..');
      const settingsPath = join(projectRoot, '.claude', 'settings.json');
      const content = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content);
      return settings.kuroPlugin?.tts?.provider || 'edge_tts';
    } catch {
      return 'edge_tts';
    }
  }

  /**
   * Read ElevenLabs voice settings from .claude/settings.json
   */
  private getElevenLabsSettings(): { voiceId: string; modelId: string; stability: number; similarity: number } {
    try {
      const projectRoot = process.env.KURORYUU_PROJECT_ROOT ||
                          process.env.KURORYUU_ROOT ||
                          join(__dirname, '../../../../..');
      const settingsPath = join(projectRoot, '.claude', 'settings.json');
      const content = readFileSync(settingsPath, 'utf-8');
      const settings = JSON.parse(content);
      const tts = settings.kuroPlugin?.tts || {};
      return {
        voiceId: tts.voice || '21m00Tcm4TlvDq8ikWAM',
        modelId: tts.elevenlabsModelId || 'eleven_turbo_v2_5',
        stability: tts.elevenlabsStability ?? 0.5,
        similarity: tts.elevenlabsSimilarity ?? 0.75,
      };
    } catch {
      return { voiceId: '21m00Tcm4TlvDq8ikWAM', modelId: 'eleven_turbo_v2_5', stability: 0.5, similarity: 0.75 };
    }
  }

  /**
   * Speak using ElevenLabs REST API + PowerShell playback
   */
  private async speakElevenLabs(
    utterance: SpeechUtterance,
    onStart?: () => void,
    onEnd?: () => void,
    onError?: (error: Error) => void
  ): Promise<SpeechUtterance> {
    const apiKey = tokenGetApiKey('elevenlabs');
    if (!apiKey) {
      // Fallback to EdgeTTS
      return this.speakSimulated(utterance, onStart, onEnd, onError);
    }

    const { voiceId, modelId, stability, similarity } = this.getElevenLabsSettings();
    console.log(`[TTSEngine] ElevenLabs speak: "${utterance.text.substring(0, 50)}..." voice=${voiceId}`);

    this.isSpeaking = true;
    utterance.state = 'speaking';
    onStart?.();

    try {
      const response = await fetch(`https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`, {
        method: 'POST',
        headers: {
          'Accept': 'audio/mpeg',
          'Content-Type': 'application/json',
          'xi-api-key': apiKey,
        },
        body: JSON.stringify({
          text: utterance.text,
          model_id: modelId,
          voice_settings: { stability, similarity_boost: similarity },
        }),
      });

      if (!response.ok) {
        throw new Error(`ElevenLabs API error: ${response.status}`);
      }

      const arrayBuffer = await response.arrayBuffer();
      const tmpPath = join(os.tmpdir(), `elevenlabs_tts_${Date.now()}.mp3`);
      writeFileSync(tmpPath, Buffer.from(arrayBuffer));

      // Play via PowerShell MediaPlayer
      const escapedPath = tmpPath.replace(/\\/g, '\\\\').replace(/'/g, "''");
      const psCmd = `
Add-Type -AssemblyName PresentationCore
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open([System.Uri]::new('${escapedPath}'))
Start-Sleep -Milliseconds 500
$player.Play()
while ($player.NaturalDuration.HasTimeSpan -eq $false) { Start-Sleep -Milliseconds 100 }
$duration = $player.NaturalDuration.TimeSpan.TotalMilliseconds
Start-Sleep -Milliseconds $duration
$player.Close()`;

      execFileSync('powershell.exe', ['-NoProfile', '-Command', psCmd], {
        encoding: 'utf-8',
        timeout: 90000,
        windowsHide: true,
      });

      // Cleanup
      try { unlinkSync(tmpPath); } catch { /* ignore */ }

      this.isSpeaking = false;
      utterance.state = 'completed';
      onEnd?.();
      return utterance;
    } catch (error) {
      this.isSpeaking = false;
      utterance.state = 'cancelled';
      const err = error instanceof Error ? error : new Error('ElevenLabs TTS error');
      console.error('[TTSEngine] ElevenLabs error, falling back to EdgeTTS:', err.message);
      onError?.(err);
      return utterance;
    }
  }

  /**
   * Stop current speech
   * Requirements: 3.2
   */
  stop(): boolean {
    if (this.useSimulated) {
      if (this.simulatedTimeout) {
        clearTimeout(this.simulatedTimeout);
        this.simulatedTimeout = null;
      }
      // Stop EdgeTTS playback
      this.edgeTTS.stop();
      this.isSpeaking = false;
      this.isPaused = false;
      return true;
    }
    
    if (this.synthesis) {
      this.synthesis.cancel();
      this.isSpeaking = false;
      this.isPaused = false;
      this.currentUtterance = null;
      return true;
    }
    
    return false;
  }
  
  /**
   * Pause current speech
   * Requirements: 3.3
   */
  pause(): boolean {
    if (this.useSimulated) {
      // Simulated doesn't support pause
      return false;
    }
    
    if (this.synthesis && this.isSpeaking && !this.isPaused) {
      this.synthesis.pause();
      this.isPaused = true;
      return true;
    }
    
    return false;
  }
  
  /**
   * Resume paused speech
   * Requirements: 3.3
   */
  resume(): boolean {
    if (this.useSimulated) {
      return false;
    }
    
    if (this.synthesis && this.isPaused) {
      this.synthesis.resume();
      this.isPaused = false;
      return true;
    }
    
    return false;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Status
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Get speaking state
   */
  getIsSpeaking(): boolean {
    return this.isSpeaking;
  }
  
  /**
   * Get paused state
   */
  getIsPaused(): boolean {
    return this.isPaused;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Estimate speech duration based on text length and rate
   * Assumes average 150 words per minute
   */
  private estimateDuration(text: string, rate: number): number {
    const words = text.split(/\s+/).length;
    const baseWpm = 150;
    const adjustedWpm = baseWpm * rate;
    const minutes = words / adjustedWpm;
    return Math.round(minutes * 60 * 1000); // Convert to ms
  }
}
