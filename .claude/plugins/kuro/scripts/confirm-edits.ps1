# Kuroryuu Question Mode Hook
# PreToolUse hook for Write/Edit - prompts Claude to ask clarifying questions when unsure
# Toggle: ai/hook_question_toggle (exists = question mode, missing = autonomous)

param()

$projectRoot = (Get-Location).Path
$toggleFile = Join-Path $projectRoot "ai\hook_question_toggle"

# Check if toggle is enabled
if (-not (Test-Path $toggleFile)) {
    # Autonomous mode - proceed without extra questioning
    exit 0
}

# Question mode enabled - inject thinking prompt
$inputJson = $input | Out-String
$filePath = ""

try {
    $hookInput = $inputJson | ConvertFrom-Json
    $filePath = $hookInput.tool_input.file_path
} catch {}

# Return system message to encourage questioning
$response = @{
    systemMessage = "QUESTION MODE ACTIVE: Before this edit to $filePath, pause and reflect:

1. Do I fully understand WHY the user wants this change?
2. Are there ambiguities in the request I should clarify?
3. Could this be done multiple ways - should I ask which approach?
4. Will this have side effects the user might not expect?
5. Is this the right file/location for this change?

If ANY doubt exists, ASK the user a specific question BEFORE making this edit. Don't assume - clarify. The user prefers questions over fixing mistakes later."
} | ConvertTo-Json -Compress

Write-Output $response
