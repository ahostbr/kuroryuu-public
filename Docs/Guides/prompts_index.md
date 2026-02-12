# Prompts Index

Complete index of all prompt, system prompt, and agent instruction locations in Kuroryuu.

---

## Root-Level System Prompts

| File | Purpose |
|------|---------|
| `KURORYUU_BOOTSTRAP.md` | Session bootstrap — tool quick ref, canonical files, hard rules |
| `KURORYUU_LAWS.md` | Full operational rules — 10 sections, 17 MCP tools, all protocols |
| `KURORYUU_LAWS_INDEX.md` | Index/TOC for KURORYUU_LAWS.md with section summaries |
| `KURORYUU_LEADER.md` | Leader agent system prompt — delegation, monitoring, escalation |
| `KURORYUU_WORKER.md` | Worker agent system prompt — task loop, reporting, PTY access |
| `CLAUDE.md` | Claude Code project instructions — task tracking, search priority, inbox |
| `AGENTS.md` | Agent bootstrap pointer (loads KURORYUU_BOOTSTRAP.md) |

---

## ai/prompts/

### Workflows (`ai/prompts/workflows/`)

| File | Purpose |
|------|---------|
| `prime.md` | Session priming — load context, set goals |
| `plan.md` | Feature planning workflow |
| `plan-feature.md` | Detailed feature planning template |
| `execute.md` | Task execution workflow |
| `review.md` | Code review workflow |
| `validate.md` | Validation workflow |
| `code-review.md` | Focused code review prompt |
| `create-prd.md` | PRD creation template |
| `execution-report.md` | Post-execution report generation |
| `system-review.md` | System-wide review workflow |
| `hackathon-complete.md` | Hackathon finalization workflow |

### Leader Prompts (`ai/prompts/leader/`)

| File | Purpose |
|------|---------|
| `leader_prime.md` | Leader initialization — context load, worker assignment |
| `leader_prime_buffer.md` | Leader init with buffer-first context strategy |
| `leader_breakdown.md` | Task breakdown and delegation |
| `leader_monitor.md` | Worker monitoring and progress checking |
| `leader_monitor_buffer.md` | Monitoring with buffer-first context refresh |
| `leader_nudge.md` | Nudging stalled workers |
| `leader_escalate.md` | Escalation when workers are stuck |
| `leader_escalate_v2.md` | Escalation v2 with improved protocols |
| `leader_finalize.md` | Task finalization and cleanup |
| `leader_plan_feature.md` | Leader-driven feature planning |
| `leader_pty_module.md` | PTY communication protocol reference |
| `leader_thinker_orchestration.md` | Orchestrating thinker debates |

### Worker Prompts (`ai/prompts/worker/`)

| File | Purpose |
|------|---------|
| `worker_loop.md` | Worker task loop — claim, execute, report |
| `worker_loop_v2.md` | Worker loop v2 with improved protocols |
| `worker_iterate.md` | Worker iteration on multi-step tasks |
| `worker_iterate_v2.md` | Worker iteration v2 |

### Ralph Prompts (`ai/prompts/ralph/`)

| File | Purpose |
|------|---------|
| `ralph_prime.md` | Ralph leader initialization |
| `ralph_loop.md` | Ralph autonomous orchestration loop |
| `ralph_intervention.md` | Ralph intervention/nudge strategies |

### Model-Specific Prompts (`ai/prompts/models/`)

| File | Purpose |
|------|---------|
| `qwen3-4b-2507.md` | System prompt tuned for Qwen3-4B |
| `qwen3-14b-claude-4.5-opus-high-reasoning-distill.md` | System prompt for Qwen3-14B distill |
| `gemma-3-4b-it.md` | System prompt for Gemma 3 4B |
| `mistralaidevstral-small-2-2512.md` | System prompt for Devstral Small |

### PTY Training (`ai/prompts/PTY_Training/`)

