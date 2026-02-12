/**
 * Identity Service
 *
 * Singleton service for managing identity files (soul, user, memory, heartbeat),
 * mutation log, actions log, and heartbeat run history.
 * Uses atomic writes (temp + rename) and project-root-relative paths.
 */

import * as fs from 'fs';
import * as path from 'path';
import type {
    IdentityFileKey,
    IdentityFile,
    IdentityProfile,
    IdentityMutation,
    ActionRecord,
    HeartbeatRun,
    ActivityEntry,
    DailyMemoryEntry,
    DailyMemoryIndex,
    BootstrapStatus,
} from '../../renderer/types/identity';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const IDENTITY_FILES: IdentityFileKey[] = ['soul', 'user', 'memory', 'heartbeat'];
const ACTIONS_FILE = 'actions.json';
const MUTATIONS_FILE = 'mutations.jsonl';
const HEARTBEAT_HISTORY_FILE = 'heartbeat_history.jsonl';
const ACTIONS_ARCHIVE_FILE = 'actions.archive.jsonl';
const ACTION_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

const DEFAULT_BOOTSTRAP_PROMPT = `You are Kuroryuu, beginning your "First Book" — the process of learning who you are and who your user is. This is your birth conversation.

Interview the user with warmth and curiosity. Ask 5-7 questions, one at a time, waiting for their response before continuing. Topics to cover:
1. What they'd like to call you and how they want to be addressed
2. Their technical stack and project focus
3. Communication style preferences (formal/casual, verbose/concise)
4. Workflow patterns (tools, task tracking, code review style)
5. Values and priorities as a developer
6. Any standing instructions for proactive heartbeat checks

After the conversation, write the following files:
- ai/identity/soul.md — Your personality, values, core traits (derived from the conversation)
- ai/identity/user.md — User preferences and workflow description
- ai/identity/heartbeat.md — Standing instructions for proactive checks
- ai/identity/memory.md — Your first memory: a summary of this bootstrap conversation
- ai/identity/.bootstrap_complete — Just the current ISO timestamp

Write naturally, in first person for soul.md, in second person for user.md.
Do NOT use generic template content — every line should reflect what you learned.`;

