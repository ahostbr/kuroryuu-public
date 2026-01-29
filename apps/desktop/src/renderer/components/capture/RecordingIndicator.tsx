import { useEffect, useState } from 'react'
import { Circle } from 'lucide-react'
import { useCaptureStore } from '@/stores/capture-store'

interface RecordingIndicatorProps {
  variant?: 'compact' | 'floating' | 'global'
  onClick?: () => void
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000)
  const minutes = Math.floor(seconds / 60)
  const hours = Math.floor(minutes / 60)

  if (hours > 0) {
    return `${hours}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`
  }
  return `${minutes}:${String(seconds % 60).padStart(2, '0')}`
}

export function RecordingIndicator({ variant = 'compact', onClick }: RecordingIndicatorProps) {
  const { isRecording, recordingStartTime } = useCaptureStore()
  const [duration, setDuration] = useState(0)

  useEffect(() => {
    if (!isRecording || !recordingStartTime) {
      setDuration(0)
      return
    }

    const interval = setInterval(() => {
      setDuration(Date.now() - recordingStartTime)
    }, 100)

    return () => clearInterval(interval)
  }, [isRecording, recordingStartTime])

  if (!isRecording) return null

  // Global variant - tiny, always-visible indicator for app-wide display
  if (variant === 'global') {
    return (
      <button
        onClick={onClick}
        className="flex items-center gap-1 px-1.5 py-0.5 bg-red-500/15 rounded-full border border-red-500/30 hover:bg-red-500/25 hover:border-red-500/50 transition-all cursor-pointer group"
        title="Recording in progress - Click to open Capture panel"
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
          <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
        </span>
        <span className="text-red-400 text-[9px] font-bold tracking-wider group-hover:text-red-300">
          REC
        </span>
      </button>
    )
  }

  if (variant === 'floating') {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 bg-red-500/20 rounded-lg border border-red-500/40 animate-pulse">
        <Circle size={10} fill="currentColor" className="text-red-500 animate-ping" />
        <span className="text-red-400 text-xs font-bold tracking-wider">REC</span>
        <span className="text-red-300 text-xs font-mono">{formatDuration(duration)}</span>
      </div>
    )
  }

  // Compact variant (default)
  return (
    <div className="flex items-center gap-1.5 px-2 py-0.5 bg-red-500/20 rounded-full border border-red-500/40 animate-pulse">
      <Circle size={8} fill="currentColor" className="text-red-500 animate-ping" />
      <span className="text-red-400 text-[10px] font-bold tracking-wider">REC</span>
      <span className="text-red-300 text-[10px] font-mono">{formatDuration(duration)}</span>
    </div>
  )
}