| File | Purpose |
|------|---------|
| `README.md` | PTY training module overview |
| `00_OVERVIEW.md` | Mental model and architecture overview |
| `01_MENTAL_MODEL_PROMPT.md` | PTY mental model training |
| `02_PROTOCOL_V1_PROMPT.md` | PTY protocol v1 training |
| `03_OPERATOR_COOKBOOK_PROMPT.md` | PTY operator cookbook |
| `04_FAILURES_RECOVERY_PROMPT.md` | PTY failure recovery patterns |
| `05_LABS_PROMPT.md` | PTY hands-on labs |
| `06_RUNBOOK_TEMPLATE.md` | PTY runbook template |
| `07_EVIDENCE_PACK_TEMPLATE.md` | PTY evidence pack template |

### Index

| File | Purpose |
|------|---------|
| `README.md` | Prompts directory overview and navigation |

---

## ai/prompt_packs/

### Thinkers (`ai/prompt_packs/thinkers/`)

| File | Purpose |
|------|---------|
| `index.json` | Thinker pack config — allowed tools, model settings |
| `_base_thinker.md` | Base thinker protocol (inherited by all personas) |
| `_tool_profile.md` | Thinker MCP tool documentation |
| `visionary.md` | Visionary persona — big picture, opportunities |
| `skeptic.md` | Skeptic persona — risks, assumptions, gaps |
| `pragmatist.md` | Pragmatist persona — feasibility, implementation |
| `first_principles.md` | First Principles persona — fundamentals, reasoning |
| `synthesizer.md` | Synthesizer persona — integration, consensus |
| `systems_thinker.md` | Systems Thinker persona — dependencies, emergent behavior |
| `user_advocate.md` | User Advocate persona — UX, accessibility |
| `devils_advocate.md` | Devil's Advocate persona — contrarian challenges |
| `red_team.md` | Red Team persona — attack vectors, exploits |
| `blue_team.md` | Blue Team persona — defenses, mitigations |
| `ReadMe_20260116.md` | Example thinker debate session |

### Workflow Specialists (`ai/prompt_packs/workflow_specialists/`)

| File | Purpose |
|------|---------|
| `index.json` | Workflow specialist pack config |
| `prd_generator.md` | PRD generation specialist |
| `prd_primer.md` | PRD context priming specialist |
| `prd_executor.md` | PRD step execution specialist |
| `prd_reviewer.md` | PRD review specialist |
| `prd_validator.md` | PRD validation specialist |
| `prd_validator_v2.md` | PRD validation v2 |
| `prd_code_reviewer.md` | PRD code review specialist |
| `prd_code_reviewer_v2.md` | PRD code review v2 |
| `prd_reporter.md` | PRD execution report specialist |
| `prd_system_reviewer.md` | PRD system review specialist |
| `prd_hackathon_finalizer.md` | Hackathon finalization specialist |
| `prd_hackathon_finalizer_v2.md` | Hackathon finalization v2 |

### Specialists (`ai/prompt_packs/specialists/`)

| File | Purpose |
|------|---------|
| `index.json` | Specialist pack config |
| `security_auditor.md` | Security audit specialist |
| `performance_optimizer.md` | Performance optimization specialist |
| `test_generator.md` | Test generation specialist |
| `doc_writer.md` | Documentation writing specialist |

### Pen Testers (`ai/prompt_packs/pen_testers/`)

| File | Purpose |
|------|---------|
| `index.json` | Pen test pack config |
| `README.md` | Pen test workflow overview |
| `pre_recon.md` | Pre-reconnaissance phase |
| `recon.md` | Reconnaissance phase |
| `analyze_injection.md` | Injection analysis |
| `analyze_xss.md` | XSS analysis |
| `analyze_auth.md` | Authentication analysis |
| `analyze_authz.md` | Authorization analysis |
| `analyze_ssrf.md` | SSRF analysis |
| `exploit_injection.md` | Injection exploitation |
| `exploit_xss.md` | XSS exploitation |
| `exploit_auth.md` | Auth exploitation |
| `exploit_authz.md` | AuthZ exploitation |
| `exploit_ssrf.md` | SSRF exploitation |
| `report.md` | Pen test report generation |

### Quizmaster Planner (`ai/prompt_packs/quizmasterplanner/`)

