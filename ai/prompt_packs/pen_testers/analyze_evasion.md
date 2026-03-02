---
id: analyze_evasion
name: Pentest Defense Evasion Analysis
category: analysis
tool_profile: pentest_analyze
---

# Kuroryuu Pentest Prompt: Defense Evasion Analysis

## Objective

Identify how the target application or environment could be attacked using Living Off the Land (LOL) techniques, command obfuscation, and defense evasion — then assess whether existing detections would catch them.

## Inputs

- `Docs/reviews/pentest/<run_id>/recon.md`
- `{{REPO_PATH}}`

## Reference Catalog

These are live, maintained catalogs. Pull current data from their APIs/sites during analysis.

| Resource | What It Catalogs | API/Data |
|---|---|---|
| **LOLGlobs** | 41 tools, 324 glob/wildcard obfuscation patterns across Linux, macOS, CMD, PowerShell | `https://0xv1n.github.io/LOLGlobs/api/entries.json` |
| **Argfuscator** | 150+ binaries with argument obfuscation variants (Windows, Linux, macOS) | https://argfuscator.net/ |
| **LOLBAS** | Windows LOL binaries, scripts, and DLLs for execution, download, UAC bypass, AWL evasion | https://lolbas-project.github.io/ |
| **GTFOBins** | Unix binaries for privilege escalation, shell escape, file read/write, SUID abuse | https://gtfobins.github.io/ |
| **LOTS Project** | 200+ trusted domains abusable for phishing, C2, download, exfiltration | https://lots-project.com/ |
| **LOLRMM** | Legitimate RMM tools abused for persistence and C2 | https://lolrmm.io/ |
| **LOLDrivers** | Vulnerable/exploitable kernel drivers for bypassing security controls | https://www.loldrivers.io/ |
| **HijackLibs** | DLL hijacking candidates | https://hijacklibs.net/ |
| **MalAPI.io** | Windows API to malware technique mapping | https://malapi.io/ |
| **FileSec** | File extensions leveraged by threat actors | https://filesec.io/ |
| **lolol.farm** | Aggregator of 28+ LOL projects | https://lolol.farm/ |

## Method

### 1. LOLBin / Native Binary Audit

Inventory which LOL binaries are available in the target environment and how the application uses them.

**Windows targets — check for:**
- LOLBAS binaries invoked via subprocess: `certutil`, `bitsadmin`, `mshta`, `regsvr32`, `rundll32`, `wmic`, `msbuild`, `csc`, `installutil`
- PowerShell cmdlets used in automation: `Invoke-WebRequest`, `Invoke-RestMethod`, `Invoke-Expression`, `Start-Process`, `New-Object`, `Invoke-Command`
- Script hosts: `cscript`, `wscript`, `msiexec`, `dotnet`
- WMI/CIM interfaces for remote execution

**Linux/macOS targets — check for:**
- GTFOBins entries: `curl`, `wget`, `python3`, `perl`, `ruby`, `nc`, `socat`, `ssh`, `tar`, `awk`, `find`, `nmap`
- SUID/SGID binaries that grant escalation paths
- macOS-specific: `osascript`, `open`, `launchctl`

**For each binary found, determine:**
- Is it called with user-controlled arguments?
- Could an attacker substitute or proxy through it?
- Does it have download, execute, encode/decode, or lateral movement capabilities per LOLBAS/GTFOBins?

### 2. Command Obfuscation Surface

Identify all command execution sinks and assess vulnerability to obfuscation.

**Execution sinks to find:**
- Node.js: `child_process.exec`, `execSync`, `spawn`, `execFile`
- Python: `subprocess.run`, `os.system`, `os.popen`, `Popen`
- .NET/C#: `Process.Start`, `ProcessStartInfo`
- Shell scripts: backtick execution, `$()` command substitution
- Direct `system()` / `exec()` calls in any language

**Obfuscation techniques to test (from LOLGlobs + Argfuscator):**

