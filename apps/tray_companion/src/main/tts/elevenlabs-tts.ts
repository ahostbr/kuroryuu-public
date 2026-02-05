import { TTSBackend, TTSResult } from './tts-manager';
import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { ElevenLabsClient } from 'elevenlabs';
import { Readable } from 'stream';

interface ElevenLabsConfig {
  apiKey: string;
  voiceId: string;
  modelId: 'eleven_turbo_v2_5' | 'eleven_multilingual_v2';
  stability: number; // 0-1
  similarityBoost: number; // 0-1
}

// ElevenLabs TTS implementation using official SDK
export class ElevenLabsTTS implements TTSBackend {
  private config: ElevenLabsConfig;
  private client: ElevenLabsClient | null = null;
  private rate: number = 100; // Not used by ElevenLabs (kept for interface compatibility)
  private volume: number = 100; // Not used by ElevenLabs (kept for interface compatibility)
  private audioProcess: any = null;
  private isActive: boolean = false;

  constructor(config?: Partial<ElevenLabsConfig>) {
    // Default configuration
    this.config = {
      apiKey: config?.apiKey || '',
      voiceId: config?.voiceId || 'EXAVITQu4vr4xnSDxMaL', // Default voice (Sarah)
      modelId: config?.modelId || 'eleven_turbo_v2_5',
      stability: config?.stability !== undefined ? config.stability : 0.5,
      similarityBoost: config?.similarityBoost !== undefined ? config.similarityBoost : 0.75
    };

    if (this.config.apiKey) {
      this.initializeClient();
    }

    console.log('ElevenLabs TTS backend initialized');
  }

