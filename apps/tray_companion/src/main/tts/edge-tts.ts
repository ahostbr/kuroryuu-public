import { TTSBackend, TTSResult } from './tts-manager';
import { spawn } from 'child_process';
import * as os from 'os';
import * as path from 'path';
import * as fs from 'fs';
import { getPythonExe } from '../utils/paths';

// Edge TTS implementation using Python edge-tts package
// Falls back to Windows SAPI if Python or edge-tts is not available
export class EdgeTTS implements TTSBackend {
  private rate: number = 100; // Percentage (50-200)
  private voice: string = 'en-US-AriaNeural';
  private isActive: boolean = false;
  private audioProcess: any = null;

  constructor() {
    console.log('Edge TTS backend initialized');
  }

  async speak(text: string): Promise<TTSResult> {
    console.log('[Edge TTS] speak() called');
    console.log('[Edge TTS] Text length:', text.length);
    console.log('[Edge TTS] Voice:', this.voice);
    console.log('[Edge TTS] Rate:', this.rate);
    
    try {
      this.isActive = true;
      
      // First try Python edge-tts, fall back to SAPI
      console.log('[Edge TTS] Attempting Python edge-tts...');
      const result = await this.speakWithPython(text).catch(async (err) => {
        console.log('[Edge TTS] Python edge-tts failed, falling back to SAPI:', err.message);
        return this.speakWithSAPI(text);
      });
      
      console.log('[Edge TTS] speak() completed with result:', result);
      this.isActive = false;
      return result;
    } catch (error) {
      this.isActive = false;
      const errorMessage = error instanceof Error ? error.message : 'Edge TTS error';
      console.error('[Edge TTS] speak() error:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  private speakWithPython(text: string): Promise<TTSResult> {
    console.log('[Edge TTS] speakWithPython() called');
    return new Promise((resolve, reject) => {
      // Convert rate percentage (50-200) to Edge format
      const delta = this.rate - 100;
      const rateStr = delta >= 0 ? `+${delta}%` : `${delta}%`;
      console.log('[Edge TTS] Rate string:', rateStr);
      
      // Create unique temp file for this synthesis
      const tmpDir = os.tmpdir();
      const tempAudioPath = path.join(tmpDir, `edge_tts_${Date.now()}_${Math.random().toString(36).substr(2, 9)}.mp3`);
      
      // Python script to synthesize using edge_tts and save to file
      const pythonCode = `
import sys
import asyncio
try:
    import edge_tts
    
    async def synthesize():
        text = """${text.replace(/"/g, '\\"').replace(/\n/g, '\\n')}"""
        voice = "${this.voice}"
        rate = "${rateStr}"
        output_path = """${tempAudioPath.replace(/\\/g, '\\\\')}"""
        
        communicate = edge_tts.Communicate(text, voice, rate=rate)
        await communicate.save(output_path)
        print("SUCCESS")
    
    asyncio.run(synthesize())
except Exception as e:
    print(f"ERROR: {str(e)}")
    sys.exit(1)
`;

      // Write Python code to temp file to avoid escaping issues
      const pyScriptPath = path.join(tmpDir, `edge_tts_script_${Date.now()}.py`);
      
      fs.writeFileSync(pyScriptPath, pythonCode);
      
      // Use centralized path utility for Python (path-agnostic)
      const pythonExe = getPythonExe();
      console.log('[Edge TTS] Using Python:', pythonExe);
      
      const proc = spawn(pythonExe, [pyScriptPath], {
        windowsHide: true,
        stdio: ['pipe', 'pipe', 'pipe']
      });
      
      let output = '';
      let stderr = '';
      
      proc.stdout?.on('data', (data: Buffer) => {
        output += data.toString();
      });
      
      proc.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });
      
      const cleanup = () => {
        try {
          fs.unlinkSync(pyScriptPath);
        } catch (e) {
          // Ignore cleanup errors
        }
      };
      
      proc.on('close', (code: number) => {
        console.log('[Edge TTS] Python process closed with code:', code);
        console.log('[Edge TTS] Output includes SUCCESS:', output.includes('SUCCESS'));
        console.log('[Edge TTS] Audio file exists:', fs.existsSync(tempAudioPath));
        if (code === 0 && output.includes('SUCCESS') && fs.existsSync(tempAudioPath)) {
          console.log('[Edge TTS] Audio file generated successfully, starting playback...');
          // Play the audio using PowerShell

          this.playAudioWithPowerShell(tempAudioPath)
            .then(() => {
              resolve({ success: true });
              cleanup();
            })
            .catch((err) => {
              cleanup();
              reject(err);
            });
        } else {
          cleanup();
          reject(new Error(`Python edge-tts failed: ${stderr || output}`));
        }
      });
      
      proc.on('error', (error: Error) => {
        cleanup();
        reject(new Error(`Failed to spawn Python: ${error.message}`));
      });
      
      // Timeout after 30 seconds
      const timeout = setTimeout(() => {
        proc.kill();
        cleanup();
        reject(new Error('Python edge-tts timeout'));
      }, 30000);
      
      proc.on('close', () => {
        clearTimeout(timeout);
      });
    });
  }

