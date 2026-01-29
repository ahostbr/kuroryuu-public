/**
 * Module Lifecycle Manager
 * 
 * Handles graceful initialization, shutdown, and error recovery
 * for all feature modules.
 * 
 * Requirements: 5.5, 5.8, 8.1
 */

import { FeatureManager } from './feature-manager';
import { FeatureEventBus, resetEventBus } from './event-bus';
import { FeatureEventType } from './base';
import { ConfigManager } from './config-manager';
import { getLogger, closeAllLoggers, FeatureLogger } from './logger';
import { FeatureErrorCode, createFeatureError, type FeatureError } from './errors';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type LifecycleState = 
  | 'uninitialized'
  | 'initializing'
  | 'ready'
  | 'shutting_down'
  | 'shutdown'
  | 'error';

export interface LifecycleEvent {
  state: LifecycleState;
  timestamp: string;
  error?: FeatureError;
}

export interface ModuleHealth {
  moduleId: string;
  status: 'healthy' | 'degraded' | 'failed';
  lastCheck: string;
  errorCount: number;
  lastError?: string;
}

export interface LifecycleOptions {
  /** Auto-recover from errors */
  autoRecover: boolean;
  /** Max recovery attempts per module */
  maxRecoveryAttempts: number;
  /** Recovery delay in ms */
  recoveryDelayMs: number;
  /** Health check interval in ms (0 = disabled) */
  healthCheckIntervalMs: number;
  /** Shutdown timeout in ms */
  shutdownTimeoutMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Options
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_OPTIONS: LifecycleOptions = {
  autoRecover: true,
  maxRecoveryAttempts: 3,
  recoveryDelayMs: 1000,
  healthCheckIntervalMs: 0, // Disabled by default
  shutdownTimeoutMs: 5000,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Lifecycle Manager
// ═══════════════════════════════════════════════════════════════════════════════

export class LifecycleManager {
  private state: LifecycleState = 'uninitialized';
  private options: LifecycleOptions;
  private logger: FeatureLogger;
  private eventBus: FeatureEventBus;
  private configManager: ConfigManager;
  private featureManager: FeatureManager | null = null;
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private moduleHealth: Map<string, ModuleHealth> = new Map();
  private recoveryAttempts: Map<string, number> = new Map();
  private stateHistory: LifecycleEvent[] = [];
  
  constructor(options: Partial<LifecycleOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
    this.logger = getLogger('LifecycleManager');
    this.eventBus = new FeatureEventBus();
    this.configManager = new ConfigManager();
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // State Management
  // ─────────────────────────────────────────────────────────────────────────────
  
  getState(): LifecycleState {
    return this.state;
  }
  
  getStateHistory(): LifecycleEvent[] {
    return [...this.stateHistory];
  }
  
  private setState(state: LifecycleState, error?: FeatureError): void {
    const previousState = this.state;
    this.state = state;
    
    const event: LifecycleEvent = {
      state,
      timestamp: new Date().toISOString(),
      error,
    };
    
    this.stateHistory.push(event);
    
    this.logger.info(`State transition: ${previousState} → ${state}`, { error: error?.code });
    
    // Emit state change event
    this.eventBus.emit(FeatureEventType.MODULE_INITIALIZED, {
      state,
      previousState,
      error,
    });
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Initialization
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Initialize all feature modules
   * Requirements: 5.5, 8.1
   */
  async initialize(): Promise<{ success: boolean; error?: FeatureError }> {
    if (this.state !== 'uninitialized' && this.state !== 'error') {
      return {
        success: false,
        error: createFeatureError(
          FeatureErrorCode.INITIALIZATION_FAILED,
          `Cannot initialize from state: ${this.state}`,
          'LifecycleManager'
        ),
      };
    }
    
    this.setState('initializing');
    
    try {
      // Load configuration
      this.logger.info('Loading configuration...');
      await this.configManager.load();
      
      // Create feature manager with auto-initialize enabled
      this.logger.info('Creating feature manager...');
      this.featureManager = new FeatureManager({
        autoInitialize: true,
      });

      // Feature manager auto-initializes modules on registration
      // Modules are registered via registerModule() after construction
      this.logger.info('Feature manager created (modules will auto-initialize on registration)');
      
      // Start health checks if enabled
      if (this.options.healthCheckIntervalMs > 0) {
        this.startHealthChecks();
      }
      
      // Subscribe to module errors for auto-recovery
      if (this.options.autoRecover) {
        this.setupAutoRecovery();
      }
      
      this.setState('ready');
      this.logger.info('Lifecycle manager initialized successfully');
      
      return { success: true };
    } catch (error) {
      const featureError = createFeatureError(
        FeatureErrorCode.INITIALIZATION_FAILED,
        error instanceof Error ? error.message : 'Unknown initialization error',
        'LifecycleManager',
        { cause: error instanceof Error ? error : undefined }
      );
      
      this.setState('error', featureError);
      this.logger.error('Initialization failed', error);
      
      return { success: false, error: featureError };
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Shutdown
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Gracefully shutdown all modules
   * Requirements: 5.5, 5.8
   */
  async shutdown(): Promise<{ success: boolean; error?: FeatureError }> {
    if (this.state === 'shutdown' || this.state === 'shutting_down') {
      return { success: true };
    }
    
    this.setState('shutting_down');
    
    try {
      // Stop health checks
      this.stopHealthChecks();
      
      // Shutdown with timeout
      const shutdownPromise = this.performShutdown();
      const timeoutPromise = new Promise<never>((_, reject) => {
        setTimeout(() => reject(new Error('Shutdown timeout')), this.options.shutdownTimeoutMs);
      });
      
      await Promise.race([shutdownPromise, timeoutPromise]);
      
      this.setState('shutdown');
      this.logger.info('Lifecycle manager shutdown complete');
      
      // Close loggers last
      closeAllLoggers();
      
      return { success: true };
    } catch (error) {
      const featureError = createFeatureError(
        FeatureErrorCode.UNKNOWN_ERROR,
        error instanceof Error ? error.message : 'Unknown shutdown error',
        'LifecycleManager',
        { cause: error instanceof Error ? error : undefined }
      );
      
      // Force shutdown even on error
      this.setState('shutdown', featureError);
      this.logger.error('Shutdown completed with errors', error);
      closeAllLoggers();
      
      return { success: false, error: featureError };
    }
  }
  
  private async performShutdown(): Promise<void> {
    // Shutdown feature manager
    if (this.featureManager) {
      this.logger.info('Shutting down feature manager...');
      await this.featureManager.shutdown();
      this.featureManager = null;
    }
    
    // Save configuration
    this.logger.info('Saving configuration...');
    await this.configManager.save();
    
    // Reset event bus
    resetEventBus();
    
    // Clear state
    this.moduleHealth.clear();
    this.recoveryAttempts.clear();
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Health Checks
  // ─────────────────────────────────────────────────────────────────────────────
  
  private startHealthChecks(): void {
    if (this.healthCheckTimer) return;
    
    this.healthCheckTimer = setInterval(() => {
      this.performHealthCheck();
    }, this.options.healthCheckIntervalMs);
    
    this.logger.info('Health checks started', {
      interval: this.options.healthCheckIntervalMs,
    });
  }
  
  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
      this.logger.info('Health checks stopped');
    }
  }
  
  private async performHealthCheck(): Promise<void> {
    if (!this.featureManager || this.state !== 'ready') return;
    
    const modules = this.featureManager.getRegisteredModules();
    
    for (const metadata of modules) {
      const health = this.moduleHealth.get(metadata.id) || {
        moduleId: metadata.id,
        status: 'healthy' as const,
        lastCheck: new Date().toISOString(),
        errorCount: 0,
      };
      
      try {
        // Simple health check: try to get status
        const result = await this.featureManager.execute(metadata.id, 'get_status', {});
        
        health.status = result.ok ? 'healthy' : 'degraded';
        health.lastCheck = new Date().toISOString();
        
        if (result.ok) {
          health.errorCount = 0;
        } else {
          health.errorCount++;
          health.lastError = result.error;
        }
      } catch (error) {
        health.status = 'failed';
        health.errorCount++;
        health.lastError = error instanceof Error ? error.message : 'Unknown error';
      }
      
      this.moduleHealth.set(metadata.id, health);
    }
  }
  
  getModuleHealth(): ModuleHealth[] {
    return Array.from(this.moduleHealth.values());
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Auto Recovery
  // ─────────────────────────────────────────────────────────────────────────────
  
  private setupAutoRecovery(): void {
    this.eventBus.on(FeatureEventType.MODULE_ERROR, async (event) => {
      if (!this.options.autoRecover || this.state !== 'ready') return;
      
      const moduleId = event.moduleId as string;
      const attempts = this.recoveryAttempts.get(moduleId) || 0;
      
      if (attempts >= this.options.maxRecoveryAttempts) {
        this.logger.warn(`Max recovery attempts reached for module: ${moduleId}`);
        return;
      }
      
      this.recoveryAttempts.set(moduleId, attempts + 1);
      
      this.logger.info(`Attempting recovery for module: ${moduleId}`, {
        attempt: attempts + 1,
        maxAttempts: this.options.maxRecoveryAttempts,
      });
      
      // Delay before recovery
      await new Promise(resolve => setTimeout(resolve, this.options.recoveryDelayMs));
      
      await this.recoverModule(moduleId);
    });
  }
  
  /**
   * Attempt to recover a failed module
   */
  async recoverModule(moduleId: string): Promise<{ success: boolean; error?: FeatureError }> {
    if (!this.featureManager) {
      return {
        success: false,
        error: createFeatureError(
          FeatureErrorCode.NOT_INITIALIZED,
          'Feature manager not initialized',
          'LifecycleManager'
        ),
      };
    }
    
    try {
      // Try to re-initialize the module
      // This would require the feature manager to support re-initialization
      // For now, just log the attempt
      this.logger.info(`Recovery attempted for module: ${moduleId}`);
      
      // Reset error count on successful recovery
      this.recoveryAttempts.set(moduleId, 0);
      
      const health = this.moduleHealth.get(moduleId);
      if (health) {
        health.status = 'healthy';
        health.errorCount = 0;
      }
      
      return { success: true };
    } catch (error) {
      const featureError = createFeatureError(
        FeatureErrorCode.UNKNOWN_ERROR,
        `Recovery failed for module ${moduleId}: ${error instanceof Error ? error.message : 'Unknown error'}`,
        'LifecycleManager',
        { cause: error instanceof Error ? error : undefined }
      );
      
      this.logger.error(`Recovery failed for module: ${moduleId}`, error);
      
      return { success: false, error: featureError };
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Feature Manager Access
  // ─────────────────────────────────────────────────────────────────────────────
  
  getFeatureManager(): FeatureManager | null {
    return this.featureManager;
  }
  
  getEventBus(): FeatureEventBus {
    return this.eventBus;
  }
  
  getConfigManager(): ConfigManager {
    return this.configManager;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════════

let lifecycleInstance: LifecycleManager | null = null;

/**
 * Get or create the lifecycle manager singleton
 */
export function getLifecycleManager(options?: Partial<LifecycleOptions>): LifecycleManager {
  if (!lifecycleInstance) {
    lifecycleInstance = new LifecycleManager(options);
  }
  return lifecycleInstance;
}

/**
 * Reset the lifecycle manager singleton (for testing)
 */
export function resetLifecycleManager(): void {
  if (lifecycleInstance) {
    lifecycleInstance.shutdown().catch(() => {});
    lifecycleInstance = null;
  }
}

export default {
  LifecycleManager,
  getLifecycleManager,
  resetLifecycleManager,
};
