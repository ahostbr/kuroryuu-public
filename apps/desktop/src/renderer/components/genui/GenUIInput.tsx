import React, { useState, useRef } from 'react';

interface GenUIInputProps {
  onGenerate: (markdown: string, layoutOverride?: string) => void;
}

const SAMPLE_DOCUMENTS = {
  tutorial: `# Getting Started with React Hooks

## Step 1: Understanding useState

\`\`\`javascript
const [count, setCount] = useState(0);
\`\`\`

### Key Points
- Hooks replace class components
- useState returns [value, setter]
- Effects run after render

## Step 2: useEffect

UseEffect handles side effects...

| Hook | Purpose |
|------|--------|
| useState | State management |
| useEffect | Side effects |
| useCallback | Memoize callbacks |`,

  research: `# AI Market Analysis 2025

## Executive Summary

The AI market is projected to reach **$196B** by 2025, with a **23% CAGR**.

## Key Findings

- GPT-4 adoption: **78%** of enterprises
- Open source LLMs grew **340%**
- AI spending: **$45B** quarterly

## Methodology

We analyzed 500+ companies across 12 sectors...

### Data Sources
- Gartner Magic Quadrant
- McKinsey Global Survey
- Stack Overflow Developer Survey 2025`,

  api: `# REST API Reference

## Authentication

All requests require a Bearer token.

\`\`\`bash
curl -H "Authorization: Bearer sk-xxx" https://api.example.com/v1/users
\`\`\`

## Endpoints

### GET /v1/users

List all users.

| Parameter | Type | Required |
|-----------|------|----------|
| page | int | No |
| limit | int | No |

### POST /v1/users

Create a new user.

\`\`\`json
{ "name": "John", "email": "john@example.com" }
\`\`\``
};

const LAYOUT_OPTIONS = [
  { value: '', label: 'Auto' },
  { value: 'instructional_layout', label: 'Instructional' },
  { value: 'data_layout', label: 'Data' },
  { value: 'news_layout', label: 'News' },
  { value: 'list_layout', label: 'List' },
  { value: 'summary_layout', label: 'Summary' },
  { value: 'reference_layout', label: 'Reference' },
  { value: 'media_layout', label: 'Media' }
];

export function GenUIInput({ onGenerate }: GenUIInputProps) {
  const [markdown, setMarkdown] = useState('');
  const [layoutOverride, setLayoutOverride] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleGenerate = () => {
    if (!markdown.trim()) return;
    onGenerate(markdown, layoutOverride || undefined);
  };

  const loadSample = (sample: string) => {
    setMarkdown(sample);
    textareaRef.current?.focus();
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const file = e.dataTransfer.files[0];
    if (file && file.name.endsWith('.md')) {
      const reader = new FileReader();
      reader.onload = (evt) => {
        const text = evt.target?.result as string;
        setMarkdown(text);
      };
      reader.readAsText(file);
    }
  };

  return (
    <div className="flex flex-col items-center justify-center min-h-screen px-8 py-12 bg-background">
      <div className="w-full max-w-4xl space-y-6">
        {/* Header */}
        <div className="text-center space-y-2 mb-8">
          <h1 className="text-4xl font-bold bg-gradient-to-r from-primary via-yellow-500 to-primary bg-clip-text text-transparent">
            Generative UI
          </h1>
          <p className="text-lg text-muted-foreground">
            Transform markdown content into interactive A2UI dashboards
          </p>
        </div>

        {/* Textarea */}
        <div
          className={`relative ${isDragging ? 'ring-2 ring-primary' : ''}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
          <textarea
            ref={textareaRef}
            value={markdown}
            onChange={(e) => setMarkdown(e.target.value)}
            placeholder="Paste your markdown content here or drag & drop a .md file..."
            className="w-full h-96 px-4 py-3 font-mono text-sm bg-card border border-border rounded-lg resize-none focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent transition-all"
          />
          {isDragging && (
            <div className="absolute inset-0 flex items-center justify-center bg-background/80 rounded-lg">
              <p className="text-lg font-semibold text-primary">Drop markdown file here</p>
            </div>
          )}
        </div>

        {/* Sample Documents */}
        <div className="space-y-2">
          <p className="text-sm font-medium text-muted-foreground">Load a sample:</p>
          <div className="flex gap-3">
            <button
              onClick={() => loadSample(SAMPLE_DOCUMENTS.tutorial)}
              className="px-4 py-2 text-sm font-medium bg-secondary text-foreground border border-border rounded-md hover:bg-secondary/80 transition-colors"
            >
              Tutorial Sample
            </button>
            <button
              onClick={() => loadSample(SAMPLE_DOCUMENTS.research)}
              className="px-4 py-2 text-sm font-medium bg-secondary text-foreground border border-border rounded-md hover:bg-secondary/80 transition-colors"
            >
              Research Paper
            </button>
            <button
              onClick={() => loadSample(SAMPLE_DOCUMENTS.api)}
              className="px-4 py-2 text-sm font-medium bg-secondary text-foreground border border-border rounded-md hover:bg-secondary/80 transition-colors"
            >
              API Docs
            </button>
          </div>
        </div>

        {/* Layout Override */}
        <div className="space-y-2">
          <label htmlFor="layout-override" className="block text-sm font-medium text-muted-foreground">
            Layout override (optional):
          </label>
          <select
            id="layout-override"
            value={layoutOverride}
            onChange={(e) => setLayoutOverride(e.target.value)}
            className="w-full px-4 py-2 bg-card border border-border rounded-lg focus:outline-none focus:ring-2 focus:ring-primary text-foreground"
          >
            {LAYOUT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {/* Generate Button */}
        <button
          onClick={handleGenerate}
          disabled={!markdown.trim()}
          className="w-full px-6 py-3 text-lg font-semibold bg-gradient-to-r from-primary to-yellow-600 text-white rounded-lg hover:from-primary/90 hover:to-yellow-600/90 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-lg hover:shadow-primary/50"
        >
          Generate Dashboard
        </button>
      </div>
    </div>
  );
}