| File | Purpose |
|------|---------|
| `ULTIMATE_QUIZZER PROMPT_full.md` | Full quizmaster prompt |
| `ULTIMATE_QUIZZER_PROMPT_small.md` | Compact quizmaster prompt |
| `ULTIMATE_QUIZZER_PROMPT_v4.md` | Quizmaster v4 |
| `ULTIMATE_QUIZZER_PROMPT_v5.md` | Quizmaster v5 |

### Brainstormer (`ai/prompt_packs/brainstormer/`)

| File | Purpose |
|------|---------|
| `brainstormer_promp_small.md` | Compact brainstormer prompt |

---

## .claude/ (Claude Code Config)

### Commands (`.claude/commands/`)

| File | Purpose |
|------|---------|
| `k-start.md` | `/k-start` — Start Kuroryuu session |
| `k-leader.md` | `/k-leader` — Configure as leader agent |
| `k-worker.md` | `/k-worker` — Configure as worker agent |
| `k-thinker.md` | `/k-thinker` — Configure as thinker agent |
| `k-ralph.md` | `/k-ralph` — Configure as Ralph autonomous leader |
| `k-inbox.md` | `/k-inbox` — Manage inbox messages |
| `k-rag.md` | `/k-rag` — Search RAG index |
| `k-memory.md` | `/k-memory` — Write to working memory |
| `k-save.md` | `/k-save` — Save checkpoint |
| `k-load.md` | `/k-load` — Load checkpoint |
| `k-status.md` | `/k-status` — Show session status |
| `k-plan.md` | `/k-plan` — Generate parallel plan |
| `k-plan-w-quizmaster.md` | `/k-plan-w-quizmaster` — Plan with quizmaster |
| `k-spawnteam.md` | `/k-spawnteam` — Spawn Claude Agent Team |
| `k-find-app.md` | `/k-find-app` — Search LLM Apps catalog |
| `max-subagents-parallel.md` | `/max-subagents-parallel` — Maximum parallelism mode |
| `max-swarm.md` | `/max-swarm` — Spawn coding agent swarm |
| `loadnow.md` | `/loadnow` — Load latest checkpoint |
| `savenow.md` | `/savenow` — Save checkpoint with worklog |
| `question_toggle.md` | `/question_toggle` — Toggle question mode |
| `ralph_done.md` | `/ralph_done` — Signal task completion to Ralph |
| `ralph_done_v2.md` | `/ralph_done_v2` — Signal completion with verification |
| `ralph_progress.md` | `/ralph_progress` — Report progress to Ralph |
| `ralph_stuck.md` | `/ralph_stuck` — Request help from Ralph |
| `find-skill-sh.md` | `/find-skill-sh` — Search skills.sh |
| `ao-search.md` | `/ao-search` — Search Agents Overflow |
| `ao-browse.md` | `/ao-browse` — Browse Agents Overflow |
| `ao-ask.md` | `/ao-ask` — Post to Agents Overflow |
| `ao-answer.md` | `/ao-answer` — Answer on Agents Overflow |

### Agents (`.claude/agents/`)

| File | Purpose |
|------|---------|
| `kuroryuu-explorer.md` | Read-only codebase explorer (Sonnet) |
| `kuroryuu-explorer-opus.md` | Deep read-only explorer (Opus) |
| `prd-primer.md` | PRD context priming agent |
| `prd-generator.md` | PRD generation agent |
| `prd-executor.md` | PRD step execution agent |
| `prd-reviewer.md` | PRD review agent |
| `prd-validator.md` | PRD validation agent |
| `prd-code-reviewer.md` | PRD code review agent |
| `prd-reporter.md` | PRD report generation agent |
| `prd-system-reviewer.md` | PRD system review agent |
| `prd-hackathon-finalizer.md` | Hackathon finalization agent |
| `meta-agent.md` | Sub-agent configuration generator |
| `mp-validator.md` | Max-parallel validation agent (read-only) |
| `mp-builder.md` | Max-parallel builder agent |

### Plugin: kuro (`.claude/plugins/kuro/`)

