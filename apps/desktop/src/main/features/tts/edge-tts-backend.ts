/**
 * Edge TTS Backend for Desktop
 * 
 * Uses Python edge-tts package for high-quality neural voices.
 * Ported from tray_companion implementation.
 */

import { spawn, ChildProcess } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { getPythonExe } from '../../utils/paths';

export interface EdgeTTSResult {
  success: boolean;
  error?: string;
}

export class EdgeTTSBackend {
  private rate: number = 0; // Percentage delta from 100 (-50 to +100)
  private voice: string = 'en-US-AriaNeural';
  private volume: number = 100;
  private isActive: boolean = false;
  private audioProcess: ChildProcess | null = null;

  constructor() {
    console.log('[EdgeTTS] Backend initialized');
    console.log('[EdgeTTS] __dirname:', __dirname);
  }

  /**
   * Speak text using edge-tts
   */
  async speak(text: string): Promise<EdgeTTSResult> {
    console.log('[EdgeTTS] ========== speak() START ==========');
    console.log('[EdgeTTS] Text length:', text.length);
    console.log('[EdgeTTS] Text preview:', text.substring(0, 100));
    console.log('[EdgeTTS] Voice:', this.voice);
    console.log('[EdgeTTS] Rate:', this.rate);
    
    if (this.isActive) {
      console.log('[EdgeTTS] Already active, stopping first');
      this.stop();
    }
    
    try {
      this.isActive = true;
      const result = await this.speakWithPython(text);
      console.log('[EdgeTTS] speakWithPython result:', result);
      this.isActive = false;
      return result;
    } catch (error) {
      this.isActive = false;
      const errorMessage = error instanceof Error ? error.message : 'Edge TTS error';
      console.error('[EdgeTTS] speak() EXCEPTION:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  /**
   * Stop current speech
   */
  stop(): void {
    console.log('[EdgeTTS] stop() called');
    if (this.audioProcess) {
      this.audioProcess.kill();
      this.audioProcess = null;
    }
    this.isActive = false;
  }

  /**
   * Set speech rate
   * @param rate - Delta from 100 (e.g., -20 for slower, +20 for faster)
   */
  setRate(rate: number): void {
    this.rate = Math.max(-50, Math.min(100, rate));
    console.log('[EdgeTTS] Rate set to:', this.rate);
  }

  /**
   * Set voice
   * @param voice - Voice name like 'en-US-AriaNeural'
   */
  setVoice(voice: string): void {
    this.voice = voice;
    console.log('[EdgeTTS] Voice set to:', this.voice);
  }

  /**
   * Set volume
   * @param volume - Volume 0-100
   */
  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(100, volume));
    console.log('[EdgeTTS] Volume set to:', this.volume);
  }

  /**
   * Get available voices
   */
  async getVoices(): Promise<string[]> {
    // Return commonly used Edge voices
    return [
      'en-US-AriaNeural',
      'en-US-GuyNeural',
      'en-US-JennyNeural',
      'en-US-ChristopherNeural',
      'en-GB-SoniaNeural',
      'en-GB-RyanNeural',
      'en-AU-NatashaNeural',
      'en-AU-WilliamNeural',
    ];
  }

  /**
   * Check if backend is available
   */
  isAvailable(): boolean {
    return true; // Will fail gracefully if Python not available
  }

  /**
   * Find Python executable (using centralized path utilities)
   */
  private findPython(): string {
    const pythonPath = getPythonExe();
    console.log('[EdgeTTS] Using Python:', pythonPath);
    return pythonPath;
  }

  /**
   * Speak using Python edge-tts
   */
  private speakWithPython(text: string): Promise<EdgeTTSResult> {
    return new Promise((resolve, reject) => {
      console.log('[EdgeTTS] speakWithPython() START');
      
      const rateStr = this.rate >= 0 ? `+${this.rate}%` : `${this.rate}%`;
      const volumeStr = this.volume >= 100 ? `+0%` : `${this.volume - 100}%`;
      
      const tmpDir = os.tmpdir();
      const tempAudioPath = path.join(tmpDir, `edge_tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`);
      
      console.log('[EdgeTTS] Temp audio path:', tempAudioPath);
      console.log('[EdgeTTS] Rate string:', rateStr);
      console.log('[EdgeTTS] Volume string:', volumeStr);

      // Escape text for Python - use single quotes to avoid triple-quote issues
      const escapedText = text
        .replace(/\\/g, '\\\\')
        .replace(/'/g, "\\'")
        .replace(/\n/g, '\\n')
        .replace(/\r/g, '\\r');

      const pythonCode = `
import sys
import asyncio
print("Python script starting...")
try:
    import edge_tts
    print("edge_tts imported successfully")
    
    async def synthesize():
        text = '${escapedText}'
        voice = "${this.voice}"
        rate = "${rateStr}"
        volume = "${volumeStr}"
        output_path = r"${tempAudioPath.replace(/\\/g, '\\\\')}"
        
        print(f"Synthesizing: voice={voice}, rate={rate}, text_len={len(text)}")
        print(f"Output path: {output_path}")
        
        communicate = edge_tts.Communicate(text, voice, rate=rate, volume=volume)
        await communicate.save(output_path)
        print("SUCCESS")
    
    asyncio.run(synthesize())
except ImportError as e:
    print(f"ERROR: edge_tts not installed - {str(e)}")
    sys.exit(1)
except Exception as e:
    print(f"ERROR: {str(e)}")
    import traceback
    traceback.print_exc()
    sys.exit(1)
`;

      const pyScriptPath = path.join(tmpDir, `edge_tts_script_${Date.now()}.py`);
      console.log('[EdgeTTS] Writing Python script to:', pyScriptPath);
      fs.writeFileSync(pyScriptPath, pythonCode);

      const pythonExe = this.findPython();
      console.log('[EdgeTTS] Spawning Python:', pythonExe, pyScriptPath);
      
      const proc = spawn(pythonExe, [pyScriptPath], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });

      let output = '';
      let stderr = '';

      proc.stdout?.on('data', (data: Buffer) => {
        const str = data.toString();
        console.log('[EdgeTTS] Python stdout:', str.trim());
        output += str;
      });

      proc.stderr?.on('data', (data: Buffer) => {
        const str = data.toString();
        console.log('[EdgeTTS] Python stderr:', str.trim());
        stderr += str;
      });

      const cleanup = () => {
        try { fs.unlinkSync(pyScriptPath); } catch {}
      };

      const timeout = setTimeout(() => {
        console.log('[EdgeTTS] TIMEOUT - killing process');
        proc.kill();
        cleanup();
        reject(new Error('Python edge-tts timeout'));
      }, 30000);

      proc.on('error', (error: Error) => {
        console.error('[EdgeTTS] Process spawn error:', error.message);
        clearTimeout(timeout);
        cleanup();
        reject(new Error(`Failed to spawn Python: ${error.message}`));
      });

      proc.on('close', (code: number) => {
        clearTimeout(timeout);
        console.log('[EdgeTTS] Python process closed with code:', code);
        console.log('[EdgeTTS] Output:', output);
        console.log('[EdgeTTS] Stderr:', stderr);
        console.log('[EdgeTTS] Output includes SUCCESS:', output.includes('SUCCESS'));
        
        const audioExists = fs.existsSync(tempAudioPath);
        console.log('[EdgeTTS] Audio file exists:', audioExists);
        
        if (code === 0 && output.includes('SUCCESS') && fs.existsSync(tempAudioPath)) {
          console.log('[EdgeTTS] Audio file generated, playing...');
          this.playAudio(tempAudioPath)
            .then(() => {
              cleanup();
              try { fs.unlinkSync(tempAudioPath); } catch {}
              resolve({ success: true });
            })
            .catch((err) => {
              cleanup();
              try { fs.unlinkSync(tempAudioPath); } catch {}
              reject(err);
            });
        } else {
          cleanup();
          reject(new Error(`Python edge-tts failed: ${stderr || output}`));
        }
      });
    });
  }

  /**
   * Play audio file using PowerShell MediaPlayer
   */
  private playAudio(audioPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      console.log('[EdgeTTS] playAudio() START');
      console.log('[EdgeTTS] Audio file:', audioPath);
      console.log('[EdgeTTS] File exists:', fs.existsSync(audioPath));
      
      const escapedPath = audioPath.replace(/\\/g, '\\\\').replace(/'/g, "''");

      const psScript = `
Add-Type -AssemblyName PresentationCore
Write-Output "Loading MediaPlayer..."
$mediaPlayer = New-Object System.Windows.Media.MediaPlayer
$mediaPlayer.Open([System.Uri]::new('${escapedPath}'))
Write-Output "Starting playback..."
$mediaPlayer.Play()

# Wait for media to load
Start-Sleep -Milliseconds 500
$timeout = 0
while ($mediaPlayer.NaturalDuration.HasTimeSpan -eq $false -and $timeout -lt 50) {
  Start-Sleep -Milliseconds 100
  $timeout++
}

if ($mediaPlayer.NaturalDuration.HasTimeSpan) {
  # Wait for playback to complete
  $duration = $mediaPlayer.NaturalDuration.TimeSpan.TotalMilliseconds
  Write-Output "Playing for $duration ms..."
  Start-Sleep -Milliseconds $duration
} else {
  Write-Output "Could not determine duration, waiting 3 seconds..."
  Start-Sleep -Seconds 3
}

$mediaPlayer.Close()
Write-Output "DONE"
`;
      
      console.log('[EdgeTTS] Spawning PowerShell for audio playback...');

      this.audioProcess = spawn('powershell', ['-NoProfile', '-Command', psScript], {
        windowsHide: true
      });

      let resolved = false;
      const resolveOnce = () => {
        if (!resolved) {
          resolved = true;
          console.log('[EdgeTTS] playAudio() resolving');
          resolve();
        }
      };

      this.audioProcess.stdout?.on('data', (data: Buffer) => {
        const str = data.toString().trim();
        console.log('[EdgeTTS] PowerShell stdout:', str);
        if (str.includes('DONE')) {
          console.log('[EdgeTTS] Playback completed');
        }
      });

      this.audioProcess.stderr?.on('data', (data: Buffer) => {
        console.error('[EdgeTTS] PowerShell stderr:', data.toString().trim());
      });

      // Resolve quickly so we don't block - audio plays in background
      setTimeout(resolveOnce, 500);

      this.audioProcess.on('close', (code) => {
        console.log('[EdgeTTS] PowerShell closed with code:', code);
        this.audioProcess = null;
        resolveOnce();
      });

      this.audioProcess.on('error', (error: Error) => {
        console.error('[EdgeTTS] PowerShell spawn error:', error.message);
        this.audioProcess = null;
        resolveOnce(); // Don't reject, just log
      });
    });
  }
}
