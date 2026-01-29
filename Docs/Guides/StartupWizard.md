# Startup Wizard Documentation

## Overview

The **Startup Wizard** is an 8-step guided onboarding experience that helps users configure Kuroryuu for their development environment. The wizard is triggered automatically when the application first launches and can be reset at any time.

## Feature Details

### Steps in the Onboarding Process

1. **Welcome**: Introduction to Kuroryuu
2. **Auth Method**: Choose authentication method (OAuth, API Key, or Local LLM)
3. **Auth**: Configure authentication credentials
4. **CLI**: Install and configure Claude CLI
5. **Dev Tools**: Set preferred IDE and terminal
6. **Privacy**: Review and accept privacy settings
7. **Memory**: Configure AI memory (Graphiti knowledge graph)
8. **Completion**: Finalize setup and start using Kuroryuu

### Key Components

#### 1. OnboardingWizard Component
- **Location**: `apps/desktop/src/renderer/components/onboarding/OnboardingWizard.tsx`
- Full-screen dialog that guides users through configuration
- Progress indicator showing current step out of 8 total steps
- Reset button to start over
- Conditional logic for skipping optional steps

#### 2. Onboarding Store (Zustand)
- **Location**: `apps/desktop/src/renderer/stores/onboarding-store.ts`
- Manages state using Zustand with persistence middleware
- Stores configuration choices across all steps
- Tracks completed steps and current step
- Persists data to localStorage under key 'kuroryuu-onboarding'

#### 3. Onboarding Types
- **Location**: `apps/desktop/src/renderer/types/onboarding.ts`
- Defines all type definitions for the wizard
- `OnboardingStep`: Union type of all 8 step names
- `AuthMethod`: 'oauth' | 'api-key' | 'local-llm'
- `IDE`: VSCode, Cursor, Windsurf, Zed, Neovim, JetBrains, Sublime, Other
- `Terminal`: Default, iTerm, Warp, Alacritty, Hyper, Kitty, Windows Terminal, CMD
- Step configuration with requirements and skip options

#### 4. Individual Step Components
Each step has its own component in `apps/desktop/src/renderer/components/onboarding/steps/`:
- `WelcomeStep.tsx`: Introduction screen
- `AuthMethodStep.tsx`: Choose between OAuth, API Key, or Local LLM
- `AuthStep.tsx`: Configure authentication credentials
- `CLIStep.tsx`: Detect and configure Claude CLI installation
- `DevToolsStep.tsx`: Set preferred IDE and terminal
- `PrivacyStep.tsx`: Privacy settings and terms acceptance
- `MemoryStep.tsx`: Graphiti knowledge graph configuration (opt-in)
- `CompletionStep.tsx`: Final review and completion screen

#### 5. Settings Integration
- **Location**: `ai/settings/app-settings.json`
- Stores overall onboarding completion state
- Tracks which steps have been completed
- Persists across application restarts

### Technical Implementation

#### Wizard Logic Flow
1. App checks `useIsOnboardingComplete()` from the store
2. If not complete, shows `WelcomeScreen.tsx` with "New Project" and "Open Project" buttons
3. When user opens a project, triggers `OnboardingWizard`
4. Wizard manages state in Zustand store with persistence
5. Each step validates its data before allowing continuation
6. On completion, updates settings and redirects to Kanban board

#### Conditional Navigation
- **Local LLM path**: Skips authentication steps completely
- **Optional steps**: CLI, Dev Tools, Memory can be skipped
- **Required steps**: Welcome, Auth Method, Privacy, Completion cannot be skipped

#### Data Persistence
- Zustand store persists to localStorage
- Settings service manages project-scoped settings in `ai/settings/app-settings.json`
- IPC handlers for settings management in `apps/desktop/src/main/settings/`

### API and IPC Integration

#### Main Process Handlers
- `settings:get`: Retrieve onboarding state
- `settings:set`: Update onboarding state
- `cli:detect`: Detect Claude CLI installation (used in CLI step)
- Various auth handlers for OAuth and API key management

#### Renderer-to-Main Communication
```typescript
// Example IPC call from renderer
const result = await window.electronAPI.cli.detect('claude');
```

### Authentication Methods

#### 1. Local LLM (Recommended)
- Uses LM Studio as the backend
- No API keys required
- Skips all authentication steps
- Direct connection to local models

**Configuration:**
- Model: `mistralai/devstral-small-2-2512` (default)
- URL: `http://127.0.0.1:1234`
- Environment variables:
  - `KURORYUU_LMSTUDIO_BASE_URL`
  - `KURORYUU_LMSTUDIO_MODEL`

#### 2. OAuth (Anthropic)
- Web-based authentication flow
- Connects to Anthropic account
- Automatic API key management

#### 3. API Key (Direct)
- Manual entry of API key
- Format validation (`sk-ant-` prefix)
- Test connection functionality

### Privacy and Compliance

The wizard includes:
- Explicit terms and conditions acceptance
- Privacy policy review
- Data sharing preferences
- Opt-in for analytics and error reporting
- Graphiti knowledge graph (opt-in, disabled by default)

## Configuration Files

### Settings Schema
**Location**: `apps/desktop/src/main/settings/schemas.ts`

```typescript
interface OnboardingSettings {
  completedSteps: string[];
  currentStep: string | null;
  isComplete: boolean;
}
```

### Default State
```json
{
  "onboarding": {
    "completedSteps": [],
    "currentStep": null,
    "isComplete": false
  }
}
```

## Usage and Testing

### Triggering the Wizard
The wizard automatically appears on first launch:
1. Open Kuroryuu desktop application
2. Click "New Project" or "Open Project"
3. Wizard begins at Welcome step

### Manual Reset
Users can reset the wizard from any step using the reset button (🔄 icon) in the header.

This clears all progress and returns to the first step.

### Development Workflow
1. Make changes to onboarding components
2. Run `npm run dev` in desktop app directory
3. Wizard state persists between reloads via localStorage
4. Clear storage or use reset button to test from beginning

## Future Enhancements

Potential improvements:
- GitHub/GitLab OAuth integration
- Automatic IDE/terminal detection
- Advanced Graphiti configuration options
- Team/enterprise onboarding flows
- Custom prompt pack selection during setup
