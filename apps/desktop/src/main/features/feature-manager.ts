/**
 * Feature Manager
 * 
 * Discovers, loads, and manages feature modules for the desktop app.
 * 
 * Requirements:
 * - 4.1: Discover and load available feature modules on startup
 * - 4.2: Register module capabilities with agent harness
 * - 4.3: Route calls to appropriate modules
 * - 4.4: Log errors and continue operation on module failure
 * - 4.6: Don't load disabled modules
 * - 4.8: Gracefully shutdown all modules
 */

import { EventEmitter } from 'events';
import {
  IFeatureModule,
  FeatureResponse,
  FeatureError,
  FeatureErrorCode,
  FeatureEventType,
  ModuleMetadata,
  ModuleFactory,
  isError,
} from './base';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export interface FeatureManagerConfig {
  /** Whether to auto-initialize modules on registration */
  autoInitialize: boolean;
  /** Timeout for module operations (ms) */
  operationTimeout: number;
  /** List of disabled module IDs */
  disabledModules: string[];
}

const DEFAULT_CONFIG: FeatureManagerConfig = {
  autoInitialize: true,
  operationTimeout: 30000,
  disabledModules: [],
};

interface RegisteredModule {
  module: IFeatureModule;
  metadata: ModuleMetadata;
  loadedAt: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Feature Manager
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * Manages feature modules lifecycle and routing
 */
export class FeatureManager extends EventEmitter {
  private modules: Map<string, RegisteredModule> = new Map();
  private config: FeatureManagerConfig;
  private isShuttingDown = false;
  