  private playAudioWithPowerShell(audioPath: string): Promise<void> {
    return new Promise((resolve, reject) => {
      // Use PowerShell MediaPlayer to play audio invisibly in background
      this.playWithMediaPlayer(audioPath, resolve, reject);
    });
  }

  private playWithMediaPlayer(audioPath: string, resolve: Function, reject: Function): void {
    console.log('[Edge TTS] Playing audio invisibly with MediaPlayer');
    console.log('[Edge TTS] Audio file:', audioPath);
    console.log('[Edge TTS] File exists:', fs.existsSync(audioPath));

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

    console.log('[Edge TTS] Spawning PowerShell MediaPlayer...');
    this.audioProcess = spawn(command, args, { windowsHide: true });

    let output = '';
    let resolved = false;
    
    const resolveOnce = () => {
      if (!resolved) {
        resolved = true;
        resolve();
      }
    };

    // Wait for actual playback completion to prevent speech recognition feedback loop
    // The PowerShell script outputs "DONE" when playback finishes
    this.audioProcess.stdout?.on('data', (data: Buffer) => {
      output += data.toString();
      if (output.includes('DONE')) {
        console.log('[Edge TTS] MediaPlayer playback completed');
        resolveOnce();
      }
    });

    this.audioProcess.stderr?.on('data', (data: Buffer) => {
      console.error('[Edge TTS] MediaPlayer stderr:', data.toString());
    });

    this.audioProcess.on('close', (code: number) => {
      console.log('[Edge TTS] MediaPlayer process closed with code:', code);
      this.audioProcess = null;
      resolveOnce();
    });

    this.audioProcess.on('error', (error: Error) => {
      console.error('[Edge TTS] MediaPlayer error:', error.message);
      this.audioProcess = null;
      // Fallback to SoundPlayer for .wav or mplayer for .mp3
      this.playWithFallback(audioPath, resolve, reject);
    });
  }

  private playWithFallback(audioPath: string, resolve: Function, reject: Function): void {
    console.log('[Edge TTS] Trying fallback playback method');
    
    // Use mplayer/ffplay if available, otherwise use COM
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

    // Resolve quickly
    setTimeout(() => {
      console.log('[Edge TTS] Fallback playback initiated');
      resolve();
    }, 100);

    this.audioProcess.on('close', () => {
      this.audioProcess = null;
    });

    this.audioProcess.on('error', (error: Error) => {
      console.error('[Edge TTS] Fallback playback error:', error.message);
      reject(error);
    });
  }

  // tryPlayWithMethod removed - use playWithMediaPlayer directly

  private async speakWithSAPI(text: string): Promise<TTSResult> {
    return new Promise((resolve) => {
      // Sanitize text for PowerShell
      const sanitizedText = text
        .replace(/\\/g, '\\\\')  // Backslash
        .replace(/\$/g, '`$')    // Dollar sign
        .replace(/"/g, '`"')     // Double quote
        .replace(/'/g, "''");    // Single quote

      const rateAdjustment = Math.round((this.rate - 100) / 10);
      
      const command = 'powershell';
      const args = [
        '-Command',
        `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.Rate = ${rateAdjustment}; $synth.Speak("${sanitizedText}"); $synth.Dispose()`
      ];

      this.audioProcess = spawn(command, args, { windowsHide: true });

      this.audioProcess.on('close', (code: number) => {
        this.audioProcess = null;
        if (code === 0) {
          resolve({ success: true });
        } else {
          resolve({ success: false, error: `PowerShell TTS failed with code ${code}` });
        }
      });

      this.audioProcess.on('error', (error: Error) => {
        this.audioProcess = null;
        resolve({ success: false, error: error.message });
      });
    });
  }

  stop(): void {
    if (this.audioProcess) {
      this.audioProcess.kill();
      this.audioProcess = null;
    }
    this.isActive = false;
    console.log('Edge TTS stopped');
  }

  async getVoices(): Promise<string[]> {
    // Return common Edge TTS voices
    return [
      'en-US-AriaNeural',
      'en-US-JennyNeural',
      'en-US-GuyNeural',
      'en-US-ChristopherNeural',
      'en-US-EricNeural',
      'en-GB-SoniaNeural',
      'en-GB-RyanNeural',
      'en-AU-NatashaNeural',
      'en-AU-WilliamNeural'
    ];
  }

  setRate(rate: number): void {
    // Rate should be between 50-200 for Edge TTS
    this.rate = Math.max(50, Math.min(200, rate));
  }

  setVolume(_volume: number): void {
    // Edge TTS doesn't support volume control directly
    // This is a no-op for compatibility
  }

  setVoice(voice: string): void {
    this.voice = voice;
  }

  isAvailable(): boolean {
    return process.platform === 'win32'; // Only available on Windows
  }

  getStatus(): { active: boolean; rate: number; voice: string } {
    return {
      active: this.isActive,
      rate: this.rate,
      voice: this.voice
    };
  }
}
