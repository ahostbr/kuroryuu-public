# Kuroryuu Project

This is the Kuroryuu multi-agent orchestration platform. Monorepo with:
- `apps/gateway/` — Python FastAPI (port 8200)
- `apps/desktop/` — Electron desktop app
- `apps/web/` — Next.js web UI (port 3000)
- `ai/` — Harness files (tasks, checkpoints, sessions, prompts)
- `Docs/` — Plans, worklogs, architecture docs

Tasks source of truth: `ai/todo.md`
Development history: `Docs/DEVLOG.md`

For multi-agent orchestration patterns, use the `/k-start` command or read `KURORYUU_BOOTSTRAP.md`.
