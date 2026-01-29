import { spawn } from 'child_process';
import { TTSBackend, TTSResult } from './tts-manager';

export class WindowsTTS implements TTSBackend {
  private rate: number = 200;
  private volume: number = 1.0;
  private voice: string = '';
  private isActive: boolean = false;
  private currentProcess: any = null;

  constructor() {
    console.log('Windows TTS backend initialized');
  }

  async speak(text: string): Promise<TTSResult> {
    try {
      this.isActive = true;
      
      // Use PowerShell with SAPI for reliable TTS
      const result = await this.speakWithPowerShell(text);
      
      this.isActive = false;
      return result;
    } catch (error) {
      this.isActive = false;
      const errorMessage = error instanceof Error ? error.message : 'Windows TTS error';
      console.error('Windows TTS error:', errorMessage);
      return { success: false, error: errorMessage };
    }
  }

  private async speakWithPowerShell(text: string): Promise<TTSResult> {
    return new Promise((resolve) => {
      // Escape single quotes in text
      const escapedText = text.replace(/'/g, "''");
      
      // Convert rate from SAPI range (80-300) to SAPI rate (-10 to 10)
      const sapiRate = Math.round(((this.rate - 190) / 110) * 10);
      
      // Build voice selection command if voice is specified
      const voiceSelection = this.voice 
        ? `$voice = $synth.GetInstalledVoices() | Where-Object { $_.VoiceInfo.Name -eq '${this.voice}' } | Select-Object -First 1; if ($voice) { $synth.SelectVoice($voice.VoiceInfo.Name) };`
        : '';
      
      const command = 'powershell';
      const args = [
        '-Command',
        `Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; ${voiceSelection} $synth.Rate = ${sapiRate}; $synth.Volume = ${Math.round(this.volume * 100)}; $synth.Speak('${escapedText}'); $synth.Dispose()`
      ];

      console.log('Speaking with PowerShell TTS:', text.substring(0, 50) + '...', 'Voice:', this.voice || 'default');

      this.currentProcess = spawn(command, args, { 
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe']
      });

      this.currentProcess.on('close', (code: number) => {
        this.currentProcess = null;
        if (code === 0) {
          console.log('TTS completed successfully');
          resolve({ success: true });
        } else {
          console.error('TTS failed with code:', code);
          resolve({ success: false, error: `TTS failed with code ${code}` });
        }
      });

      this.currentProcess.on('error', (error: Error) => {
        this.currentProcess = null;
        console.error('TTS process error:', error);
        resolve({ success: false, error: error.message });
      });

      // Timeout after 30 seconds
      setTimeout(() => {
        if (this.currentProcess) {
          this.currentProcess.kill();
          this.currentProcess = null;
          resolve({ success: false, error: 'TTS timeout' });
        }
      }, 30000);
    });
  }

  stop(): void {
    if (this.currentProcess) {
      this.currentProcess.kill();
      this.currentProcess = null;
    }
    this.isActive = false;
    console.log('Windows TTS stopped');
  }

  async getVoices(): Promise<string[]> {
    console.log('[Windows TTS] getVoices() called');
    try {
      // Get installed voices using PowerShell
      const result = await this.getVoicesWithPowerShell();
      console.log('[Windows TTS] Got voices:', result);
      return result;
    } catch (error) {
      console.error('[Windows TTS] Error getting voices:', error);
      return ['Default Voice'];
    }
  }

  private async getVoicesWithPowerShell(): Promise<string[]> {
    console.log('[Windows TTS] getVoicesWithPowerShell() called');
    return new Promise((resolve) => {
      const command = 'powershell';
      const args = [
        '-Command',
        'Add-Type -AssemblyName System.Speech; $synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }; $synth.Dispose()'
      ];

      const process = spawn(command, args, { windowsHide: true });
      let output = '';

      process.stdout.on('data', (data) => {
        output += data.toString();
      });

      process.on('close', (code) => {
        console.log('[Windows TTS] PowerShell closed with code:', code, 'output:', output);
        if (code === 0 && output.trim()) {
          // Remove ANSI/OSC escape codes from output
          // Matches: ESC ] ... BEL and ESC [ ... m patterns
          const cleanOutput = output
            .replace(/\x1b\][^\x07]*\x07/g, '')  // OSC sequences (ESC ] ... BEL)
            .replace(/\x1b\[[0-9;]*m/g, '');     // CSI sequences (ESC [ ... m)
          const voices = cleanOutput.trim().split('\n').map(v => v.trim()).filter(v => v && v.length > 0);
          console.log('[Windows TTS] Cleaned output:', cleanOutput);
          console.log('[Windows TTS] Parsed voices:', voices);
          resolve(voices.length > 0 ? voices : ['Default Voice']);
        } else {
          console.log('[Windows TTS] No output or error, using default');
          resolve(['Default Voice']);
        }
      });

      process.on('error', () => {
        resolve(['Default Voice']);
      });
    });
  }

  setRate(rate: number): void {
    this.rate = Math.max(80, Math.min(300, rate));
  }

  setVolume(volume: number): void {
    this.volume = Math.max(0, Math.min(1, volume));
  }

  setVoice(voice: string): void {
    this.voice = voice;
  }

  isAvailable(): boolean {
    return process.platform === 'win32';
  }

  getStatus(): { active: boolean; rate: number; volume: number; voice: string } {
    return {
      active: this.isActive,
      rate: this.rate,
      volume: this.volume,
      voice: this.voice
    };
  }
}
