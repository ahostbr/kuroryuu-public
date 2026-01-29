export interface IElectronAPI {
  loadPreferences: () => Promise<void>
}

export interface IAPI {
  settings: {
    get: () => Promise<any>
    update: (settings: any) => Promise<any>
  }
  tts: {
    speak: (text: string) => Promise<any>
    stop: () => Promise<any>
    getVoices: () => Promise<string[]>
  }
  hotkey: {
    register: (accelerator: string, action: string) => Promise<any>
    unregister: (accelerator: string) => Promise<any>
  }
  clipboard: {
    startMonitoring: () => Promise<any>
    stopMonitoring: () => Promise<any>
  }
  mcp: {
    connect: () => Promise<any>
    sendMessage: (recipient: string, message: string, priority: string) => Promise<any>
    ragQuery: (query: string) => Promise<any>
    saveCheckpoint: (name: string, data: any) => Promise<any>
    loadCheckpoint: (name: string) => Promise<any>
  }
  devstral: {
    sendMessage: (message: string, autoSpeak: boolean) => Promise<any>
    testConnection: () => Promise<any>
    clearHistory: () => Promise<any>
    getHistory: () => Promise<any>
    quickQuery: (query: string) => Promise<any>
  }
}

declare global {
  interface Window {
    electron: IElectronAPI
    api: IAPI
  }
}
