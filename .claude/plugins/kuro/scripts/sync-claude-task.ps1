# Kuroryuu Claude Code Task Sync
# PostToolUse hook: Syncs TaskCreate/TaskUpdate to ai/todo.md ## Claude Tasks section
#
# Input methods (tries in order):
#   1. stdin JSON: { tool_name, tool_input, tool_result }
#   2. Environment variables: CLAUDE_TOOL_*
#   3. Parse transcript for recent TaskCreate/TaskUpdate calls
#
# Output (stdout JSON):
#   - { "ok": true } on success
#   - { "ok": false, "error": "..." } on failure (but never blocks Claude)

param()

# ============================================================================
# Configuration
# ============================================================================
# Resolve project root: env var (for global plugin) or current directory (for project plugin)
$projectRoot = if ($env:KURORYUU_PROJECT_ROOT) { $env:KURORYUU_PROJECT_ROOT } else { (Get-Location).Path }
$todoPath = Join-Path $projectRoot "ai\todo.md"
$logFile = Join-Path $projectRoot "ai\hooks\claude-task-debug.log"
$taskMapFile = Join-Path $projectRoot "ai\hooks\task_id_map.json"
$metaPath = Join-Path $projectRoot "ai\task-meta.json"
$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"

# ============================================================================
# Logging Helper
# ============================================================================
function Write-Log {
    param([string]$Message)
    $logDir = Split-Path $logFile -Parent
    if (-not (Test-Path $logDir)) {
        New-Item -ItemType Directory -Path $logDir -Force | Out-Null
    }
    Add-Content -Path $logFile -Value "[$timestamp] $Message"
}

Write-Log "=== HOOK FIRED ==="

# ============================================================================
# Helper: Get next task ID by parsing max T### from Claude Tasks section
# ============================================================================
function Get-NextTaskId {
    param([string]$content)

    # Find Claude Tasks section
    if ($content -notmatch "## Claude Tasks") {
        return "T001"
    }

    # Extract section between ## Claude Tasks and next ##
    $pattern = "(?s)## Claude Tasks.*?(?=\r?\n## |\z)"
    if ($content -match $pattern) {
        $section = $Matches[0]

        # Find all T### patterns - wrap in @() to ensure array
        $matches = [regex]::Matches($section, "T(\d{3,})")
        $ids = @($matches | ForEach-Object { [int]$_.Groups[1].Value })

        if ($ids.Count -gt 0) {
            $maxId = ($ids | Measure-Object -Maximum).Maximum
            $nextId = [int]$maxId + 1
            return ("T{0:D3}" -f $nextId)
        }
    }

    return "T001"
}

# ============================================================================
# Helper: Add task to Claude Tasks section
# ============================================================================
function Add-ClaudeTask {
    param(
        [string]$content,
        [string]$taskId,
        [string]$description
    )

    # Clean description
    $cleanDesc = $description -replace '[\r\n]', ' '
    $cleanDesc = $cleanDesc.Trim()
    if ($cleanDesc.Length -gt 200) {
        $cleanDesc = $cleanDesc.Substring(0, 197) + "..."
    }

    # Create task line
    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $taskLine = "- [ ] ${taskId}: ${cleanDesc} @agent [worklog: pending] (created: $timestamp)"

    # Create ## Claude Tasks section if it doesn't exist
    if ($content -notmatch "## Claude Tasks") {
        Write-Log "Creating missing ## Claude Tasks section"
        if ($content -match "(## Change History)") {
            # Insert before Change History
            $content = $content -replace "(## Change History)", "## Claude Tasks`n`n`$1"
        } else {
            # Append at end
            $content = $content.TrimEnd() + "`n`n## Claude Tasks`n"
        }
    }

    # Find insertion point (after <!-- comment --> or after ## Claude Tasks header)
    if ($content -match "(## Claude Tasks\s*\r?\n(?:<!--.*?-->\s*\r?\n)?)") {
        $insertAfter = $Matches[1]
        $insertPos = $content.IndexOf($insertAfter) + $insertAfter.Length
        $before = $content.Substring(0, $insertPos)
        $after = $content.Substring($insertPos)
        return "${before}${taskLine}`n${after}"
    }

    # Fallback: append after ## Claude Tasks
    return $content -replace "(## Claude Tasks\s*\r?\n)", "`$1${taskLine}`n"
}

