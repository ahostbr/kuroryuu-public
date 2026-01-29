/**
 * Audio Transcription Service (T073 + Whisper + LMStudio Fix)
 *
 * Handles communication between Electron and transcribe_audio.py for speech-to-text.
 * Supports local Whisper (default) and Google Speech fallback.
 * Integrates with LMStudio for chat responses and TTS.
 */

import { spawn } from 'child_process';
import { writeFile, unlink, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import * as path from 'path';
import * as os from 'os';
import { getPythonExe, getTranscribeScriptPath } from './utils/paths';

// ============================================================================
// TYPES
// ============================================================================

export type STTEngine = 'whisper' | 'google';

export interface TranscriptionResult {
  success: boolean;
  transcription?: string;
  confidence?: number;
  error?: string;
}

export interface VoiceChatResult {
  success: boolean;
  transcription?: string;
  response?: string;
  error?: string;
}

// ============================================================================
// CONFIGURATION
// ============================================================================

const GATEWAY_URL = 'http://127.0.0.1:8200';
const DEFAULT_ENGINE: STTEngine = 'whisper';

// ============================================================================
// PYTHON SCRIPT PATHS (using centralized path utilities)
// ============================================================================

function getTranscribeScript(): string {
  const scriptPath = getTranscribeScriptPath();
  console.log('[AudioService] Using transcribe script:', scriptPath);
  return scriptPath;
}

function getPythonPath(): string {
  const pythonPath = getPythonExe();
  console.log('[AudioService] Using Python:', pythonPath);
  return pythonPath;
}

// ============================================================================
// TEMP FILE MANAGEMENT
// ============================================================================

async function ensureTempDir(): Promise<string> {
  const tempDir = path.join(os.tmpdir(), 'kuroryuu-audio');
  if (!existsSync(tempDir)) {
    await mkdir(tempDir, { recursive: true });
  }
  return tempDir;
}

async function saveTempAudio(audioData: number[], mimeType: string): Promise<string> {
  const tempDir = await ensureTempDir();
  const extension = mimeType.includes('webm') ? 'webm' : 'wav';
  const tempFile = path.join(tempDir, `audio_${Date.now()}.${extension}`);

  const buffer = Buffer.from(audioData);
  await writeFile(tempFile, buffer);

  console.log(`[AudioService] Saved temp audio: ${tempFile} (${buffer.length} bytes)`);
  return tempFile;
}

async function cleanupTempFile(filePath: string): Promise<void> {
  try {
    await unlink(filePath);
    console.log(`[AudioService] Cleaned up temp file: ${filePath}`);
  } catch (e) {
    console.warn(`[AudioService] Failed to cleanup temp file: ${filePath}`, e);
  }
}

// ============================================================================
// TRANSCRIPTION (Whisper or Google)
// ============================================================================

/**
 * Transcribe audio data to text using Whisper (default) or Google
 *
 * @param audioData - Audio data as array of bytes
 * @param mimeType - MIME type of the audio (e.g., 'audio/webm')
 * @param engine - STT engine: 'whisper' (local, default) or 'google' (online)
 * @returns TranscriptionResult with success, transcription, and confidence
 */
export async function transcribeAudio(
  audioData: number[],
  mimeType: string,
  engine: STTEngine = DEFAULT_ENGINE
): Promise<TranscriptionResult> {
  console.log(`[AudioService] transcribeAudio called with ${audioData.length} bytes, mimeType: ${mimeType}, engine: ${engine}`);

  let tempFile: string | null = null;

  try {
    // Save audio to temp file
    tempFile = await saveTempAudio(audioData, mimeType);

    // Get paths
    const pythonExe = getPythonPath();
    const scriptPath = getTranscribeScript();

    console.log(`[AudioService] Calling Python transcribe script`);
    console.log(`[AudioService] Python: ${pythonExe}`);
    console.log(`[AudioService] Script: ${scriptPath}`);
    console.log(`[AudioService] Audio file: ${tempFile}`);
    console.log(`[AudioService] Engine: ${engine}`);

    // Spawn Python process with engine argument
    return new Promise((resolve) => {
      const args = [scriptPath, tempFile!, '--engine', engine];
      const process = spawn(pythonExe, args, {
        windowsHide: true,
        stdio: ['ignore', 'pipe', 'pipe'],
        timeout: 60000, // 60 second timeout (Whisper can be slower)
      });

      let stdout = '';
      let stderr = '';

      process.stdout?.on('data', (data: Buffer) => {
        stdout += data.toString();
      });

      process.stderr?.on('data', (data: Buffer) => {
        stderr += data.toString();
      });

      process.on('close', async (code) => {
        console.log(`[AudioService] Python process exited with code: ${code}`);
        console.log(`[AudioService] stdout: ${stdout}`);
        if (stderr) {
          console.log(`[AudioService] stderr: ${stderr}`);
        }

        // Cleanup temp file
        if (tempFile) {
          await cleanupTempFile(tempFile);
        }

        // Parse output
        const lines = stdout.trim().split('\n');
        let transcription: string | undefined;
        let confidence: number | undefined;
        let error: string | undefined;

        for (const line of lines) {
          if (line.startsWith('TRANSCRIPT:')) {
            transcription = line.substring('TRANSCRIPT:'.length).trim();
          } else if (line.startsWith('CONFIDENCE:')) {
            confidence = parseFloat(line.substring('CONFIDENCE:'.length).trim());
          } else if (line.startsWith('ERROR:')) {
            error = line.substring('ERROR:'.length).trim();
          }
        }

        if (transcription) {
          resolve({
            success: true,
            transcription,
            confidence,
          });
        } else if (error) {
          resolve({
            success: false,
            error,
          });
        } else if (code !== 0) {
          resolve({
            success: false,
            error: `Process exited with code ${code}: ${stderr || 'Unknown error'}`,
          });
        } else {
          resolve({
            success: false,
            error: 'No transcription returned',
          });
        }
      });

      process.on('error', async (err) => {
        console.error(`[AudioService] Process error:`, err);

        // Cleanup temp file
        if (tempFile) {
          await cleanupTempFile(tempFile);
        }

        resolve({
          success: false,
          error: `Failed to start transcription process: ${err.message}`,
        });
      });
    });
  } catch (err) {
    console.error(`[AudioService] Error:`, err);

    // Cleanup temp file if it was created
    if (tempFile) {
      await cleanupTempFile(tempFile);
    }

    return {
      success: false,
      error: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

// ============================================================================
// LMSTUDIO CHAT INTEGRATION
// ============================================================================

/**
 * Send transcript to LMStudio for AI response via Gateway
 *
 * @param transcript - The transcribed text from voice input
 * @param terminalId - Terminal ID for context (optional)
 * @returns Response from LMStudio
 */
export async function sendToLMStudio(
  transcript: string,
  terminalId?: string
): Promise<{ success: boolean; response?: string; error?: string }> {
  console.log(`[AudioService] Sending to LMStudio: "${transcript.substring(0, 50)}..."`);

  try {
    const response = await fetch(`${GATEWAY_URL}/v1/chat/proxy`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          {
            role: 'system',
            content: 'You are a helpful AI assistant. Keep responses brief and conversational - they may be spoken aloud via TTS.',
          },
          {
            role: 'user',
            content: transcript,
          },
        ],
        agent_id: terminalId ? `terminal-voice-${terminalId}` : 'terminal-voice',
        stream: false,
        temperature: 0.7,
        max_tokens: 500,
        backend: 'lmstudio',
      }),
    });

    if (!response.ok) {
      throw new Error(`Gateway HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    const aiResponse = data.content || data.choices?.[0]?.message?.content || '';

    console.log(`[AudioService] LMStudio response: "${aiResponse.substring(0, 100)}..."`);

    return {
      success: true,
      response: aiResponse,
    };
  } catch (error) {
    console.error(`[AudioService] LMStudio error:`, error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Failed to get LMStudio response',
    };
  }
}

// ============================================================================
// VOICE CHAT (Transcription + LMStudio + TTS)
// ============================================================================

/**
 * Full voice chat flow: Transcribe -> LMStudio -> TTS
 *
 * @param audioData - Audio data as array of bytes
 * @param mimeType - MIME type of the audio
 * @param engine - STT engine
 * @param terminalId - Terminal ID for context
 * @param speakResponse - Whether to speak the response via TTS
 * @returns VoiceChatResult with transcription and AI response
 */
export async function voiceChat(
  audioData: number[],
  mimeType: string,
  engine: STTEngine = DEFAULT_ENGINE,
  terminalId?: string,
  speakResponse: boolean = true
): Promise<VoiceChatResult> {
  console.log(`[AudioService] voiceChat called - engine: ${engine}, speak: ${speakResponse}`);

  // Step 1: Transcribe audio
  const transcriptionResult = await transcribeAudio(audioData, mimeType, engine);

  if (!transcriptionResult.success || !transcriptionResult.transcription) {
    return {
      success: false,
      error: transcriptionResult.error || 'Transcription failed',
    };
  }

  const transcript = transcriptionResult.transcription;
  console.log(`[AudioService] Transcript: "${transcript}"`);

  // Step 2: Send to LMStudio
  const chatResult = await sendToLMStudio(transcript, terminalId);

  if (!chatResult.success || !chatResult.response) {
    return {
      success: false,
      transcription: transcript,
      error: chatResult.error || 'LMStudio chat failed',
    };
  }

  const response = chatResult.response;

  // Step 3: TTS (if enabled) - handled by renderer via IPC
  // The renderer will call the TTS service separately

  return {
    success: true,
    transcription: transcript,
    response: response,
  };
}
