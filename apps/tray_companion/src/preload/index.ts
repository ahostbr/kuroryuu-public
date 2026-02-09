import { contextBridge, ipcRenderer } from 'electron';
import { electronAPI } from '@electron-toolkit/preload';

// Custom APIs for renderer
const api = {
  // Settings API
  settings: {
    get: () => ipcRenderer.invoke('settings:get'),
    update: (settings: any) => ipcRenderer.invoke('settings:update', settings)
  },

  // TTS API
  tts: {
    speak: (text: string) => ipcRenderer.invoke('tts:speak', text),
    stop: () => ipcRenderer.invoke('tts:stop'),
    getVoices: () => ipcRenderer.invoke('tts:getVoices')
  },

  // Hotkey API
  hotkey: {
    register: (accelerator: string, action: string) => 
      ipcRenderer.invoke('hotkey:register', accelerator, action),
    unregister: (accelerator: string) => 
      ipcRenderer.invoke('hotkey:unregister', accelerator)
  },

  // Clipboard API
  clipboard: {
    startMonitoring: () => ipcRenderer.invoke('clipboard:startMonitoring'),
    stopMonitoring: () => ipcRenderer.invoke('clipboard:stopMonitoring')
  },

  // V0.2 MCP API
  mcp: {
    connect: () => ipcRenderer.invoke('mcp:connect'),
    sendMessage: (recipient: string, message: string, priority: string) => 
      ipcRenderer.invoke('mcp:sendMessage', recipient, message, priority),
    ragQuery: (query: string) => ipcRenderer.invoke('mcp:ragQuery', query),
    saveCheckpoint: (name: string, data: any) => 
      ipcRenderer.invoke('mcp:saveCheckpoint', name, data),
    loadCheckpoint: (name: string) => ipcRenderer.invoke('mcp:loadCheckpoint', name)
  },

  // V0.2 Voice Assistant API (provider-agnostic)
  voice: {
    sendMessage: (message: string, autoSpeak: boolean) =>
      ipcRenderer.invoke('voice:sendMessage', message, autoSpeak),
    testConnection: () => ipcRenderer.invoke('voice:testConnection'),
    clearHistory: () => ipcRenderer.invoke('voice:clearHistory'),
    getHistory: () => ipcRenderer.invoke('voice:getHistory'),
    quickQuery: (query: string) => ipcRenderer.invoke('voice:quickQuery', query),
    getContextInfo: () => ipcRenderer.invoke('voice:getContextInfo'),
    setMaxContextTokens: (maxTokens: number) => ipcRenderer.invoke('voice:setMaxContextTokens', maxTokens),
    getModels: () => ipcRenderer.invoke('voice:getModels'),
    setModel: (model: string) => ipcRenderer.invoke('voice:setModel', model),
    reloadPrompt: () => ipcRenderer.invoke('voice:reloadPrompt'),
    selectPromptFile: () => ipcRenderer.invoke('voice:selectPromptFile'),
    onMessageSent: (callback: (event: any) => void) => {
      const handler = (_: any, data: any) => callback({ detail: data });
      ipcRenderer.on('voice-message-sent', handler);
      return () => { ipcRenderer.removeListener('voice-message-sent', handler); };
    },
    onContextUpdate: (callback: (info: { usedTokens: number; completionTokens: number; totalTokens: number; modelMaxTokens?: number; maxTokens: number; percentage: number }) => void) => {
      const handler = (_: any, info: any) => callback(info);
      ipcRenderer.on('context-update', handler);
      return () => { ipcRenderer.removeListener('context-update', handler); };
    },
    getCLIProxyModels: () => ipcRenderer.invoke('voice:getCLIProxyModels'),
    checkProviderHealth: () => ipcRenderer.invoke('voice:checkProviderHealth')
  },

  // Domain Config API (sync with Desktop app)
  domainConfig: {
    getVoiceConfig: () => ipcRenderer.invoke('domain-config:get-voice'),
    onUpdate: (callback: (config: any) => void) => {
      const handler = (_: any, config: any) => callback(config);
      ipcRenderer.on('domain-config:updated', handler);
      return () => { ipcRenderer.removeListener('domain-config:updated', handler); };
    }
  },

  // ElevenLabs TTS API
  elevenlabs: {
    setApiKey: (apiKey: string) => ipcRenderer.invoke('elevenlabs:setApiKey', apiKey),
    hasApiKey: () => ipcRenderer.invoke('elevenlabs:hasApiKey'),
    removeApiKey: () => ipcRenderer.invoke('elevenlabs:removeApiKey'),
    getVoices: () => ipcRenderer.invoke('elevenlabs:getVoices'),
    testVoice: (voiceId: string, text?: string) => ipcRenderer.invoke('elevenlabs:testVoice', voiceId, text || '')
  },

  // Speech Recognition API
  speech: {
    startListening: () => ipcRenderer.invoke('speech:startListening'),
    stopListening: () => ipcRenderer.invoke('speech:stopListening'),
    isListening: () => ipcRenderer.invoke('speech:isListening'),
    startAlwaysListen: (forceEnable?: boolean) => ipcRenderer.invoke('speech:startAlwaysListen', forceEnable),
    stopAlwaysListen: () => ipcRenderer.invoke('speech:stopAlwaysListen'),
    onTranscript: (callback: (transcript: string) => void) => {
      const handler = (_: any, transcript: string) => callback(transcript);
      ipcRenderer.on('speech:transcript', handler);
      return () => { ipcRenderer.removeListener('speech:transcript', handler); };
    }
  },

  // Voice detection events
  onVoiceDetected: (callback: () => void) => {
    const handler = () => callback();
    ipcRenderer.on('voice-detected', handler);
    return () => { ipcRenderer.removeListener('voice-detected', handler); };
  },

  onSpeechTranscript: (callback: (transcript: string) => void) => {
    const handler = (_: any, transcript: string) => callback(transcript);
    ipcRenderer.on('speech:transcript', handler);
    return () => { ipcRenderer.removeListener('speech:transcript', handler); };
  },

  onSpeechInterim: (callback: (interim: string) => void) => {
    const handler = (_: any, interim: string) => callback(interim);
    ipcRenderer.on('speech-interim', handler);
    return () => { ipcRenderer.removeListener('speech-interim', handler); };
  },

  onAudioLevel: (callback: (level: number) => void) => {
    const handler = (_: any, level: number) => callback(level);
    ipcRenderer.on('audio-level', handler);
    return () => { ipcRenderer.removeListener('audio-level', handler); };
  },

  onSpeechState: (callback: (state: string) => void) => {
    const handler = (_: any, state: string) => callback(state);
    ipcRenderer.on('speech-state', handler);
    return () => { ipcRenderer.removeListener('speech-state', handler); };
  }
};

// Window controls API
const windowControls = {
  toggleFullscreen: () => ipcRenderer.invoke('window:toggleFullscreen'),
  minimize: () => ipcRenderer.invoke('window:minimize'),
  maximize: () => ipcRenderer.invoke('window:maximize'),
  close: () => ipcRenderer.invoke('window:close')
};

// Use `contextBridge` APIs to expose Electron APIs to
// renderer only if context isolation is enabled, otherwise
// just add to the DOM global.
if (process.contextIsolated) {
  try {
    contextBridge.exposeInMainWorld('electron', electronAPI);
    contextBridge.exposeInMainWorld('api', api);
    contextBridge.exposeInMainWorld('windowControls', windowControls);
  } catch (error) {
    console.error(error);
  }
} else {
  // @ts-ignore (define in dts)
  window.electron = electronAPI;
  // @ts-ignore (define in dts)
  window.api = api;
  // @ts-ignore (define in dts)
  window.windowControls = windowControls;
}