  private initializeClient(): void {
    if (!this.config.apiKey) {
      console.warn('[ElevenLabs] No API key provided');
      return;
    }

    try {
      this.client = new ElevenLabsClient({ apiKey: this.config.apiKey });
      console.log('[ElevenLabs] Client initialized successfully');
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ElevenLabs] Failed to initialize client:', errorMessage);
    }
  }

  async speak(text: string): Promise<TTSResult> {
    console.log('[ElevenLabs] speak() called');
    console.log('[ElevenLabs] Text length:', text.length);
    console.log('[ElevenLabs] Voice:', this.config.voiceId);
    console.log('[ElevenLabs] Model:', this.config.modelId);

    if (!this.client) {
      if (!this.config.apiKey) {
        return { success: false, error: 'ElevenLabs API key not configured' };
      }
      this.initializeClient();
      if (!this.client) {
        return { success: false, error: 'Failed to initialize ElevenLabs client' };
      }
    }

    try {
      this.isActive = true;

      // Generate unique temp file path
      const tmpDir = os.tmpdir();
      const tempPath = path.join(tmpDir, `elevenlabs_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`);
      console.log('[ElevenLabs] Temp file:', tempPath);

      // Stream audio from ElevenLabs API
      console.log('[ElevenLabs] Requesting audio stream from API...');
      const audioStream = await this.client.textToSpeech.convertAsStream(this.config.voiceId, {
        text,
        model_id: this.config.modelId,
        voice_settings: {
          stability: this.config.stability,
          similarity_boost: this.config.similarityBoost
        }
      });

      // Write stream to temp file
      await this.writeStreamToFile(audioStream, tempPath);
      console.log('[ElevenLabs] Audio file written successfully');

      // Verify file exists and has content
      if (!fs.existsSync(tempPath)) {
        throw new Error('Audio file was not created');
      }

      const stats = fs.statSync(tempPath);
      if (stats.size === 0) {
        throw new Error('Audio file is empty');
      }

      console.log('[ElevenLabs] Audio file size:', stats.size, 'bytes');

      // Play audio using PowerShell MediaPlayer (same as EdgeTTS)
      await this.playAudioWithPowerShell(tempPath);

      this.isActive = false;
      console.log('[ElevenLabs] speak() completed successfully');
      return { success: true };

    } catch (error) {
      this.isActive = false;
      const errorMessage = error instanceof Error ? error.message : 'ElevenLabs TTS error';
      console.error('[ElevenLabs] speak() error:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  private writeStreamToFile(stream: AsyncIterable<Uint8Array> | Readable, filePath: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      try {
        const writeStream = fs.createWriteStream(filePath);

        writeStream.on('error', (error) => {
          console.error('[ElevenLabs] Write stream error:', error);
          reject(error);
        });

        writeStream.on('finish', () => {
          console.log('[ElevenLabs] Write stream finished');
          resolve();
        });

        // Handle AsyncIterable (from ElevenLabs SDK)
        if (Symbol.asyncIterator in stream) {
          for await (const chunk of stream as AsyncIterable<Uint8Array>) {
            writeStream.write(Buffer.from(chunk));
          }
          writeStream.end();
        }
        // Handle Node Readable stream
        else if (stream instanceof Readable) {
          stream.pipe(writeStream);
        }
        else {
          reject(new Error('Unsupported stream type'));
        }
      } catch (error) {
        reject(error);
      }
    });
  }

  private playAudioWithPowerShell(audioPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      this.playWithMediaPlayer(audioPath, resolve, reject);
    });
  }

  private playWithMediaPlayer(audioPath: string, resolve: Function, reject: Function): void {
    console.log('[ElevenLabs] Playing audio with MediaPlayer');
    console.log('[ElevenLabs] Audio file:', audioPath);
    console.log('[ElevenLabs] File exists:', fs.existsSync(audioPath));

    const escapedPath = audioPath.replace(/\\/g, '\\\\').replace(/'/g, "''");

    // Use .NET MediaPlayer - plays audio without any visible window
    const psScript = `
Add-Type -AssemblyName PresentationCore
$mediaPlayer = New-Object System.Windows.Media.MediaPlayer
$mediaPlayer.Open([System.Uri]::new('${escapedPath}'))
$mediaPlayer.Play()

# Wait for media to load and get duration
Start-Sleep -Milliseconds 500
while ($mediaPlayer.NaturalDuration.HasTimeSpan -eq $false) {
  Start-Sleep -Milliseconds 100
}

# Wait for playback to complete
$duration = $mediaPlayer.NaturalDuration.TimeSpan.TotalMilliseconds
Start-Sleep -Milliseconds $duration

$mediaPlayer.Close()
Write-Output "DONE"
`;

    const command = 'powershell';
    const args = ['-NoProfile', '-Command', psScript];

    console.log('[ElevenLabs] Spawning PowerShell MediaPlayer...');
    this.audioProcess = spawn(command, args, { windowsHide: true });

    let output = '';
    let resolved = false;

    const resolveOnce = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    this.audioProcess.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
      if (output.includes('DONE')) {
        console.log('[ElevenLabs] MediaPlayer playback completed');
        resolveOnce();
      }
    });

    this.audioProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[ElevenLabs] MediaPlayer stderr:', data.toString());
    });

    this.audioProcess.on('close', (code: number) => {
      console.log('[ElevenLabs] MediaPlayer process closed with code:', code);
      this.audioProcess = null;
      resolveOnce();
    });

    this.audioProcess.on('error', (error: Error) => {
      console.error('[ElevenLabs] MediaPlayer error:', error.message);
      this.audioProcess = null;
      this.playWithFallback(audioPath, resolve, reject);
    });
  }

  private playWithFallback(audioPath: string, resolve: Function, reject: Function): void {
    console.log('[ElevenLabs] Trying fallback playback method');

    const escapedPath = audioPath.replace(/'/g, "''");

    const psScript = `
try {
  $player = New-Object -ComObject WMPlayer.OCX
  $player.URL = '${escapedPath}'
  $player.settings.volume = 100
  $player.controls.play()

  # Wait for media to be ready
  while ($player.playState -ne 3) { Start-Sleep -Milliseconds 100 }

  # Wait for playback to finish
  while ($player.playState -eq 3) { Start-Sleep -Milliseconds 200 }

  $player.close()
  Write-Output "DONE"
} catch {
  Write-Error $_.Exception.Message
  Exit 1
}
`;

    const command = 'powershell';
    const args = ['-NoProfile', '-WindowStyle', 'Hidden', '-Command', psScript];

    this.audioProcess = spawn(command, args, { windowsHide: true });

    setTimeout(() => {
      console.log('[ElevenLabs] Fallback playback initiated');
      resolve();
    }, 100);

    this.audioProcess.on('close', () => {
      this.audioProcess = null;
    });

    this.audioProcess.on('error', (error: Error) => {
      console.error('[ElevenLabs] Fallback playback error:', error.message);
      reject(error);
    });
  }

  stop(): void {
    if (this.audioProcess) {
      this.audioProcess.kill();
      this.audioProcess = null;
    }
    this.isActive = false;
    console.log('[ElevenLabs] Stopped');
  }

  async getVoices(): Promise<string[]> {
    // Return default voice IDs (these are real ElevenLabs voice IDs)
    // In production, you should call getVoicesFromApi() to get current list
    return [
      'EXAVITQu4vr4xnSDxMaL', // Sarah
      '21m00Tcm4TlvDq8ikWAM', // Rachel
      'AZnzlk1XvdvUeBnXmlld', // Domi
      'ErXwobaYiN019PkySvjV', // Antoni
      'MF3mGyEYCl7XYWbV9V6O', // Elli
      'TxGEqnHWrfWFTfGW9XjX', // Josh
      'VR6AewLTigWG4xSOukaG', // Arnold
      'pNInz6obpgDQGcFmaJgB', // Adam
      'yoZ06aMxZJJ28mfd3POQ'  // Sam
    ];
  }

  async getVoicesFromApi(): Promise<Array<{ voice_id: string; name: string }>> {
    if (!this.client) {
      console.warn('[ElevenLabs] Client not initialized, cannot fetch voices');
      return [];
    }

    try {
      console.log('[ElevenLabs] Fetching voices from API...');
      const response = await this.client.voices.getAll();

      if (!response.voices) {
        console.warn('[ElevenLabs] No voices returned from API');
        return [];
      }

      const voices = response.voices.map((voice) => ({
        voice_id: voice.voice_id,
        name: voice.name
      }));

      console.log('[ElevenLabs] Fetched', voices.length, 'voices from API');
      return voices;
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('[ElevenLabs] Error fetching voices:', errorMessage);
      return [];
    }
  }

  setRate(rate: number): void {
    // ElevenLabs doesn't support rate adjustment like SAPI/Edge
    // This is kept for interface compatibility but is a no-op
    this.rate = Math.max(50, Math.min(200, rate));
    console.log('[ElevenLabs] setRate called but not supported (rate:', this.rate, ')');
  }

  setVolume(volume: number): void {
    // ElevenLabs doesn't support volume control directly
    // This is kept for interface compatibility but is a no-op
    this.volume = Math.max(0, Math.min(100, volume));
    console.log('[ElevenLabs] setVolume called but not supported (volume:', this.volume, ')');
  }

  setVoice(voice: string): void {
    this.config.voiceId = voice;
    console.log('[ElevenLabs] Voice set to:', voice);
  }

  updateConfig(config: Partial<ElevenLabsConfig>): void {
    const oldApiKey = this.config.apiKey;

    this.config = {
      ...this.config,
      ...config
    };

    // Reinitialize client if API key changed
    if (config.apiKey && config.apiKey !== oldApiKey) {
      console.log('[ElevenLabs] API key changed, reinitializing client');
      this.initializeClient();
    }

    console.log('[ElevenLabs] Config updated:', {
      voiceId: this.config.voiceId,
      modelId: this.config.modelId,
      stability: this.config.stability,
      similarityBoost: this.config.similarityBoost,
      hasApiKey: !!this.config.apiKey
    });
  }

  isAvailable(): boolean {
    return !!this.client && !!this.config.apiKey;
  }

  getStatus(): {
    active: boolean;
    voiceId: string;
    modelId: string;
    hasApiKey: boolean;
    stability: number;
    similarityBoost: number;
  } {
    return {
      active: this.isActive,
      voiceId: this.config.voiceId,
      modelId: this.config.modelId,
      hasApiKey: !!this.config.apiKey,
      stability: this.config.stability,
      similarityBoost: this.config.similarityBoost
    };
  }

  getConfig(): ElevenLabsConfig {
    return { ...this.config };
  }
}