  constructor(config: Partial<FeatureManagerConfig> = {}) {
    super();
    this.config = { ...DEFAULT_CONFIG, ...config };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Module Registration
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Register a module factory
   * Requirements: 4.1 - Discover and load available feature modules
   */
  async registerModule(factory: ModuleFactory): Promise<FeatureResponse<ModuleMetadata>> {
    try {
      const module = factory();
      
      // Check if disabled
      if (this.config.disabledModules.includes(module.id)) {
        console.log(`[FeatureManager] Module ${module.id} is disabled, skipping`);
        return {
          ok: true,
          result: {
            id: module.id,
            name: module.name,
            version: module.version,
            description: '',
            supportedActions: module.getSupportedActions(),
            enabled: false,
          },
        };
      }
      
      // Check for duplicate
      if (this.modules.has(module.id)) {
        return {
          ok: false,
          error: `Module ${module.id} is already registered`,
          errorCode: FeatureErrorCode.ALREADY_INITIALIZED,
        };
      }
      
      const metadata: ModuleMetadata = {
        id: module.id,
        name: module.name,
        version: module.version,
        description: '',
        supportedActions: module.getSupportedActions(),
        enabled: true,
      };
      
      // Auto-initialize if configured
      if (this.config.autoInitialize) {
        const initResult = await this.withTimeout(
          module.initialize(),
          this.config.operationTimeout,
          `Initialize ${module.id}`
        );
        
        if (isError(initResult)) {
          console.error(`[FeatureManager] Failed to initialize ${module.id}:`, initResult.error);
          this.emit(FeatureEventType.MODULE_ERROR, {
            moduleId: module.id,
            error: initResult.error,
            errorCode: initResult.errorCode,
            timestamp: Date.now(),
          });
          // Requirements 4.4: Log error and continue
          return initResult;
        }
      }
      
      // Register module
      this.modules.set(module.id, {
        module,
        metadata,
        loadedAt: Date.now(),
      });
      
      console.log(`[FeatureManager] Registered module: ${module.id} v${module.version}`);
      this.emit(FeatureEventType.MODULE_INITIALIZED, {
        moduleId: module.id,
        timestamp: Date.now(),
      });
      
      return { ok: true, result: metadata };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error('[FeatureManager] Registration error:', message);
      return {
        ok: false,
        error: message,
        errorCode: FeatureErrorCode.MODULE_LOAD_FAILED,
      };
    }
  }
  
  /**
   * Unregister and shutdown a module
   */
  async unregisterModule(moduleId: string): Promise<FeatureResponse<void>> {
    const registered = this.modules.get(moduleId);
    if (!registered) {
      return {
        ok: false,
        error: `Module ${moduleId} not found`,
        errorCode: FeatureErrorCode.MODULE_NOT_FOUND,
      };
    }
    
    // Shutdown module
    if (registered.module.isInitialized) {
      const shutdownResult = await this.withTimeout(
        registered.module.shutdown(),
        this.config.operationTimeout,
        `Shutdown ${moduleId}`
      );
      
      if (isError(shutdownResult)) {
        console.error(`[FeatureManager] Error shutting down ${moduleId}:`, shutdownResult.error);
        // Continue with unregistration anyway
      }
    }
    
    this.modules.delete(moduleId);
    console.log(`[FeatureManager] Unregistered module: ${moduleId}`);
    
    this.emit(FeatureEventType.MODULE_SHUTDOWN, {
      moduleId,
      timestamp: Date.now(),
    });
    
    return { ok: true };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Module Execution
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Execute an action on a module
   * Requirements: 4.3 - Route calls to appropriate modules
   */
  async execute<T = unknown>(
    moduleId: string,
    action: string,
    params: Record<string, unknown> = {}
  ): Promise<FeatureResponse<T>> {
    if (this.isShuttingDown) {
      return {
        ok: false,
        error: 'Feature manager is shutting down',
        errorCode: FeatureErrorCode.NOT_INITIALIZED,
      };
    }
    
    const registered = this.modules.get(moduleId);
    if (!registered) {
      return {
        ok: false,
        error: `Module ${moduleId} not found`,
        errorCode: FeatureErrorCode.MODULE_NOT_FOUND,
      };
    }
    
    if (!registered.module.isInitialized) {
      return {
        ok: false,
        error: `Module ${moduleId} is not initialized`,
        errorCode: FeatureErrorCode.NOT_INITIALIZED,
      };
    }
    
    try {
      const result = await this.withTimeout(
        registered.module.execute<T>(action, params),
        this.config.operationTimeout,
        `Execute ${moduleId}.${action}`
      );
      
      if (isError(result)) {
        this.emit(FeatureEventType.MODULE_ERROR, {
          moduleId,
          action,
          error: result.error,
          errorCode: result.errorCode,
          timestamp: Date.now(),
        });
      }
      
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[FeatureManager] Execute error (${moduleId}.${action}):`, message);
      
      const errorResponse: FeatureError = {
        ok: false,
        error: message,
        errorCode: FeatureErrorCode.UNKNOWN_ERROR,
      };
      
      this.emit(FeatureEventType.MODULE_ERROR, {
        moduleId,
        action,
        error: message,
        errorCode: FeatureErrorCode.UNKNOWN_ERROR,
        timestamp: Date.now(),
      });
      
      return errorResponse;
    }
  }
  
  /**
   * Execute action by finding the module that supports it
   */
  async executeAction<T = unknown>(
    action: string,
    params: Record<string, unknown> = {}
  ): Promise<FeatureResponse<T>> {
    // Find module that supports this action
    for (const [moduleId, registered] of this.modules) {
      if (registered.metadata.supportedActions.includes(action)) {
        return this.execute<T>(moduleId, action, params);
      }
    }
    
    return {
      ok: false,
      error: `No module supports action: ${action}`,
      errorCode: FeatureErrorCode.INVALID_ACTION,
    };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Lifecycle
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Shutdown all modules
   * Requirements: 4.8 - Gracefully shutdown all loaded modules
   */
  async shutdown(): Promise<void> {
    console.log('[FeatureManager] Shutting down all modules...');
    this.isShuttingDown = true;
    
    const shutdownPromises: Promise<FeatureResponse<void>>[] = [];
    
    for (const [moduleId, registered] of this.modules) {
      if (registered.module.isInitialized) {
        shutdownPromises.push(
          this.withTimeout(
            registered.module.shutdown(),
            this.config.operationTimeout,
            `Shutdown ${moduleId}`
          ).catch(err => {
            console.error(`[FeatureManager] Error shutting down ${moduleId}:`, err);
            return {
              ok: false,
              error: String(err),
              errorCode: FeatureErrorCode.UNKNOWN_ERROR,
            } as FeatureError;
          })
        );
      }
    }
    
    await Promise.all(shutdownPromises);
    this.modules.clear();
    
    console.log('[FeatureManager] All modules shut down');
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Queries
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Get module by ID
   */
  getModule(moduleId: string): IFeatureModule | undefined {
    return this.modules.get(moduleId)?.module;
  }
  
  /**
   * Get all registered modules metadata
   */
  getRegisteredModules(): ModuleMetadata[] {
    return Array.from(this.modules.values()).map(r => r.metadata);
  }
  
  /**
   * Check if a module is registered
   */
  hasModule(moduleId: string): boolean {
    return this.modules.has(moduleId);
  }
  
  /**
   * Get all supported actions across all modules
   */
  getAllSupportedActions(): Map<string, string[]> {
    const actions = new Map<string, string[]>();
    for (const [moduleId, registered] of this.modules) {
      actions.set(moduleId, registered.metadata.supportedActions);
    }
    return actions;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Utilities
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Wrap a promise with timeout
   */
  private async withTimeout<T>(
    promise: Promise<T>,
    timeoutMs: number,
    operation: string
  ): Promise<T> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error(`${operation} timed out after ${timeoutMs}ms`));
      }, timeoutMs);
      
      promise
        .then(result => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch(err => {
          clearTimeout(timer);
          reject(err);
        });
    });
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════════

let _instance: FeatureManager | null = null;

/**
 * Get the singleton Feature Manager instance
 */
export function getFeatureManager(config?: Partial<FeatureManagerConfig>): FeatureManager {
  if (!_instance) {
    _instance = new FeatureManager(config);
  }
  return _instance;
}

/**
 * Reset the singleton (for testing)
 */
export function resetFeatureManager(): void {
  if (_instance) {
    _instance.shutdown().catch(console.error);
  }
  _instance = null;
}
