/**
 * Claude Teams Templates Service
 *
 * Persists team configuration templates to disk so users can quickly
 * recreate teams with the same structure.
 * Storage: {projectRoot}/ai/team-templates.json
 */

import * as path from 'path';
import { readFile, writeFile, mkdir } from 'fs/promises';
import { existsSync } from 'fs';
import { randomUUID } from 'crypto';

// -----------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------

export interface TeamTemplate {
  id: string;
  name: string;
  description: string;
  createdAt: string;          // ISO 8601
  isFavorite: boolean;
  config: {
    teammates: Array<{
      name: string;
      prompt: string;
      model?: string;
      color?: string;
      planModeRequired?: boolean;
    }>;
  };
}

interface TemplateStore {
  schema: 'kuroryuu_team_templates_v1';
  templates: TeamTemplate[];
}

// -----------------------------------------------------------------------
// Path resolution
// -----------------------------------------------------------------------

/** Resolve project root from __dirname (main process is in apps/desktop/out/main/) */
function getProjectRoot(): string {
  return path.resolve(__dirname, '..', '..', '..', '..');
}

function getTemplatesPath(): string {
  return path.join(getProjectRoot(), 'ai', 'team-templates.json');
}

// -----------------------------------------------------------------------
// File I/O
// -----------------------------------------------------------------------

async function readStore(): Promise<TemplateStore> {
  const filePath = getTemplatesPath();
  try {
    const content = await readFile(filePath, 'utf-8');
    const parsed = JSON.parse(content);
    if (parsed && parsed.schema === 'kuroryuu_team_templates_v1' && Array.isArray(parsed.templates)) {
      return parsed as TemplateStore;
    }
  } catch {
    // File doesn't exist or is invalid
  }
  return { schema: 'kuroryuu_team_templates_v1', templates: [] };
}

async function writeStore(store: TemplateStore): Promise<void> {
  const filePath = getTemplatesPath();
  const dir = path.dirname(filePath);
  if (!existsSync(dir)) {
    await mkdir(dir, { recursive: true });
  }
  await writeFile(filePath, JSON.stringify(store, null, 2), 'utf-8');
}

// -----------------------------------------------------------------------
// Public API
// -----------------------------------------------------------------------

export async function listTemplates(): Promise<TeamTemplate[]> {
  const store = await readStore();
  // Sort: favorites first, then by createdAt descending
  return store.templates.sort((a, b) => {
    if (a.isFavorite !== b.isFavorite) return a.isFavorite ? -1 : 1;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

export async function saveTemplate(
  template: Omit<TeamTemplate, 'id' | 'createdAt'>
): Promise<{ ok: boolean; template?: TeamTemplate; error?: string }> {
  try {
    const store = await readStore();
    const newTemplate: TeamTemplate = {
      ...template,
      id: randomUUID(),
      createdAt: new Date().toISOString(),
    };
    store.templates.push(newTemplate);
    await writeStore(store);
    console.log('[TeamTemplates] Saved template:', newTemplate.name);
    return { ok: true, template: newTemplate };
  } catch (err) {
    console.error('[TeamTemplates] Failed to save template:', err);
    return { ok: false, error: String(err) };
  }
}

export async function deleteTemplate(
  templateId: string
): Promise<{ ok: boolean; error?: string }> {
  try {
    const store = await readStore();
    const idx = store.templates.findIndex((t) => t.id === templateId);
    if (idx === -1) {
      return { ok: false, error: `Template not found: ${templateId}` };
    }
    store.templates.splice(idx, 1);
    await writeStore(store);
    console.log('[TeamTemplates] Deleted template:', templateId);
    return { ok: true };
  } catch (err) {
    console.error('[TeamTemplates] Failed to delete template:', err);
    return { ok: false, error: String(err) };
  }
}

export async function toggleTemplateFavorite(
  templateId: string
): Promise<{ ok: boolean; isFavorite?: boolean; error?: string }> {
  try {
    const store = await readStore();
    const template = store.templates.find((t) => t.id === templateId);
    if (!template) {
      return { ok: false, error: `Template not found: ${templateId}` };
    }
    template.isFavorite = !template.isFavorite;
    await writeStore(store);
    return { ok: true, isFavorite: template.isFavorite };
  } catch (err) {
    console.error('[TeamTemplates] Failed to toggle favorite:', err);
    return { ok: false, error: String(err) };
  }
}
