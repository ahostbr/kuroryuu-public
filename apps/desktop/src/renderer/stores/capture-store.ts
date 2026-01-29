import { create } from 'zustand'

interface CaptureState {
  isRecording: boolean
  recordingStartTime: number | null
  isDigestActive: boolean

  // Actions
  startRecording: () => void
  stopRecording: () => void
  setDigestActive: (active: boolean) => void
}

export const useCaptureStore = create<CaptureState>((set) => ({
  isRecording: false,
  recordingStartTime: null,
  isDigestActive: false,

  startRecording: () => set({
    isRecording: true,
    recordingStartTime: Date.now()
  }),

  stopRecording: () => set({
    isRecording: false,
    recordingStartTime: null
  }),

  setDigestActive: (active) => set({ isDigestActive: active }),
}))
