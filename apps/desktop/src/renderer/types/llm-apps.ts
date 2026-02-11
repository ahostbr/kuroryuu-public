/**
 * LLM Apps Catalog Types
 * Types for the awesome-llm-apps catalog browser
 */

export interface LLMApp {
  id: string;              // e.g., "starter_ai_agents/ai_travel_agent"
  name: string;            // e.g., "AI Travel Agent"
  category: string;        // e.g., "Starter AI Agents"
  categoryId: string;      // e.g., "starter_ai_agents"
  path: string;            // relative path from repo root
  absolutePath: string;    // full filesystem path
  description: string;     // first paragraph of README (or "")
  hasReadme: boolean;
  hasRequirements: boolean;
  techStack: string[];     // parsed from requirements.txt
  entryPoint: string | null; // first .py file name
  pyFileCount: number;     // number of .py files
}

export interface LLMAppsCategory {
  id: string;
  label: string;
  appCount: number;
}

export interface LLMAppsCatalog {
  apps: LLMApp[];
  categories: LLMAppsCategory[];
  generatedAt: string;
  repoPath: string;
  totalApps: number;
}
