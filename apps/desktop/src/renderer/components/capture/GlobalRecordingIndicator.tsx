/**
 * GlobalRecordingIndicator
 *
 * A tiny, always-visible recording indicator displayed at the app root level.
 * Appears on ALL pages when recording is active - ensures users always know
 * when screen capture is running (privacy/security concern).
 *
 * Features:
 * - Fixed top-right position (z-40)
 * - Clickable to navigate to Capture panel
 * - Subtle entrance animation
 * - Non-intrusive but eye-catching
 * - Hidden on Terminals view (has its own header indicator)
 */
import { useCaptureStore } from '@/stores/capture-store'
import { RecordingIndicator } from './RecordingIndicator'

interface GlobalRecordingIndicatorProps {
  onNavigateToCapture?: () => void
  activeView?: string
}

export function GlobalRecordingIndicator({ onNavigateToCapture, activeView }: GlobalRecordingIndicatorProps) {
  const isRecording = useCaptureStore((s) => s.isRecording)

  // Hide when not recording or when on terminals view (has its own header indicator)
  if (!isRecording || activeView === 'terminals') return null

  return (
    <div className="fixed top-3 right-3 z-40 animate-in fade-in slide-in-from-top-1 duration-200">
      <RecordingIndicator variant="global" onClick={onNavigateToCapture} />
    </div>
  )
}
