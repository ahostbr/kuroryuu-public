# PRD: a new agent cli

**ID:** PRD_20260123_230815_a-new-agent-cli
**Status:** Draft
**Scope:** epic
**Created:** 2026-01-23 23:08
**Author:** LMStudio (mistralai/devstral-small-2-2512)

---

# Product Requirements Document (PRD)
**Title:** New Agent CLI with Custom Harness Support
**Scope:** Epic
**Date:** [Insert Date]

---

## 1. Overview

### Problem Statement
The current agent system lacks a flexible CLI interface for integrating custom harnesses, limiting extensibility and automation capabilities. Users (developers, DevOps engineers) cannot easily extend the agent’s functionality with custom tools or workflows, which hinders adoption in complex environments.

**Affected Stakeholders:**
- Developers integrating third-party tools
- DevOps teams automating workflows
- Security teams requiring custom security checks

### Proposed Solution
Introduce a new Agent CLI that:
1. Supports dynamic harness registration via configuration
2. Integrates with existing `MCP_CORE_URL` and `GATEWAY_URL` endpoints (per codebase analysis)
3. Maintains compatibility with current `SCANNABLE_EXTENSIONS` and `SKIP_PATTERNS` security policies

### Success Metrics
- **Quantitative:**
  - 80% of new harness requests handled via CLI within first 3 months
  - 95% reduction in manual integration time for custom tools
- **Qualitative:**
  - Positive feedback from DevOps teams on extensibility
  - Reduced support tickets related to tool integration

### Out of Scope
- UI/UX changes to existing desktop app (`WINDOW_WIDTH`, `WINDOW_HEIGHT` components)
- Authentication flow modifications (e.g., `GITHUB_CLIENT_ID` OAuth setup)
- Core security scanner logic (`SCANNABLE_EXTENSIONS`/`SKIP_PATTERNS`)

---

## 2. Requirements

### P0 (Must Have)
1. **CLI Command Structure**
   - `agent-cli harness add [name] --url <MCP_URL> --config <path>`
   - Validate against existing `/v1/backends` and `/v1/tools` endpoints.
   - Reference: `apps/desktop/src/main/index.ts` (where `GATEWAY_URL` is defined).

2. **Harness Registration**
   - Register custom harnesses via `POST /v1/harness` endpoint (new).
   - Support for async health checks (`GET /v1/health`).

3. **Security Compliance**
   - Enforce `SCANNABLE_EXTENSIONS` rules during harness registration.
   - Log violations to existing security scanner (`apps/desktop/src/main/security-scanner.ts`).

4. **Configuration Management**
   - Store harness configs in `~/.agent-cli/config.json`.
   - Support environment variables for `MCP_CORE_URL` and `GATEWAY_URL`.

### P1 (Should Have)
1. **Interactive Mode**
   - Guide users through harness setup (e.g., "What is your tool’s purpose?").
   - Reference existing prompts in `/v1/harness/dashboard/markdown`.

2. **Health Dashboard**
   - Add CLI command `agent-cli harness status` to fetch `/v1/harness/dashboard/progress-bar`.
   - Use existing progress bar component logic.

### P2 (Nice to Have)
1. **Template System**
   - Predefined templates for common harnesses (e.g., security scanners, CI/CD hooks).
2. **Plugin Marketplace**
   - Integrate with a hypothetical `/v1/marketplace` endpoint (future).

---

## 3. User Stories

### Story 1: Register a Custom Harness
**As a** DevOps engineer,
**I want** to register a custom harness for my CI/CD tool via CLI,
**So that** I can automate security checks without modifying core code.

**Acceptance Criteria:**
- [ ] CLI command `agent-cli harness add ci-security --url http://ci.example.com` succeeds.
- [ ] Harness appears in `/v1/backends` response.
- [ ] Security scanner (`SCANNABLE_EXTENSIONS`) validates the tool’s permissions.

### Story 2: Monitor Harness Health
**As a** security analyst,
**I want** to check the health of all registered harnesses daily,
**So that** I can proactively address failures.

**Acceptance Criteria:**
- [ ] `agent-cli harness status` displays progress bars from `/v1/harness/dashboard/progress-bar`.
- [ ] Output matches existing markdown dashboard format (`GET /v1/harness/dashboard/markdown`).

---

## 4. Implementation Plan

### Phase 1: Foundation
**Files to Create/Modify:**
1. `apps/cli/package.json` (new npm package)
2. `apps/cli/src/index.ts` (CLI entry point, reference `AGENT_ROLES` from `agent-orchestrator.ts`)
3. Update `README.md` with TODO link to this PRD.

### Phase 2: Core Functionality
**Files to Create/Modify:**
1. `apps/cli/src/commands/harness.ts`
   - Implement `add`, `remove`, `list` subcommands.
   - Call existing `/v1/tools` and new `/v1/harness` endpoints.
2. Modify `apps/desktop/src/main/index.ts` to expose CLI config via environment variables.

### Phase 3: Integration
- Test with `GET /proxy` endpoint for proxy validation.
- Ensure compatibility with `python_count=6` dependencies (if harness uses Python tools).

### Phase 4: Documentation
1. Add docs in `.kiro/documentation/docs_cli_enterprise_monitor-and-track_prompt-logging.md`.
2. Update TODO lists in `Docs/Plans/TODO_REMAINING.md`.

---

## 5. Technical Specification (Requested)

### Architecture
**Data Flow:**
```
User → CLI → [Auth] → GATEWAY_URL → MCP_CORE_URL → Harness Backend
```
- Reuse existing OAuth flow (`setup-github-oauth.js`) for auth.

### API Endpoints
| Method | Endpoint          | Request Body                          | Response                     |
|--------|-------------------|--------------------------------------|------------------------------|
| POST   | `/v1/harness`     | `{name: string, url: string, config: object}` | `201 Created` or error       |
| GET    | `/v1/harness/{id}` | -                                    | Harness status               |

### Dependencies
- **Internal:**
  - `GATEWAY_URL`, `MCP_CORE_URL` (from `index.ts`)
  - Security scanner (`SCANNABLE_EXTENSIONS`)
- **External:**
  - Node.js v18+ (for CLI)
  - Existing npm dependencies (count: 45)

---

## 6. Acceptance Criteria (Requested)
- [ ] Functional tests pass for all P0 requirements.
- [ ] Security review confirms no bypass of `SKIP_PATTERNS`.
- [ ] Documentation updated in `.kiro/documentation`.

---

## 7. Risks & Mitigations
| Risk                          | Likelihood | Impact | Mitigation                          |
|-------------------------------|------------|--------|-------------------------------------|
| Breaking existing `/v1/health` endpoint | Medium    | High   | Mock tests before deployment        |
| Security misconfiguration     | High      | High   | Enforce `SCANNABLE_EXTENSIONS` checks |

---

## 8. Dependencies
- **Blocking:**
  - Completion of Phase B (referenced in TODO files).
- **Internal:**
  - Desktop app’s `GATEWAY_URL` must be stable.
  - OAuth setup (`GITHUB_CLIENT_ID`) for auth.

---
**Formatting:** Markdown with code blocks, bullet points, and emphasis as specified. Tone: Authoritative yet collaborative.
