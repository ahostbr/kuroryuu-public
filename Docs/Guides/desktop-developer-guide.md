# Desktop Features Developer Guide

This guide covers the architecture, extension points, and testing strategy for the desktop capture, voice input, and text-to-speech feature modules.

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [Module Structure](#module-structure)
3. [Adding New Features](#adding-new-features)
4. [Adding New Backends](#adding-new-backends)
5. [Event System](#event-system)
6. [Configuration System](#configuration-system)
7. [Error Handling](#error-handling)
8. [Testing Strategy](#testing-strategy)
9. [API Reference](#api-reference)

---

## Architecture Overview

The feature module system follows a pluggable architecture:

```
┌─────────────────────────────────────────────────────────────┐
│                    LifecycleManager                          │
│  (initialization, shutdown, health checks, auto-recovery)   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    FeatureManager                            │
│  (module registration, action routing, event emission)      │
└─────────────────────────────────────────────────────────────┘
                              │
        ┌─────────────────────┼─────────────────────┐
        ▼                     ▼                     ▼
┌───────────────┐   ┌─────────────────┐   ┌───────────────┐
│ CaptureModule │   │ VoiceInputModule│   │   TTSModule   │
│  (ffmpeg)     │   │ (speech-to-text)│   │ (multiple BE) │
└───────────────┘   └─────────────────┘   └───────────────┘
        │                     │                     │
        └─────────────────────┼─────────────────────┘
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    FeatureEventBus                           │
│  (event emission, subscription, logging)                    │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                    AgentHarnessBridge                        │
│  (IPC handlers, Python integration, event forwarding)       │
└─────────────────────────────────────────────────────────────┘
```

### Key Components

| Component | File | Purpose |
|-----------|------|---------|
| FeatureModule | `base.ts` | Interface for all feature modules |
| FeatureManager | `feature-manager.ts` | Module registration and routing |
| LifecycleManager | `lifecycle.ts` | Graceful init/shutdown |
| ConfigManager | `config-manager.ts` | JSON config persistence |
| FeatureEventBus | `event-bus.ts` | Event emission and subscription |
| AgentHarnessBridge | `harness.ts` | Python/IPC integration |
| ConcurrentAccessManager | `concurrency.ts` | Resource locking |

---

## Module Structure

Each feature module must implement the `FeatureModule` interface:

```typescript
interface FeatureModule {
  // Metadata
  readonly moduleId: string;
  readonly supportedActions: string[];
  readonly isInitialized: boolean;
  
  // Lifecycle
  initialize(): Promise<FeatureResponse<void>>;
  shutdown(): Promise<FeatureResponse<void>>;
  
  // Execution
  execute(action: string, params?: unknown): Promise<FeatureResponse<unknown>>;
}
```

### Directory Structure

```
src/main/features/
├── base.ts                 # Base types, interfaces, enums
├── errors.ts               # Error creation utilities
├── logger.ts               # Structured logging
├── event-bus.ts            # Event system
├── feature-manager.ts      # Module orchestration
├── config-manager.ts       # Configuration persistence
├── lifecycle.ts            # Lifecycle management
├── harness.ts              # Agent harness integration
├── concurrency.ts          # Resource locking
├── capture/
│   ├── index.ts            # CaptureModule implementation
│   └── __tests__/          # Capture tests
├── voice-input/
│   ├── index.ts            # VoiceInputModule implementation
│   └── __tests__/          # Voice input tests
├── tts/
│   ├── index.ts            # TTSModule implementation
│   └── __tests__/          # TTS tests
└── __tests__/              # Shared tests
    ├── base.test.ts
    ├── event-bus.test.ts
    ├── feature-manager.test.ts
    ├── config-manager.test.ts
    ├── config-manager.property.test.ts
    ├── lifecycle.property.test.ts
    └── integration.test.ts
```

---

## Adding New Features

### Step 1: Create Module Directory

```
src/main/features/my-feature/
├── index.ts
└── __tests__/
    ├── my-feature.test.ts
    └── my-feature.property.test.ts
```

### Step 2: Implement FeatureModule Interface

```typescript
// src/main/features/my-feature/index.ts
import { FeatureModule, FeatureResponse, FeatureErrorCode } from '../base';
import { getEventBus } from '../event-bus';
import { getLogger } from '../logger';

export class MyFeatureModule implements FeatureModule {
  readonly moduleId = 'my-feature';
  readonly supportedActions = ['doSomething', 'doSomethingElse'];
  
  private logger = getLogger('MyFeatureModule');
  private eventBus = getEventBus();
  private _isInitialized = false;
  
  get isInitialized(): boolean {
    return this._isInitialized;
  }
  
  async initialize(): Promise<FeatureResponse<void>> {
    this.logger.info('Initializing MyFeatureModule');
    // Initialization logic here
    this._isInitialized = true;
    return { ok: true };
  }
  
  async shutdown(): Promise<FeatureResponse<void>> {
    this.logger.info('Shutting down MyFeatureModule');
    // Cleanup logic here
    this._isInitialized = false;
    return { ok: true };
  }
  
  async execute(action: string, params?: unknown): Promise<FeatureResponse<unknown>> {
    if (!this._isInitialized) {
      return { ok: false, error: 'Not initialized', errorCode: FeatureErrorCode.NOT_INITIALIZED };
    }
    
    switch (action) {
      case 'doSomething':
        return this.doSomething(params);
      case 'doSomethingElse':
        return this.doSomethingElse(params);
      default:
        return { ok: false, error: `Unknown action: ${action}`, errorCode: FeatureErrorCode.INVALID_ACTION };
    }
  }
  
  private async doSomething(params?: unknown): Promise<FeatureResponse<unknown>> {
    // Implementation
    this.eventBus.emitEvent(FeatureEventType.MODULE_INITIALIZED, {
      moduleId: this.moduleId,
      timestamp: Date.now(),
    });
    return { ok: true, result: { success: true } };
  }
}
```

### Step 3: Register Module

Add to FeatureManager initialization or use dynamic registration:

```typescript
const manager = new FeatureManager();
await manager.registerModule('my-feature', new MyFeatureModule());
```

### Step 4: Write Tests

```typescript
// __tests__/my-feature.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { MyFeatureModule } from '../index';

describe('MyFeatureModule', () => {
  let module: MyFeatureModule;
  
  beforeEach(() => {
    module = new MyFeatureModule();
  });
  
  it('should initialize successfully', async () => {
    const result = await module.initialize();
    expect(result.ok).toBe(true);
    expect(module.isInitialized).toBe(true);
  });
  
  it('should execute doSomething action', async () => {
    await module.initialize();
    const result = await module.execute('doSomething', {});
    expect(result.ok).toBe(true);
  });
});
```

---

## Adding New Backends

The TTS module demonstrates the backend pattern. To add a new backend:

### Step 1: Define Backend Interface

```typescript
interface TTSBackend {
  readonly name: string;
  isAvailable(): Promise<boolean>;
  speak(text: string, options: TTSOptions): Promise<void>;
  stop(): Promise<void>;
  listVoices(): Promise<Voice[]>;
}
```

### Step 2: Implement Backend

```typescript
// backends/my-backend.ts
export class MyTTSBackend implements TTSBackend {
  readonly name = 'my-backend';
  
  async isAvailable(): Promise<boolean> {
    // Check if backend is available
    return true;
  }
  
  async speak(text: string, options: TTSOptions): Promise<void> {
    // Implement speech synthesis
  }
  
  async stop(): Promise<void> {
    // Stop playback
  }
  
  async listVoices(): Promise<Voice[]> {
    return [{ id: 'voice1', name: 'Voice 1', language: 'en-US' }];
  }
}
```

### Step 3: Register Backend in Module

Add to the backends array in TTSModule:

```typescript
private backends: TTSBackend[] = [
  new NativeBackend(),
  new EdgeBackend(),
  new MyTTSBackend(), // Add your backend
];
```

---

## Event System

### Event Types

```typescript
enum FeatureEventType {
  // Module lifecycle
  MODULE_INITIALIZED = 'module:initialized',
  MODULE_SHUTDOWN = 'module:shutdown',
  MODULE_ERROR = 'module:error',
  
  // Capture events
  CAPTURE_SCREENSHOT_COMPLETE = 'capture:screenshot:complete',
  CAPTURE_RECORD_START = 'capture:record:start',
  CAPTURE_RECORD_STOP = 'capture:record:stop',
  CAPTURE_ERROR = 'capture:error',
  
  // Voice input events
  VOICE_INPUT_START = 'voice:input:start',
  VOICE_INPUT_COMPLETE = 'voice:input:complete',
  VOICE_INPUT_ERROR = 'voice:input:error',
  
  // TTS events
  TTS_SPEAK_START = 'tts:speak:start',
  TTS_SPEAK_COMPLETE = 'tts:speak:complete',
  TTS_ERROR = 'tts:error',
}
```

### Emitting Events

```typescript
const eventBus = getEventBus();

eventBus.emitEvent(FeatureEventType.CAPTURE_SCREENSHOT_COMPLETE, {
  moduleId: 'capture',
  timestamp: Date.now(),
  filePath: '/path/to/screenshot.png',
  width: 1920,
  height: 1080,
});
```

### Subscribing to Events

```typescript
const eventBus = getEventBus();

const subscription = eventBus.subscribe(
  FeatureEventType.CAPTURE_SCREENSHOT_COMPLETE,
  (data) => {
    console.log('Screenshot captured:', data.filePath);
  }
);

// Later: unsubscribe
subscription.unsubscribe();
```

---

## Configuration System

### Config Structure

```typescript
interface FeatureConfig {
  version: number;
  capture: CaptureConfig;
  voiceInput: VoiceInputConfig;
  tts: TTSConfig;
}

interface CaptureConfig {
  outputDir: string;
  defaultPreset: string;
  presets: Record<string, CapturePreset>;
}

interface VoiceInputConfig {
  timeout: number;  // 1-15 seconds
  language: string;
}

interface TTSConfig {
  defaultVoice: string;
  rate: number;     // 0.1-3.0
  volume: number;   // 0-1.0
  backends: string[];
}
```

### Using ConfigManager

```typescript
const config = getConfigManager();

// Get full config
const fullConfig = config.getConfig();

// Get feature-specific config
const captureConfig = config.getCaptureConfig();
const voiceConfig = config.getVoiceInputConfig();
const ttsConfig = config.getTTSConfig();

// Load/save
await config.load();
await config.save();
```

---

## Error Handling

### Error Codes

All errors use standardized codes from `FeatureErrorCode`:

```typescript
enum FeatureErrorCode {
  // General
  NOT_INITIALIZED = 'NOT_INITIALIZED',
  INVALID_ACTION = 'INVALID_ACTION',
  TIMEOUT = 'TIMEOUT',
  
  // Capture
  FFMPEG_NOT_FOUND = 'FFMPEG_NOT_FOUND',
  CAPTURE_FAILED = 'CAPTURE_FAILED',
  
  // Voice
  MICROPHONE_NOT_AVAILABLE = 'MICROPHONE_NOT_AVAILABLE',
  SPEECH_RECOGNITION_FAILED = 'SPEECH_RECOGNITION_FAILED',
  
  // TTS
  TTS_BACKEND_UNAVAILABLE = 'TTS_BACKEND_UNAVAILABLE',
  TTS_ALL_BACKENDS_FAILED = 'TTS_ALL_BACKENDS_FAILED',
  
  // ... more codes
}
```

### Creating Errors

```typescript
import { createFeatureError, FeatureErrorCode } from './errors';

const error = createFeatureError(
  FeatureErrorCode.CAPTURE_FAILED,
  'Failed to capture screenshot: screen locked',
  'CaptureModule',
  { cause: originalError }
);
```

### Error Response Format

```typescript
interface FeatureError {
  ok: false;
  error: string;
  errorCode: FeatureErrorCode;
}
```

---

## Testing Strategy

### Test Types

| Type | Tool | Purpose |
|------|------|---------|
| Unit | Vitest | Test individual functions |
| Property | fast-check | Test invariants with random inputs |
| Integration | Vitest | Test component interactions |

### Running Tests

```bash
cd apps/desktop

# Run all tests
npx vitest run

# Run specific test file
npx vitest run src/main/features/__tests__/capture.test.ts

# Watch mode
npx vitest

# Coverage
npx vitest run --coverage
```

### Writing Property Tests

```typescript
import * as fc from 'fast-check';

describe('Property Tests', () => {
  it('property: timeout is always within bounds', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.integer({ min: 1, max: 15 }),
        async (timeout) => {
          const module = new VoiceInputModule({ timeout });
          await module.initialize();
          // Property: configured timeout should match
          expect(module.getTimeout()).toBe(timeout);
        }
      ),
      { numRuns: 50 }
    );
  });
});
```

### Test Coverage Targets

- Unit tests: 80%+ coverage
- Property tests: All 7 correctness properties
- Integration tests: All cross-module flows

---

## API Reference

### FeatureManager

```typescript
class FeatureManager {
  // Registration
  registerModule(id: string, module: FeatureModule): Promise<FeatureResponse<void>>
  unregisterModule(id: string): Promise<FeatureResponse<void>>
  
  // Execution
  executeAction(moduleId: string, action: string, params?: unknown): Promise<FeatureResponse<unknown>>
  
  // Queries
  getModuleInfo(id: string): ModuleInfo | undefined
  getAllModules(): ModuleInfo[]
  getAllActions(): ActionInfo[]
  
  // Lifecycle
  initialize(): Promise<FeatureResponse<void>>
  shutdown(): Promise<void>
}
```

### LifecycleManager

```typescript
class LifecycleManager {
  // State
  getState(): LifecycleState
  getStateHistory(): LifecycleEvent[]
  
  // Lifecycle
  initialize(): Promise<{ success: boolean; error?: FeatureError }>
  shutdown(): Promise<{ success: boolean; error?: FeatureError }>
  
  // Access
  getFeatureManager(): FeatureManager | null
  getEventBus(): FeatureEventBus
  getConfigManager(): ConfigManager
  
  // Health
  getModuleHealth(): ModuleHealth[]
}
```

### ConcurrentAccessManager

```typescript
class ConcurrentAccessManager {
  // Locking
  acquireLock(resource: ResourceType, ownerId: string, timeoutMs?: number): Promise<{ success: boolean; error?: FeatureError }>
  releaseLock(resource: ResourceType, ownerId: string): boolean
  
  // Queries
  isLocked(resource: ResourceType): boolean
  getLockInfo(resource: ResourceType): ResourceLock | null
  getAllLocks(): ResourceLock[]
  getQueueLength(resource: ResourceType): number
  
  // Management
  clearQueue(resource: ResourceType): number
  clearAll(): void
}
```

---

## Best Practices

1. **Always check initialization** before executing actions
2. **Use structured logging** via getLogger()
3. **Emit events** for all significant state changes
4. **Handle errors gracefully** with proper error codes
5. **Write tests first** for new functionality
6. **Document public APIs** with JSDoc comments
7. **Use TypeScript strict mode** for type safety
8. **Follow the module pattern** for new features
