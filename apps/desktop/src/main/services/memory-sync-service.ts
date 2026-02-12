/**
 * Memory Sync Service
 *
 * One-way sync: Claude's auto-memory (MEMORY.md) → Kuroryuu's daily memory.
 * Reads Claude's MEMORY.md, diffs against stored snapshot, appends new content
 * to today's daily memory tagged [claude-auto].
 */

import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import * as crypto from 'crypto';
import { getIdentityService } from './identity-service';
import type { MemorySyncStatus } from '../../renderer/types/identity';

// ═══════════════════════════════════════════════════════════════════════════════
// Constants
// ═══════════════════════════════════════════════════════════════════════════════

const HASH_FILE = '.claude_memory_hash';
const SNAPSHOT_FILE = '.claude_memory_snapshot';

// ═══════════════════════════════════════════════════════════════════════════════
// Service
// ═══════════════════════════════════════════════════════════════════════════════

export class MemorySyncService {
    private identityDir: string;

    constructor() {
        this.identityDir = getIdentityService().getIdentityDir();
    }

    /**
     * Resolve the path to Claude's MEMORY.md for this project.
     * Reuses the same logic from main/index.ts (lines 1510-1541).
     */
    private resolveClaudeMemoryPath(): string | null {
        const projectPath = path.resolve(this.identityDir, '..', '..');
        const projectsDir = path.join(os.homedir(), '.claude', 'projects');

        // Compute hash: replace all \ / : with dashes, strip leading dash
        const hash = projectPath.replace(/[\\/:]/g, '-').replace(/^-/, '');
        let memDir = path.join(projectsDir, hash, 'memory');

        // If computed hash doesn't exist, scan for matching directory
        if (!fs.existsSync(memDir) && fs.existsSync(projectsDir)) {
            try {
                const dirs = fs.readdirSync(projectsDir);
                const projectName = path.basename(projectPath);
                const match = dirs.find(d =>
                    d.endsWith(projectName) && fs.existsSync(path.join(projectsDir, d, 'memory'))
                );
                if (match) {
                    memDir = path.join(projectsDir, match, 'memory');
                }
            } catch { /* ignore */ }
        }

        const memoryFile = path.join(memDir, 'MEMORY.md');
        return fs.existsSync(memoryFile) ? memoryFile : null;
    }

    async syncFromClaude(): Promise<{ sectionsImported: number }> {
        const memoryPath = this.resolveClaudeMemoryPath();
        if (!memoryPath) {
            return { sectionsImported: 0 };
        }

        const currentContent = await fs.promises.readFile(memoryPath, 'utf-8');
        const currentHash = crypto.createHash('sha256').update(currentContent).digest('hex');

        // Load previous state
        const hashPath = path.join(this.identityDir, HASH_FILE);
        const snapshotPath = path.join(this.identityDir, SNAPSHOT_FILE);

        let previousHash = '';
        try {
            previousHash = (await fs.promises.readFile(hashPath, 'utf-8')).trim();
        } catch { /* first sync */ }

        if (currentHash === previousHash) {
            return { sectionsImported: 0 };
        }

        // Load previous snapshot for diffing
        let previousContent = '';
        try {
            previousContent = await fs.promises.readFile(snapshotPath, 'utf-8');
        } catch { /* first sync — treat everything as new */ }

        // Diff: find new lines
        const previousLines = new Set(previousContent.split('\n'));
        const currentLines = currentContent.split('\n');
        const newLines = currentLines.filter(line => !previousLines.has(line) && line.trim().length > 0);

        if (newLines.length > 0) {
            const identityService = getIdentityService();
            const importText = `- [claude-auto] ${newLines.length} new lines synced from Claude MEMORY.md`;
            await identityService.appendDailyMemory(importText, 'Claude Memory Sync');

            // Also log the actual new content (truncated)
            const contentPreview = newLines.slice(0, 20).join('\n');
            if (contentPreview.trim()) {
                await identityService.appendDailyMemory(contentPreview, 'Claude Memory Sync');
            }

            // Log mutation
            await identityService.logMutation({
                timestamp: Date.now(),
                file: 'memory',
                section: 'Claude Memory Sync',
                change: `Imported ${newLines.length} new lines from Claude MEMORY.md`,
                reason: 'Automated Claude Memory sync',
                source: 'system',
                confidence: 1,
            });
        }

        // Save current state
        await fs.promises.writeFile(hashPath, currentHash, 'utf-8');
        await fs.promises.writeFile(snapshotPath, currentContent, 'utf-8');

        return { sectionsImported: newLines.length };
    }

    async getLastSyncState(): Promise<MemorySyncStatus> {
        const hashPath = path.join(this.identityDir, HASH_FILE);
        try {
            const hash = (await fs.promises.readFile(hashPath, 'utf-8')).trim();
            const stat = await fs.promises.stat(hashPath);
            return {
                lastSyncAt: stat.mtimeMs,
                lastHash: hash,
                sectionsImported: 0, // Historical count not stored
            };
        } catch {
            return { lastSyncAt: null, lastHash: null, sectionsImported: 0 };
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton
// ═══════════════════════════════════════════════════════════════════════════════

let _service: MemorySyncService | null = null;

export function getMemorySyncService(): MemorySyncService {
    if (!_service) {
        _service = new MemorySyncService();
    }
    return _service;
}
