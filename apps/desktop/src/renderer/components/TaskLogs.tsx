import { useState, useEffect, useRef } from 'react'
import { ScrollArea } from './ui/scroll-area'
import { Badge } from './ui/badge'
import { Tooltip } from './ui/tooltip'
import { Copy, Download, Trash2, RefreshCw } from 'lucide-react'
import { toast } from './ui/toast'
import { useKuroryuuDialog } from '../hooks/useKuroryuuDialog'

interface LogEntry {
  timestamp: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
}

interface TaskLogsProps {
  taskId?: string
  projectRoot?: string
  logs?: LogEntry[]
  isLive?: boolean
}

export function TaskLogs({ taskId, projectRoot, logs: propLogs, isLive = false }: TaskLogsProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [autoScroll, setAutoScroll] = useState(true)
  const [logs, setLogs] = useState<LogEntry[]>(propLogs || [])
  const [loading, setLoading] = useState(false)
  const { confirm } = useKuroryuuDialog()

  // Load logs from Docs/worklogs/ (KiroWorklogs)
  const loadLogs = async () => {
    if (!projectRoot || !taskId) return

    setLoading(true)
    try {
      const worklogDir = `${projectRoot}/Docs/worklogs`
      const entries = await window.electronAPI.fs.readDir(worklogDir)
      const parsedLogs: LogEntry[] = []
      const taskIdLower = taskId.toLowerCase()

      // Find worklogs that might match this task
      for (const entry of entries) {
        if (!entry.endsWith('.md')) continue

        const nameLower = entry.toLowerCase()
        // Match on task ID or task-related keywords in filename
        if (!nameLower.includes(taskIdLower)) continue

        try {
          const content = await window.electronAPI.fs.readFile(`${worklogDir}/${entry}`)

          // Extract timestamp from filename: KiroWorkLog_YYYYMMDD_HHMMSS_Description.md
          const dateMatch = entry.match(/(\d{8})_(\d{6})/)
          let timestamp = new Date().toISOString()
          if (dateMatch) {
            const [, date, time] = dateMatch
            timestamp = `${date.slice(0,4)}-${date.slice(4,6)}-${date.slice(6,8)} ${time.slice(0,2)}:${time.slice(2,4)}:${time.slice(4,6)}`
          }

          // Parse worklog content for key entries
          const lines = content.split('\n')
          for (const line of lines) {
            // Skip empty lines and headers
            if (!line.trim() || line.startsWith('#')) continue

            // Determine level based on content
            let level: LogEntry['level'] = 'info'
            if (line.toLowerCase().includes('error') || line.includes('❌') || line.includes('FAILED')) level = 'error'
            else if (line.toLowerCase().includes('warn') || line.includes('⚠') || line.includes('TODO')) level = 'warn'
            else if (line.includes('✅') || line.includes('DONE') || line.includes('completed')) level = 'info'
            else if (line.startsWith('-') || line.startsWith('*')) level = 'debug'

            // Only include bullet points and notable lines
            if (line.startsWith('-') || line.startsWith('*') || line.startsWith('>')) {
              const message = line.replace(/^[-*>]\s*/, '').trim()
              if (message && message.length > 5) {
                parsedLogs.push({ timestamp, level, message })
              }
            }
          }
        } catch {
          // File read error, skip
        }
      }

      // Sort by timestamp (most recent first)
      parsedLogs.sort((a, b) => b.timestamp.localeCompare(a.timestamp))
      setLogs(parsedLogs)
    } catch (err) {
      console.error('Failed to load worklogs:', err)
    }
    setLoading(false)
  }

  useEffect(() => {
    if (propLogs && propLogs.length > 0) {
      setLogs(propLogs)
    } else {
      loadLogs()
    }
  }, [taskId, projectRoot, propLogs])

  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight
    }
  }, [logs, autoScroll])

  const levelColors = {
    info: 'text-blue-400 bg-blue-500/10',
    warn: 'text-primary bg-primary/10',
    error: 'text-red-400 bg-red-500/10',
    debug: 'text-muted-foreground bg-muted-foreground/10',
  }

  const levelBadgeVariants = {
    info: 'info',
    warn: 'warning',
    error: 'error',
    debug: 'secondary',
  } as const

  const handleCopy = () => {
    const text = logs.map(log => `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`).join('\n')
    navigator.clipboard.writeText(text)
    toast.success('Logs copied to clipboard')
  }

  const handleDownload = () => {
    const text = logs.map(log => `[${log.timestamp}] ${log.level.toUpperCase()}: ${log.message}`).join('\n')
    const blob = new Blob([text], { type: 'text/plain' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `task-${taskId || 'logs'}.txt`
    a.click()
    URL.revokeObjectURL(url)
  }

  const handleClear = async () => {
    const yes = await confirm({
      title: 'Clear Logs',
      message: 'Clear all logs? This cannot be undone.',
    })
    if (yes) {
      setLogs([])
      toast.info('Logs cleared')
    }
  }

  return (
    <div className="flex flex-col h-full bg-card border border-border rounded-lg overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between p-3 border-b border-border flex-shrink-0">
        <div className="flex items-center gap-2">
          <h3 className="text-sm font-medium text-foreground">
            {isLive ? 'Live Logs' : 'Task Logs'}
          </h3>
          <span className="text-xs text-muted-foreground">
            {logs.length} entries
          </span>
        </div>
        <div className="flex items-center gap-1">
          <Tooltip content="Copy all logs">
            <button
              onClick={handleCopy}
              className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              disabled={logs.length === 0}
            >
              <Copy className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip content="Download as file">
            <button
              onClick={handleDownload}
              className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              disabled={logs.length === 0}
            >
              <Download className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip content="Clear logs">
            <button
              onClick={handleClear}
              className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              disabled={logs.length === 0}
            >
              <Trash2 className="w-4 h-4" />
            </button>
          </Tooltip>
          <Tooltip content="Refresh logs">
            <button
              onClick={loadLogs}
              className="p-1.5 rounded hover:bg-secondary text-muted-foreground hover:text-foreground transition-colors"
              disabled={loading}
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </Tooltip>
        </div>
      </div>

      {/* Logs container */}
      {loading ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          Loading logs...
        </div>
      ) : logs.length === 0 ? (
        <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
          {isLive ? 'Waiting for logs...' : 'No logs available'}
        </div>
      ) : (
        <ScrollArea className="flex-1">
          <div
            ref={scrollRef}
            className="p-3 space-y-1 font-mono text-xs"
          >
            {logs.map((log, idx) => (
              <div
                key={idx}
                className="flex items-start gap-2 py-1 px-2 rounded hover:bg-secondary/50 transition-colors"
              >
                <span className="text-muted-foreground flex-shrink-0 w-28">
                  {log.timestamp}
                </span>
                <Badge variant={levelBadgeVariants[log.level]} size="sm">
                  {log.level}
                </Badge>
                <span className={`flex-1 break-words ${levelColors[log.level]}`}>
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        </ScrollArea>
      )}

      {/* Footer - Auto scroll toggle */}
      {logs.length > 0 && (
        <div className="p-2 border-t border-border bg-background flex-shrink-0">
          <label className="flex items-center gap-2 text-xs text-muted-foreground cursor-pointer hover:text-foreground">
            <input
              type="checkbox"
              checked={autoScroll}
              onChange={(e) => setAutoScroll(e.target.checked)}
              className="rounded"
            />
            Auto-scroll
          </label>
        </div>
      )}
    </div>
  )
}
