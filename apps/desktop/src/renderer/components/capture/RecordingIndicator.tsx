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
        style={{
          background: 'color-mix(in srgb, var(--cp-crimson) 15%, transparent)',
          border: '1px solid color-mix(in srgb, var(--cp-crimson) 30%, transparent)',
        }}
        className="flex items-center gap-1 px-1.5 py-0.5 rounded-full transition-all cursor-pointer group hover:bg-opacity-25"
        title="Recording in progress - Click to open Capture panel"
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--cp-crimson) 25%, transparent)';
          (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--cp-crimson) 50%, transparent)';
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--cp-crimson) 15%, transparent)';
          (e.currentTarget as HTMLElement).style.borderColor = 'color-mix(in srgb, var(--cp-crimson) 30%, transparent)';
        }}
      >
        <span className="relative flex h-2 w-2">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full opacity-75" style={{ background: 'var(--cp-crimson)' }}></span>
          <span className="relative inline-flex rounded-full h-2 w-2" style={{ background: 'var(--cp-crimson)' }}></span>
        </span>
        <span className="text-[9px] font-bold tracking-wider" style={{ color: 'color-mix(in srgb, var(--cp-crimson) 80%, transparent)' }}>
          REC
        </span>
      </button>
    )
  }

  if (variant === 'floating') {
    return (
      <div
        className="flex items-center gap-2 px-3 py-1.5 rounded-lg animate-pulse"
        style={{
          background: 'color-mix(in srgb, var(--cp-crimson) 20%, transparent)',
          border: '1px solid color-mix(in srgb, var(--cp-crimson) 40%, transparent)',
        }}
      >
        <Circle size={10} fill="currentColor" className="animate-ping" style={{ color: 'var(--cp-crimson)' }} />
        <span className="text-xs font-bold tracking-wider" style={{ color: 'color-mix(in srgb, var(--cp-crimson) 80%, transparent)' }}>REC</span>
        <span className="text-xs font-mono" style={{ color: 'color-mix(in srgb, var(--cp-crimson) 70%, transparent)' }}>{formatDuration(duration)}</span>
      </div>
    )
  }

  // Compact variant (default)
  return (
    <div
      className="flex items-center gap-1.5 px-2 py-0.5 rounded-full animate-pulse"
      style={{
        background: 'color-mix(in srgb, var(--cp-crimson) 20%, transparent)',
        border: '1px solid color-mix(in srgb, var(--cp-crimson) 40%, transparent)',
      }}
    >
      <Circle size={8} fill="currentColor" className="animate-ping" style={{ color: 'var(--cp-crimson)' }} />
      <span className="text-[10px] font-bold tracking-wider" style={{ color: 'color-mix(in srgb, var(--cp-crimson) 80%, transparent)' }}>REC</span>
      <span className="text-[10px] font-mono" style={{ color: 'color-mix(in srgb, var(--cp-crimson) 70%, transparent)' }}>{formatDuration(duration)}</span>
    </div>
  )
}