# ============================================================================
# Helper: Mark task as completed (only in Claude Tasks section)
# ============================================================================
function Complete-ClaudeTask {
    param(
        [string]$content,
        [string]$taskId
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"

    # Only search within the Claude Tasks section to avoid matching Kanban tasks
    if ($content -notmatch "## Claude Tasks") {
        Write-Log "No Claude Tasks section found - cannot complete task"
        return $content
    }

    # Extract Claude Tasks section (between ## Claude Tasks and next ## or end)
    $sectionPattern = "(?s)(## Claude Tasks\s*\r?\n)(.*?)(?=\r?\n## |\z)"
    if ($content -match $sectionPattern) {
        $sectionHeader = $Matches[1]
        $sectionContent = $Matches[2]

        # Find and update the task line within the section
        $taskPattern = "- \[ \] (${taskId}:.*?)(\r?\n|$)"
        if ($sectionContent -match $taskPattern) {
            $taskLine = $Matches[1]
            # Add completed timestamp if not already present
            if ($taskLine -notmatch "\(completed:") {
                $newLine = "- [x] ${taskLine} (completed: $timestamp)"
            } else {
                $newLine = "- [x] ${taskLine}"
            }
            $newSectionContent = $sectionContent -replace [regex]::Escape("- [ ] ${taskLine}"), $newLine
            return $content -replace [regex]::Escape("${sectionHeader}${sectionContent}"), "${sectionHeader}${newSectionContent}"
        }
    }

    Write-Log "Task $taskId not found in Claude Tasks section"
    return $content
}

# ============================================================================
# Helper: Append to Change History
# ============================================================================
function Add-ChangeHistory {
    param(
        [string]$content,
        [string]$entry
    )

    $timestamp = Get-Date -Format "yyyy-MM-dd HH:mm"
    $historyLine = "- $timestamp - $entry"

    if ($content -match "## Change History") {
        # Append at end of file (Change History is last section)
        return $content.TrimEnd() + "`n$historyLine`n"
    }

    return $content
}

# ============================================================================
# Task ID Mapping
# ============================================================================
function Get-TaskIdMap {
    if (Test-Path $taskMapFile) {
        try {
            $content = Get-Content $taskMapFile -Raw -Encoding UTF8
            # Remove BOM if present
            $content = $content -replace '^\xEF\xBB\xBF', ''
            $content = $content.Trim()
            if ($content -and $content.Length -gt 2) {
                $json = $content | ConvertFrom-Json
                # Convert PSCustomObject to hashtable
                $map = @{}
                $json.PSObject.Properties | ForEach-Object {
                    $map[$_.Name] = $_.Value
                }
                Write-Log "Loaded mapping with $($map.Count) entries: $($map.Keys -join ', ')"
                return $map
            }
        } catch {
            Write-Log "ERROR loading task map: $($_.Exception.Message)"
            return @{}
        }
    }
    Write-Log "Task map file not found: $taskMapFile"
    return @{}
}

function Save-TaskIdMap {
    param([hashtable]$Map)
    $json = $Map | ConvertTo-Json -Depth 3
    # Use .NET method to avoid BOM
    [System.IO.File]::WriteAllText($taskMapFile, $json, [System.Text.Encoding]::UTF8)
}

# ============================================================================
# Sidecar Metadata (ai/task-meta.json)
# ============================================================================
function Get-TaskMeta {
    if (-not (Test-Path $metaPath)) {
        return @{ version = 1; tasks = @{} }
    }
    try {
        $content = Get-Content $metaPath -Raw -Encoding UTF8
        $content = $content -replace '^\xEF\xBB\xBF', ''
        $content = $content.Trim()
        if ($content -and $content.Length -gt 2) {
            $json = $content | ConvertFrom-Json
            $meta = @{ version = $json.version; tasks = @{} }
            if ($json.tasks) {
                $json.tasks.PSObject.Properties | ForEach-Object {
                    $taskObj = @{}
                    $_.Value.PSObject.Properties | ForEach-Object {
                        $taskObj[$_.Name] = $_.Value
                    }
                    $meta.tasks[$_.Name] = $taskObj
                }
            }
            return $meta
        }
    } catch {
        Write-Log "ERROR loading task meta: $($_.Exception.Message)"
    }
    return @{ version = 1; tasks = @{} }
}

function Save-TaskMeta {
    param([hashtable]$Meta)
    $metaDir = Split-Path $metaPath -Parent
    if (-not (Test-Path $metaDir)) {
        New-Item -ItemType Directory -Path $metaDir -Force | Out-Null
    }
    $json = $Meta | ConvertTo-Json -Depth 4
    # UTF-8 WITHOUT BOM — critical for Python json.load() compatibility
    $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
    [System.IO.File]::WriteAllText($metaPath, $json, $utf8NoBom)
}

function Write-TaskSidecar {
    param(
        [string]$TaskId,
        [string]$Description,
        [object]$ToolInput
    )

    $meta = Get-TaskMeta
    if (-not $meta.tasks) {
        $meta.tasks = @{}
    }

    $entry = @{}

    # Full description (not truncated)
    if ($Description) {
        $entry.description = $Description
    }

    # Priority from tool_input (validate)
    if ($ToolInput -and $ToolInput.priority) {
        $priority = $ToolInput.priority.ToString().ToLower()
        if ($priority -in @('low', 'medium', 'high')) {
            $entry.priority = $priority
        }
    }

    # Category from tool_input (validate)
    if ($ToolInput -and $ToolInput.category) {
        $category = $ToolInput.category.ToString().ToLower()
        $validCategories = @('feature', 'bug_fix', 'refactoring', 'documentation',
                            'security', 'performance', 'ui_ux', 'infrastructure', 'testing')
        if ($category -in $validCategories) {
            $entry.category = $category
        }
    }

    # Timestamps (ISO 8601 UTC)
    $now = (Get-Date).ToUniversalTime().ToString("yyyy-MM-ddTHH:mm:ssZ")
    $entry.createdAt = $now
    $entry.updatedAt = $now

    $meta.tasks[$TaskId] = $entry

    try {
        Save-TaskMeta -Meta $meta
        Write-Log "Sidecar written for $TaskId (description: $($Description.Length) chars)"
    } catch {
        Write-Log "ERROR writing sidecar: $($_.Exception.Message)"
    }
}

# ============================================================================
# Transcript Parsing (fallback when stdin empty)
# ============================================================================
function Get-RecentTaskToolFromTranscript {
    # Convert project path to Claude projects format
    $projectPath = $projectRoot -replace ':\\', '--' -replace '\\', '-'
    $claudeProjectsDir = Join-Path $env:USERPROFILE ".claude\projects\$projectPath"

    if (-not (Test-Path $claudeProjectsDir)) {
        Write-Log "Claude projects dir not found: $claudeProjectsDir"
        return $null
    }

    # Find most recent transcript
    $transcriptFile = Get-ChildItem $claudeProjectsDir -Filter "*.jsonl" -File |
        Where-Object { $_.Directory.Name -ne "subagents" } |
        Sort-Object LastWriteTime -Descending |
        Select-Object -First 1

    if (-not $transcriptFile) {
        Write-Log "No transcript file found"
        return $null
    }

    Write-Log "Parsing transcript: $($transcriptFile.Name)"

    # Read last 50 lines looking for TaskCreate/TaskUpdate
    $lines = Get-Content $transcriptFile.FullName -Tail 50

    # Find most recent tool_use for TaskCreate or TaskUpdate
    $taskToolLine = $lines | Where-Object {
        $_ -match '"type":"assistant"' -and
        ($_ -match '"name":"TaskCreate"' -or $_ -match '"name":"TaskUpdate"')
    } | Select-Object -Last 1

    if (-not $taskToolLine) {
        Write-Log "No TaskCreate/TaskUpdate found in recent transcript"
        return $null
    }

    try {
        $data = $taskToolLine | ConvertFrom-Json
        $content = $data.message.content

        # Find tool_use block
        $toolUse = $content | Where-Object {
            $_.type -eq 'tool_use' -and
            ($_.name -eq 'TaskCreate' -or $_.name -eq 'TaskUpdate')
        } | Select-Object -Last 1

        if ($toolUse) {
            Write-Log "Found tool_use: $($toolUse.name)"
            return @{
                tool_name = $toolUse.name
                tool_input = $toolUse.input
                tool_id = $toolUse.id
            }
        }
    } catch {
        Write-Log "Error parsing transcript: $($_.Exception.Message)"
    }

    return $null
}

# ============================================================================
# Main
# ============================================================================
try {
    $toolName = $null
    $toolInput = $null
    $toolResult = $null
    $claudeTaskId = $null

    # Method 1: Try stdin
    $inputJson = $input | Out-String
    Write-Log "STDIN length: $($inputJson.Length)"

    if ($inputJson -and $inputJson.Trim().Length -gt 0) {
        Write-Log "STDIN content: $inputJson"
        try {
            $data = $inputJson | ConvertFrom-Json
            $toolName = $data.tool_name
            $toolInput = $data.tool_input
            # stdin uses tool_response (not tool_result)
            $toolResult = if ($data.tool_response) { $data.tool_response } else { $data.tool_result }
            Write-Log "Parsed from stdin: tool_name=$toolName"
        } catch {
            Write-Log "Failed to parse stdin JSON: $($_.Exception.Message)"
        }
    }

    # Method 2: Try environment variables
    if (-not $toolName) {
        Write-Log "Checking environment variables..."
        $envVars = Get-ChildItem env: | Where-Object { $_.Name -like "*CLAUDE*" -or $_.Name -like "*TOOL*" }
        foreach ($var in $envVars) {
            Write-Log "  ENV: $($var.Name) = $($var.Value)"
        }

        if ($env:CLAUDE_TOOL_NAME) {
            $toolName = $env:CLAUDE_TOOL_NAME
            Write-Log "Got tool_name from env: $toolName"
        }
        if ($env:CLAUDE_TOOL_INPUT) {
            try {
                $toolInput = $env:CLAUDE_TOOL_INPUT | ConvertFrom-Json
                Write-Log "Got tool_input from env"
            } catch {}
        }
    }

    # Method 3: Parse transcript as fallback
    if (-not $toolName) {
        Write-Log "Trying transcript fallback..."
        $transcriptData = Get-RecentTaskToolFromTranscript
        if ($transcriptData) {
            $toolName = $transcriptData.tool_name
            $toolInput = $transcriptData.tool_input
            $claudeTaskId = $transcriptData.tool_id
            Write-Log "Got from transcript: tool_name=$toolName"
        }
    }

    # Check if we have a tool to process
    if (-not $toolName) {
        Write-Log "No tool data found via any method - exiting"
        Write-Output '{"ok": true, "skipped": "no tool data found"}'
        exit 0
    }

    # Only process TaskCreate and TaskUpdate
    if ($toolName -notin @("TaskCreate", "TaskUpdate")) {
        Write-Log "Tool is not a task tool: $toolName"
        Write-Output '{"ok": true, "skipped": "not a task tool"}'
        exit 0
    }

    Write-Log "Processing $toolName..."

    # Check if todo.md exists
    if (-not (Test-Path $todoPath)) {
        Write-Output '{"ok": false, "error": "todo.md not found"}'
        exit 0
    }

    # Read current content
    $content = Get-Content $todoPath -Raw -Encoding UTF8

    if ($toolName -eq "TaskCreate") {
        # Get description from tool input
        $description = $toolInput.description
        if (-not $description) {
            $description = $toolInput.subject
        }
        if (-not $description) {
            $description = $toolInput.title
        }
        if (-not $description) {
            $description = "Unnamed task"
        }

        Write-Log "TaskCreate description: $description"

        # Get next ID and add task
        $taskId = Get-NextTaskId -content $content
        $content = Add-ClaudeTask -content $content -taskId $taskId -description $description
        $content = Add-ChangeHistory -content $content -entry "TaskCreate: $taskId - $($description.Substring(0, [Math]::Min(50, $description.Length)))"

        # Write back atomically to prevent corruption
        $content = $content -replace '^\xEF\xBB\xBF', ''  # Remove BOM if present
        [System.IO.File]::WriteAllText($todoPath, $content, [System.Text.Encoding]::UTF8)

        # Save ID mapping from multiple sources
        $map = Get-TaskIdMap
        $mappingSaved = $false

        # Map 1: Claude's tool_use.id from transcript parsing
        if ($claudeTaskId) {
            $map[$claudeTaskId] = $taskId
            Write-Log "Saved mapping (tool_use.id): $claudeTaskId -> $taskId"
            $mappingSaved = $true
        }

        # Map 2: tool_use_id from stdin
        if ($data -and $data.tool_use_id) {
            $map[$data.tool_use_id] = $taskId
            Write-Log "Saved mapping (tool_use_id): $($data.tool_use_id) -> $taskId"
            $mappingSaved = $true
        }

        # Map 3: Response task ID from tool_response.task.id
        # Use session_id prefix to avoid collisions between agents/sessions
        $sessionId = $data.session_id
        Write-Log "DEBUG: sessionId=$sessionId, data.session_id=$($data.session_id)"
        $responseTaskId = $null
        if ($toolResult -and $toolResult.task -and $toolResult.task.id) {
            $responseTaskId = $toolResult.task.id
        } elseif ($data -and $data.tool_response -and $data.tool_response.task -and $data.tool_response.task.id) {
            $responseTaskId = $data.tool_response.task.id
        }

        if ($responseTaskId -and $sessionId) {
            # Session-scoped mapping: prevents race conditions between agents
            $map["${sessionId}_task_$responseTaskId"] = $taskId
            Write-Log "Saved mapping (session_task): ${sessionId}_task_$responseTaskId -> $taskId"
            $mappingSaved = $true
        } elseif ($responseTaskId) {
            # Fallback without session (legacy)
            $map["task_$responseTaskId"] = $taskId
            Write-Log "Saved mapping (task_N): task_$responseTaskId -> $taskId"
            $mappingSaved = $true
        }

        # Map 4: Regex fallback - extract from string representation
        $toolResultStr = $toolResult | ConvertTo-Json -Compress -Depth 5 2>$null
        if ($toolResultStr -match '"id"\s*:\s*"?(\d+)"?') {
            $numericId = $Matches[1]
            if (-not $map["task_$numericId"]) {
                $map["task_$numericId"] = $taskId
                Write-Log "Saved mapping (regex): task_$numericId -> $taskId"
                $mappingSaved = $true
            }
        }

        # Save the map
        if ($mappingSaved) {
            try {
                Save-TaskIdMap -Map $map
                Write-Log "Mapping file saved with keys: $($map.Keys -join ', ')"
            } catch {
                Write-Log "ERROR saving mapping: $($_.Exception.Message)"
            }
        } else {
            Write-Log "WARNING: No mappings were created"
        }

        # Write sidecar metadata (full description, not truncated)
        Write-TaskSidecar -TaskId $taskId -Description $description -ToolInput $toolInput

        Write-Log "SUCCESS: Created $taskId"
        Write-Output "{`"ok`": true, `"action`": `"created`", `"taskId`": `"$taskId`"}"
    }
    elseif ($toolName -eq "TaskUpdate") {
        # Check if marking as completed
        $status = $toolInput.status
        $taskId = $toolInput.taskId  # Claude's taskId field

        if (-not $taskId) {
            $taskId = $toolInput.task_id
        }
        if (-not $taskId) {
            $taskId = $toolInput.id
        }

        Write-Log "TaskUpdate: taskId=$taskId, status=$status"

        if ($status -eq "completed" -and $taskId) {
            $ourTaskId = $null
            $map = Get-TaskIdMap
            $sessionId = $data.session_id

            # Try to map Claude's task ID to our T### format
            if ($taskId -match "^T\d{3,}$") {
                # Already in our format
                $ourTaskId = $taskId
                Write-Log "Task ID already in T### format: $ourTaskId"
            } elseif ($taskId -match "^\d+$") {
                # Numeric ID - MUST look up mapping first
                # Priority 1: Session-scoped mapping (prevents cross-agent collisions)
                $sessionMappingKey = "${sessionId}_task_$taskId"
                if ($sessionId -and $map[$sessionMappingKey]) {
                    $ourTaskId = $map[$sessionMappingKey]
                    Write-Log "Found session-scoped mapping: $sessionMappingKey -> $ourTaskId"
                }
                # Priority 2: Legacy task_N mapping (fallback)
                elseif ($map["task_$taskId"]) {
                    $ourTaskId = $map["task_$taskId"]
                    Write-Log "Found legacy mapping: task_$taskId -> $ourTaskId"
                }
                # Priority 3: Direct key lookup
                elseif ($map[$taskId]) {
                    $ourTaskId = $map[$taskId]
                    Write-Log "Found direct mapping: $taskId -> $ourTaskId"
                } else {
                    # DO NOT blindly convert numeric ID to T### format
                    # This causes the bug where wrong task gets marked complete
                    Write-Log "WARNING: No mapping found for numeric task ID: $taskId (session: $sessionId)"
                    Write-Log "Available mappings: $($map.Keys -join ', ')"
                    # Do not set ourTaskId - let it fail gracefully
                }
            } else {
                # Non-numeric, non-T### ID - try lookup in mapping file
                if ($map[$taskId]) {
                    $ourTaskId = $map[$taskId]
                    Write-Log "Found mapping: $taskId -> $ourTaskId"
                }
            }

            if (-not $ourTaskId) {
                Write-Log "Cannot map task ID: $taskId (no mapping exists)"
                Write-Output "{`"ok`": true, `"action`": `"skipped`", `"reason`": `"cannot map task ID: $taskId - no mapping found`"}"
                exit 0
            }

            $content = Complete-ClaudeTask -content $content -taskId $ourTaskId
            $content = Add-ChangeHistory -content $content -entry "TaskUpdate: $ourTaskId completed"

            # Write back atomically to prevent corruption
            $content = $content -replace '^\xEF\xBB\xBF', ''  # Remove BOM if present
            [System.IO.File]::WriteAllText($todoPath, $content, [System.Text.Encoding]::UTF8)

            Write-Log "SUCCESS: Completed $ourTaskId"
            Write-Output "{`"ok`": true, `"action`": `"completed`", `"taskId`": `"$ourTaskId`"}"
        }
        else {
            Write-Log "Skipped: status=$status, taskId=$taskId"
            Write-Output '{"ok": true, "action": "skipped", "reason": "not a completion update"}'
        }
    }
}
catch {
    # Log error but don't block Claude
    $errorMsg = $_.Exception.Message -replace '"', "'"
    Write-Log "ERROR: $errorMsg"
    Write-Log "Stack: $($_.ScriptStackTrace)"
    Write-Output "{`"ok`": false, `"error`": `"$errorMsg`"}"
}

Write-Log "=== HOOK COMPLETE ==="
exit 0
