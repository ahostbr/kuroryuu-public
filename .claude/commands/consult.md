---
description: Consult multiple LLM models for diverse opinions on a question
argument-hint: "[question] [--preset quick|default|wide] [--models m1,m2,...] [--system \"prompt\"]"
allowed-tools: Bash, Read
---

# /consult — Multi-Model LLM Consultation

You are executing the `/consult` command. Send the user's question to multiple LLM models and synthesize their responses.

## Input

The user's argument is: `$ARGUMENTS`

## Step 1: Load Config

Read the file `.claude/consult-config.json` to get the model panel configuration, provider URLs, and defaults.

## Step 2: Parse Arguments

Parse the following flags from the argument string. Everything that isn't a flag is the **question**.

| Flag | Default | Effect |
|------|---------|--------|
| `--preset P` | `default` | Panel preset: `quick`, `default`, `wide` |
| `--models m1,m2,...` | (none) | Override preset with specific model keys from config |
| `--system "..."` | (see below) | Custom system prompt for all models |
| `--no-local` | off | Skip LM Studio models even if in panel |
| `--temp N` | `0.7` | Temperature for all models |

If no question is found, ask the user what they'd like to consult about and stop.

## Step 3: Resolve Model Panel

1. If `--models` was provided, use those model keys (comma-separated).
2. Otherwise, use the preset from `--preset` (or `"default"` if not specified) — look up the preset in `config.presets`.
3. Merge in `config.alwaysInclude` models (deduplicate).
4. If `--no-local` is set, remove any models whose provider is `"lmstudio"`.
5. Look up each model key in `config.models` to get `id`, `name`, and `provider`.
6. Look up each provider in `config.providers` to get `baseUrl` and `auth`.

For providers with a `chatPath` field, append that to `baseUrl` for the completions endpoint. Otherwise use the standard `/chat/completions` path. Skip providers where `enabled` is explicitly `false`.

## Step 4: Health Check

For each unique provider in the panel, run a quick connectivity check:

```bash
curl -s --max-time 5 -o /dev/null -w "%{http_code}" PROVIDER_BASE_URL/models
```

Report which providers are up/down. Remove models whose provider is down, but continue with the rest. If ALL providers are down, report the failure and stop.

## Step 5: Query All Models in PARALLEL

**This is critical: fire ALL curl calls as parallel Bash tool calls in a single message.**

Use the resolved temperature (from `--temp` or `config.defaults.temperature`) and max tokens from `config.defaults.maxTokens`. Use `config.defaults.timeoutSeconds` as the curl `--max-time`.

### Default system prompt (used when `--system` is not provided):
```
You are a technical consultant providing your honest, independent opinion. Be concise but thorough. Focus on practical implications. If you disagree with a premise, say so directly. Provide your reasoning, not just conclusions. Keep your response under 500 words.
```

### Curl pattern for providers WITH auth:
```bash
curl -s --max-time TIMEOUT PROVIDER_BASE_URL/chat/completions \
  -H "Content-Type: application/json" \
  -H "Authorization: AUTH_VALUE" \
  -d '{"model":"MODEL_ID","messages":[{"role":"system","content":"SYSTEM_PROMPT"},{"role":"user","content":"QUESTION"}],"temperature":TEMP,"max_tokens":MAX_TOKENS}'
```

### Curl pattern for providers WITHOUT auth (auth is null):
```bash
curl -s --max-time TIMEOUT PROVIDER_BASE_URL/chat/completions \
  -H "Content-Type: application/json" \
  -d '{"model":"MODEL_ID","messages":[{"role":"system","content":"SYSTEM_PROMPT"},{"role":"user","content":"QUESTION"}],"temperature":TEMP,"max_tokens":MAX_TOKENS}'
```

**IMPORTANT:** Properly escape the question and system prompt for JSON. Replace double quotes with `\"`, backslashes with `\\`, and newlines with `\n` in the shell command.

## Step 6: Extract and Present Responses

For each curl response:
1. Parse the JSON and extract `.choices[0].message.content`
2. If the curl failed, timed out, or returned an error, record `[ERROR: description]`

Present ALL responses with clear attribution using this format:

```
## Consultation Results

**Question:** {the question}
**Models consulted:** {count} ({comma-separated model names})
**Preset:** {preset used}

---

### {Model Name} ({Provider})
> {full response text}

### {Model Name} ({Provider})
> {full response text}

...

---
```

## Step 7: Synthesize

After presenting all raw responses, provide a synthesis:

```
## Synthesis

### Agreement
- {Points where 2+ models converge on the same conclusion}

### Disagreement
- {Points where models diverge, with attribution — e.g., "GPT recommends X while Gemini prefers Y"}

### Unique Insights
- {Points only one model raised that are worth noting}

### My Assessment
{Your own synthesis weighing all the opinions. Be direct about which arguments you find most compelling and why. Add any considerations the models missed.}
```

## Error Handling

| Scenario | Action |
|----------|--------|
| A provider is down (health check fails) | Skip its models, note in output, continue with others |
| A single model errors or times out | Show `[ERROR: reason]` for that model, continue with others |
| All models fail | Report failure, suggest checking that CLIProxyAPIPlus (port 8317) and/or LM Studio are running |
| No question provided | Ask the user what they want to consult about |
| Unknown model key in `--models` | Warn and skip that key, continue with valid ones |
| Unknown preset in `--preset` | Warn and fall back to `"default"` preset |