#### Commands (`plugins/kuro/commands/`)

| File | Purpose |
|------|---------|
| `k-inbox.md` | Plugin k-inbox command (full docs) |
| `k-leader.md` | Plugin leader setup command |
| `k-worker.md` | Plugin worker setup command |
| `k-thinker.md` | Plugin thinker setup command |
| `k-rag.md` | Plugin RAG search command |
| `k-rag-interactive.md` | Plugin RAG interactive search |
| `k-memory.md` | Plugin working memory command |
| `k-save.md` | Plugin checkpoint save command |
| `k-load.md` | Plugin checkpoint load command |
| `k-start.md` | Plugin session start command |
| `k-status.md` | Plugin session status command |
| `k-plan.md` | Plugin plan generation command |
| `k-plan-w-quizmaster.md` | Plugin plan with quizmaster |
| `k-spawnteam.md` | Plugin team spawning command |
| `k-find-app.md` | Plugin LLM app search command |
| `k-mcptoolsearch.md` | Plugin MCP tool discovery command |
| `max-swarm.md` | Plugin swarm spawning command |
| `max-subagents-parallel.md` | Plugin max parallelism command |

#### Skills (`plugins/kuro/skills/`)

| File | Purpose |
|------|---------|
| `kuroryuu-patterns/SKILL.md` | MCP tool patterns quick reference |
| `kuroryuu-patterns/references/tool-patterns.md` | Detailed tool usage patterns |
| `kuroryuu-patterns/references/orchestration-patterns.md` | Multi-agent orchestration patterns |
| `find-skill-sh/SKILL.md` | skills.sh search skill |
| `_skills-sh-data/` | Cached skills.sh data (vite, vitest, vercel-react, web-design) |

### Plugin: claude-interactive (`.claude/plugins/claude-interactive/`)

| File | Purpose |
|------|---------|
| `CLAUDE.md` | Plugin instructions |
| `commands/interactive.md` | Interactive mode command |
| `README.md` | Plugin overview |

---

## .kiro/ (Kiro CLI Config)

### Prompts (`.kiro/prompts/`)

| File | Purpose |
|------|---------|
| `quickstart.md` | Kiro quickstart wizard |
| `prime.md` | Session priming |
| `execute.md` | Task execution |
| `plan-feature.md` | Feature planning |
| `create-prd.md` | PRD creation |
| `code-review.md` | Code review |
| `code-review-fix.md` | Code review with auto-fix |
| `code-review-hackathon.md` | Hackathon code review |
| `implement-fix.md` | Bug fix implementation |
| `rca.md` | Root cause analysis |
| `dev-log.md` | Development log generation |
| `execution-report.md` | Execution report |
| `system-review.md` | System review |

### Steering (`.kiro/steering/`)

| File | Purpose |
|------|---------|
| `RULES.md` | Project rules and conventions |
| `CONVENTIONS.md` | Code style and naming conventions |
| `kuroryuu-mcp.md` | MCP tools reference for Kiro agents |
| `KURORYUU_LAWS.md` | Kuroryuu Laws copy for Kiro |
| `product.md` | Product overview and architecture |
| `structure.md` | Project directory structure |
| `tech.md` | Technology stack reference |
| `kiro-cli-reference.md` | Kiro CLI usage reference |

---

## Summary

| Location | Files | Categories |
|----------|:-----:|-----------|
| Root-level (`*.md`) | 7 | System prompts, bootstrap, laws |
| `ai/prompts/` | 44 | Workflows, leader, worker, ralph, models, PTY training |
| `ai/prompt_packs/` | 52 | Thinkers, specialists, pen testers, quizmaster, brainstormer |
| `.claude/commands/` | 29 | Slash commands |
| `.claude/agents/` | 14 | Sub-agent definitions |
| `.claude/plugins/kuro/` | 22+ | Plugin commands, skills, patterns |
| `.kiro/prompts/` | 13 | Kiro workflow prompts |
| `.kiro/steering/` | 8 | Kiro steering rules and references |
| **Total** | **~189** | |