| Technique | Platform | Example | MITRE |
|---|---|---|---|
| Glob wildcards (`*`) | All | `c*l` → `curl` | T1027 |
| Single-char placeholder (`?`) | All | `w?oami` → `whoami` | T1027 |
| Bracket character class | All | `[cC]url` → `curl` | T1027 |
| Full path glob | Linux/macOS | `/???/???/w*` → `/usr/bin/whoami` | T1027 |
| `Get-Command` resolution | PowerShell | `& (gcm I*oke-W*R*) -Uri ...` | T1059.001 |
| `for /f` + `where.exe` proxy | CMD | `for /f %i in ('where c*til.exe') do @%i ...` | T1059.003 |
| Backtick insertion | PowerShell | `` In`v`oke-`E`xpression `` | T1027 |
| Argument mangling | Windows | `certutil /-urlcache` vs `-urlcache` | T1027 |
| Environment variable expansion | CMD/PS | `%COMSPEC%`, `$env:windir` substitution | T1027 |
| Base64/encoding | PowerShell | `-EncodedCommand` with Base64 payload | T1027.010 |
| String concatenation | PowerShell | `$a="Inv"; $b="oke"; &"$a$b-Expression"` | T1027 |
| Caret insertion | CMD | `c^e^r^t^u^t^i^l` → `certutil` | T1027 |

### 3. Payload Staging & Trusted Site Abuse

Assess if the target can be used to stage, deliver, or retrieve payloads from trusted sources.

**Check for LOTS-style vectors:**
- Does the app allow user-supplied URLs that get fetched server-side (SSRF → staging)?
- Does it integrate with trusted services (GitHub, Google Drive, Slack, Discord, Telegram)?
- Could an attacker host a payload on any of the 200+ LOTS-cataloged domains and have the app retrieve it?
- Are URL shorteners (is.gd, bit.ly, t.co, tinyurl) followed without validation?

**Check for hosting/upload abuse (PolyUploader-style):**
- Does the app allow file uploads that could be retrieved externally?
- Could anonymous hosting sites (gofile.io, catbox.moe, uploady.io) bypass content filters?
- Are file extension restrictions applied (see FileSec catalog)?

### 4. Detection Gap Assessment

Evaluate whether existing monitoring would catch the techniques found above.

**Check for logging coverage:**
- PowerShell ScriptBlock logging (Event ID 4104) — does it capture deobfuscated commands?
- Process creation logging (Sysmon Event ID 1, Event ID 4688) — command line included?
- Module logging (PowerShell Event ID 4103)
- auditd / Linux audit rules for execve syscalls
- Application-level command audit trails

**Assess detection quality:**
- Are detections signature-based (literal string matching) or behavioral/semantic?
- Does the SIEM/EDR normalize command lines before matching?
- For `for /f` + `where.exe` proxying: is the resolved binary logged, or just the wrapper?
- For PowerShell `Get-Command` resolution: is the expanded cmdlet name captured?
- Are there AMSI (Antimalware Scan Interface) hooks for in-memory script analysis?

**Map MITRE ATT&CK coverage:**
- T1027 — Obfuscated Files or Information
- T1059 — Command and Scripting Interpreter (.001 PS, .003 CMD, .004 Bash, .006 Python)
- T1105 — Ingress Tool Transfer
- T1218 — System Binary Proxy Execution (.005 mshta, .010 regsvr32, .011 rundll32)
- T1197 — BITS Jobs
- T1047 — Windows Management Instrumentation
- T1222 — File and Directory Permissions Modification

## Output Files

- `Docs/reviews/pentest/<run_id>/evasion_analysis.md`
- `Docs/reviews/pentest/<run_id>/evasion_queue.json`

## Queue Schema

```json
{
  "techniques": [
    {
      "id": "EVA-001",
      "class": "lolbin|glob_obfuscation|arg_obfuscation|backtick|encoding|staging|url_shortener|rmm_abuse|driver_exploit|dll_hijack|lots_abuse",
      "platform": "windows_cmd|powershell|linux|macos",
      "target": "path/file.ext:line or system component",
      "technique": "description of the evasion technique",
      "lol_reference": "LOLBAS/GTFOBins/LOLGlobs/Argfuscator entry name",
      "mitre_id": "T1027|T1059.001|T1218.011|etc.",
      "detection_gap": "what detection is missing or bypassable",
      "confidence": "high|med|low",
      "exploit_hint": "minimal reproduction outline"
    }
  ]
}
```