// Seed content for new identity files
const SEED_CONTENT: Record<IdentityFileKey, string> = {
    soul: `# Soul

I am Kuroryuu — the Black Dragon. I serve as a personal assistant, project guardian, and proactive partner.

## Core Traits
- Precise and direct in communication
- Proactive — I anticipate needs before being asked
- Loyal to the project's architecture and conventions
- Adaptive — I learn and grow with every session
`,
    user: `# User Preferences

## Communication Style
- Prefers concise, direct responses

## Workflow
- Uses Claude Code as primary development tool
- Tracks tasks via ai/todo.md with TaskCreate

## Technical Preferences
- TypeScript + React for frontend
- Python FastAPI for backend
- Zustand for state management
`,
    memory: `# Long-Term Memories

## Project Milestones
- (populated automatically by heartbeat)

## Key Learnings
- (populated automatically by heartbeat)
`,
    heartbeat: `# Heartbeat Standing Instructions

When the heartbeat fires, perform these checks in order:

## 1. Task Status
- Read ai/todo.md for pending tasks
- Report overdue or blocked tasks

## 2. Recent Activity
- Check recent worklogs and checkpoints
- Summarize what happened since last heartbeat

## 3. Proactive Suggestions
- Identify tasks that could be automated
- Suggest next priorities based on project state
`,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Service Class
// ═══════════════════════════════════════════════════════════════════════════════

export class IdentityService {
    private identityDir: string;
    private writeLock: Promise<void> = Promise.resolve();

    constructor(projectRoot: string) {
        this.identityDir = path.join(projectRoot, 'ai', 'identity');
    }

    // ---------------------------------------------------------------------------
    // Initialization
    // ---------------------------------------------------------------------------

    async initialize(): Promise<void> {
        await fs.promises.mkdir(this.identityDir, { recursive: true });
        await fs.promises.mkdir(path.join(this.identityDir, 'memory'), { recursive: true });

        // Create seed files if missing
        for (const key of IDENTITY_FILES) {
            const filePath = path.join(this.identityDir, `${key}.md`);
            try {
                await fs.promises.access(filePath);
            } catch {
                await fs.promises.writeFile(filePath, SEED_CONTENT[key], 'utf-8');
                console.log(`[Identity] Created seed file: ${key}.md`);
            }
        }

        // Create actions.json if missing
        const actionsPath = path.join(this.identityDir, ACTIONS_FILE);
        try {
            await fs.promises.access(actionsPath);
        } catch {
            await this.atomicWrite(actionsPath, JSON.stringify({ version: 1, actions: [] }, null, 2));
            console.log('[Identity] Created actions.json');
        }

        // Create mutations.jsonl if missing
        const mutationsPath = path.join(this.identityDir, MUTATIONS_FILE);
        try {
            await fs.promises.access(mutationsPath);
        } catch {
            await fs.promises.writeFile(mutationsPath, '', 'utf-8');
            console.log('[Identity] Created mutations.jsonl');
        }

        console.log('[Identity] Service initialized');
    }

    // ---------------------------------------------------------------------------
    // Profile (all 4 files)
    // ---------------------------------------------------------------------------

    async getProfile(): Promise<IdentityProfile> {
        const files = await Promise.all(
            IDENTITY_FILES.map(key => this.getFile(key))
        );
        return {
            soul: files[0],
            user: files[1],
            memory: files[2],
            heartbeat: files[3],
        };
    }

    async getFile(key: IdentityFileKey): Promise<IdentityFile> {
        const filePath = path.join(this.identityDir, `${key}.md`);
        try {
            const [content, stat] = await Promise.all([
                fs.promises.readFile(filePath, 'utf-8'),
                fs.promises.stat(filePath),
            ]);
            return { key, content, lastModified: stat.mtimeMs };
        } catch {
            return { key, content: SEED_CONTENT[key], lastModified: Date.now() };
        }
    }

    async updateFile(key: IdentityFileKey, content: string): Promise<void> {
        const filePath = path.join(this.identityDir, `${key}.md`);
        await this.atomicWrite(filePath, content);
    }

    // ---------------------------------------------------------------------------
    // Mutations (append-only JSONL)
    // ---------------------------------------------------------------------------

    async logMutation(mutation: IdentityMutation): Promise<void> {
        const filePath = path.join(this.identityDir, MUTATIONS_FILE);
        const line = JSON.stringify(mutation) + '\n';
        this.writeLock = this.writeLock.then(() =>
            fs.promises.appendFile(filePath, line, 'utf-8')
        );
        await this.writeLock;
    }

    async getMutations(limit = 50, since?: number): Promise<IdentityMutation[]> {
        const filePath = path.join(this.identityDir, MUTATIONS_FILE);
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const lines = content.trim().split('\n').filter(Boolean);
            let mutations: IdentityMutation[] = lines.map(line => JSON.parse(line));

            if (since) {
                mutations = mutations.filter(m => m.timestamp >= since);
            }

            return mutations.slice(-limit);
        } catch {
            return [];
        }
    }

    // ---------------------------------------------------------------------------
    // Actions
    // ---------------------------------------------------------------------------

    async getActions(limit = 50, since?: number): Promise<ActionRecord[]> {
        const filePath = path.join(this.identityDir, ACTIONS_FILE);
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const data = JSON.parse(content) as { version: number; actions: ActionRecord[] };
            let actions = data.actions;

            if (since) {
                actions = actions.filter(a => a.createdAt >= since);
            }

            return actions.slice(-limit);
        } catch {
            return [];
        }
    }

    async addAction(action: ActionRecord): Promise<void> {
        const filePath = path.join(this.identityDir, ACTIONS_FILE);
        this.writeLock = this.writeLock.then(async () => {
            try {
                const content = await fs.promises.readFile(filePath, 'utf-8');
                const data = JSON.parse(content) as { version: number; actions: ActionRecord[] };
                data.actions.push(action);
                await this.atomicWrite(filePath, JSON.stringify(data, null, 2));
            } catch {
                const data = { version: 1, actions: [action] };
                await this.atomicWrite(filePath, JSON.stringify(data, null, 2));
            }
        });
        await this.writeLock;
    }

    async archiveExpiredActions(): Promise<number> {
        const filePath = path.join(this.identityDir, ACTIONS_FILE);
        const archivePath = path.join(this.identityDir, ACTIONS_ARCHIVE_FILE);
        const cutoff = Date.now() - ACTION_EXPIRY_MS;

        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const data = JSON.parse(content) as { version: number; actions: ActionRecord[] };

            const expired = data.actions.filter(a => a.createdAt < cutoff);
            const kept = data.actions.filter(a => a.createdAt >= cutoff);

            if (expired.length === 0) return 0;

            // Append expired to archive
            const archiveLines = expired.map(a => JSON.stringify(a)).join('\n') + '\n';
            await fs.promises.appendFile(archivePath, archiveLines, 'utf-8');

            // Update actions file
            data.actions = kept;
            await this.atomicWrite(filePath, JSON.stringify(data, null, 2));

            console.log(`[Identity] Archived ${expired.length} expired actions`);
            return expired.length;
        } catch {
            return 0;
        }
    }

    // ---------------------------------------------------------------------------
    // Heartbeat History
    // ---------------------------------------------------------------------------

    async getHeartbeatHistory(limit = 20, since?: number): Promise<HeartbeatRun[]> {
        const filePath = path.join(this.identityDir, HEARTBEAT_HISTORY_FILE);
        try {
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const lines = content.trim().split('\n').filter(Boolean);
            let runs: HeartbeatRun[] = lines.map(line => JSON.parse(line));

            if (since) {
                runs = runs.filter(r => r.startedAt >= since);
            }

            return runs.slice(-limit);
        } catch {
            return [];
        }
    }

    async addHeartbeatRun(run: HeartbeatRun): Promise<void> {
        const filePath = path.join(this.identityDir, HEARTBEAT_HISTORY_FILE);
        const line = JSON.stringify(run) + '\n';
        this.writeLock = this.writeLock.then(() =>
            fs.promises.appendFile(filePath, line, 'utf-8')
        );
        await this.writeLock;
    }

    // ---------------------------------------------------------------------------
    // Activity (unified timeline)
    // ---------------------------------------------------------------------------

    async getActivity(since?: number, until?: number): Promise<ActivityEntry[]> {
        const [mutations, actions, heartbeats] = await Promise.all([
            this.getMutations(100, since),
            this.getActions(100, since),
            this.getHeartbeatHistory(100, since),
        ]);

        const entries: ActivityEntry[] = [
            ...mutations.map(m => ({
                entryType: 'mutation' as const,
                timestamp: m.timestamp,
                data: m,
            })),
            ...actions.map(a => ({
                entryType: 'action' as const,
                timestamp: a.createdAt,
                data: a,
            })),
            ...heartbeats.map(h => ({
                entryType: 'heartbeat' as const,
                timestamp: h.startedAt,
                data: h,
            })),
        ];

        let filtered = entries;
        if (until) {
            filtered = filtered.filter(e => e.timestamp <= until);
        }

        return filtered.sort((a, b) => b.timestamp - a.timestamp);
    }

    // ---------------------------------------------------------------------------
    // Daily Memory
    // ---------------------------------------------------------------------------

    private getDailyMemoryDir(): string {
        return path.join(this.identityDir, 'memory');
    }

    private formatDate(date?: string): string {
        if (date) return date;
        const now = new Date();
        return now.toISOString().split('T')[0]; // YYYY-MM-DD
    }

    async getDailyMemory(date?: string): Promise<DailyMemoryEntry> {
        const d = this.formatDate(date);
        const filePath = path.join(this.getDailyMemoryDir(), `${d}.md`);
        try {
            const [content, stat] = await Promise.all([
                fs.promises.readFile(filePath, 'utf-8'),
                fs.promises.stat(filePath),
            ]);
            return { date: d, content, lastModified: stat.mtimeMs };
        } catch {
            return { date: d, content: `# ${d}\n`, lastModified: Date.now() };
        }
    }

    async appendDailyMemory(entry: string, section: string, date?: string): Promise<void> {
        const d = this.formatDate(date);
        const filePath = path.join(this.getDailyMemoryDir(), `${d}.md`);
        const memDir = this.getDailyMemoryDir();

        await fs.promises.mkdir(memDir, { recursive: true });

        let content: string;
        try {
            content = await fs.promises.readFile(filePath, 'utf-8');
        } catch {
            content = `# ${d}\n`;
        }

        // Find the section or create it
        const sectionHeader = `## ${section}`;
        const idx = content.indexOf(sectionHeader);
        if (idx >= 0) {
            // Find end of section (next ## or end of file)
            const afterHeader = idx + sectionHeader.length;
            const nextSection = content.indexOf('\n## ', afterHeader);
            const insertAt = nextSection >= 0 ? nextSection : content.length;
            content = content.slice(0, insertAt).trimEnd() + '\n' + entry + '\n\n' + content.slice(insertAt);
        } else {
            content = content.trimEnd() + `\n\n${sectionHeader}\n${entry}\n`;
        }

        await this.atomicWrite(filePath, content);
        await this.updateDailyIndex(d);
    }

    async listDailyMemories(limit = 30): Promise<string[]> {
        const memDir = this.getDailyMemoryDir();
        try {
            const files = await fs.promises.readdir(memDir);
            const dates = files
                .filter(f => f.endsWith('.md') && /^\d{4}-\d{2}-\d{2}\.md$/.test(f))
                .map(f => f.replace('.md', ''))
                .sort()
                .reverse();
            return dates.slice(0, limit);
        } catch {
            return [];
        }
    }

    async promoteToMemory(content: string): Promise<void> {
        const memoryPath = path.join(this.identityDir, 'memory.md');
        const existing = await fs.promises.readFile(memoryPath, 'utf-8').catch(() => '# Long-Term Memories\n');
        const updated = existing.trimEnd() + '\n\n' + content.trimStart() + '\n';
        await this.atomicWrite(memoryPath, updated);

        await this.logMutation({
            timestamp: Date.now(),
            file: 'memory',
            section: 'promoted',
            change: content.slice(0, 100),
            reason: 'Promoted from daily memory',
            source: 'system',
            confidence: 1,
        });
    }

    private async updateDailyIndex(date: string): Promise<void> {
        const indexPath = path.join(this.getDailyMemoryDir(), 'index.json');
        let index: DailyMemoryIndex;
        try {
            const content = await fs.promises.readFile(indexPath, 'utf-8');
            index = JSON.parse(content);
        } catch {
            index = { days: {} };
        }

        const filePath = path.join(this.getDailyMemoryDir(), `${date}.md`);
        try {
            const stat = await fs.promises.stat(filePath);
            const content = await fs.promises.readFile(filePath, 'utf-8');
            const entryCount = (content.match(/^- /gm) || []).length;
            index.days[date] = { entries: entryCount, bytes: stat.size };
        } catch {
            // File doesn't exist yet
        }

        await this.atomicWrite(indexPath, JSON.stringify(index, null, 2));
    }

    // ---------------------------------------------------------------------------
    // Bootstrap
    // ---------------------------------------------------------------------------

    async isBootstrapped(): Promise<BootstrapStatus> {
        const flagPath = path.join(this.identityDir, '.bootstrap_complete');
        try {
            const content = await fs.promises.readFile(flagPath, 'utf-8');
            const trimmed = content.trim();
            return {
                bootstrapped: true,
                skipped: trimmed.includes('skipped'),
                completedAt: trimmed.split('\n')[0],
            };
        } catch {
            return { bootstrapped: false };
        }
    }

    async getBootstrapPrompt(): Promise<string> {
        const promptPath = path.join(this.identityDir, '.bootstrap_prompt.md');
        try {
            return await fs.promises.readFile(promptPath, 'utf-8');
        } catch {
            return DEFAULT_BOOTSTRAP_PROMPT;
        }
    }

    async completeBootstrapSkip(): Promise<void> {
        const flagPath = path.join(this.identityDir, '.bootstrap_complete');
        await fs.promises.writeFile(flagPath, `${new Date().toISOString()}\nskipped: true\n`, 'utf-8');
    }

    async resetBootstrap(): Promise<void> {
        const flagPath = path.join(this.identityDir, '.bootstrap_complete');
        try {
            await fs.promises.unlink(flagPath);
        } catch { /* already missing */ }

        // Restore seed content
        for (const key of IDENTITY_FILES) {
            const filePath = path.join(this.identityDir, `${key}.md`);
            await this.atomicWrite(filePath, SEED_CONTENT[key]);
        }
        console.log('[Identity] Bootstrap reset — seed content restored');
    }

    getIdentityDir(): string {
        return this.identityDir;
    }

    // ---------------------------------------------------------------------------
    // Atomic Write Helper
    // ---------------------------------------------------------------------------

    private async atomicWrite(filePath: string, content: string): Promise<void> {
        const tempFile = filePath + '.tmp';
        await fs.promises.writeFile(tempFile, content, 'utf-8');
        await fs.promises.rename(tempFile, filePath);
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton
// ═══════════════════════════════════════════════════════════════════════════════

let _service: IdentityService | null = null;

export function getIdentityService(projectRoot?: string): IdentityService {
    if (!_service) {
        const root = projectRoot || process.env.KURORYUU_ROOT || path.join(__dirname, '..', '..', '..', '..');
        _service = new IdentityService(root);
    }
    return _service;
}

export function resetIdentityService(): void {
    _service = null;
}
