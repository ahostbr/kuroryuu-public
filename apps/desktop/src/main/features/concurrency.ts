/**
 * Concurrent Access Manager
 * 
 * Manages concurrent access to shared resources:
 * - Microphone locking
 * - Queue management
 * - Timeout handling
 * 
 * Requirements: 8.6, 8.7
 */

import { getLogger } from './logger';
import { FeatureErrorCode, createFeatureError, type FeatureError } from './errors';

// ═══════════════════════════════════════════════════════════════════════════════
// Types
// ═══════════════════════════════════════════════════════════════════════════════

export type ResourceType = 'microphone' | 'speaker' | 'screen' | 'camera';

export interface ResourceLock {
  resourceType: ResourceType;
  ownerId: string;
  acquiredAt: string;
  expiresAt?: string;
}

export interface QueuedRequest<T = unknown> {
  id: string;
  resourceType: ResourceType;
  requesterId: string;
  params: T;
  priority: number;
  createdAt: string;
  timeoutMs: number;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

export interface ConcurrencyOptions {
  /** Default timeout for resource acquisition in ms */
  defaultTimeoutMs: number;
  /** Max queue size per resource */
  maxQueueSize: number;
  /** Enable priority queuing */
  enablePriority: boolean;
  /** Lock expiry time in ms (0 = no expiry) */
  lockExpiryMs: number;
}

// ═══════════════════════════════════════════════════════════════════════════════
// Default Options
// ═══════════════════════════════════════════════════════════════════════════════

const DEFAULT_OPTIONS: ConcurrencyOptions = {
  defaultTimeoutMs: 30000,
  maxQueueSize: 10,
  enablePriority: true,
  lockExpiryMs: 60000,
};

// ═══════════════════════════════════════════════════════════════════════════════
// Concurrent Access Manager
// ═══════════════════════════════════════════════════════════════════════════════

export class ConcurrentAccessManager {
  private options: ConcurrencyOptions;
  private logger = getLogger('ConcurrentAccessManager');
  private locks: Map<ResourceType, ResourceLock> = new Map();
  private queues: Map<ResourceType, QueuedRequest[]> = new Map();
  private requestCounter = 0;
  private expiryTimers: Map<ResourceType, NodeJS.Timeout> = new Map();
  
  constructor(options: Partial<ConcurrencyOptions> = {}) {
    this.options = { ...DEFAULT_OPTIONS, ...options };
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Lock Management
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Acquire a lock on a resource
   * Requirements: 8.6
   */
  async acquireLock(
    resourceType: ResourceType,
    ownerId: string,
    timeoutMs?: number
  ): Promise<{ success: boolean; error?: FeatureError }> {
    const timeout = timeoutMs ?? this.options.defaultTimeoutMs;
    
    // Check if already locked by same owner
    const existingLock = this.locks.get(resourceType);
    if (existingLock && existingLock.ownerId === ownerId) {
      // Refresh the lock
      this.refreshLock(resourceType, ownerId);
      return { success: true };
    }
    
    // Check if locked by another owner
    if (existingLock && !this.isLockExpired(existingLock)) {
      // Queue the request
      return this.queueForLock(resourceType, ownerId, timeout);
    }
    
    // Acquire the lock
    this.setLock(resourceType, ownerId);
    this.logger.debug(`Lock acquired: ${resourceType} by ${ownerId}`);
    
    return { success: true };
  }
  
  /**
   * Release a lock on a resource
   */
  releaseLock(resourceType: ResourceType, ownerId: string): boolean {
    const lock = this.locks.get(resourceType);
    
    if (!lock) {
      return false;
    }
    
    if (lock.ownerId !== ownerId) {
      this.logger.warn(`Cannot release lock: owner mismatch`, {
        resourceType,
        lockOwner: lock.ownerId,
        requestedBy: ownerId,
      });
      return false;
    }
    
    this.locks.delete(resourceType);
    this.clearExpiryTimer(resourceType);
    
    this.logger.debug(`Lock released: ${resourceType} by ${ownerId}`);
    
    // Process next queued request
    this.processQueue(resourceType);
    
    return true;
  }
  
  /**
   * Check if a resource is locked
   */
  isLocked(resourceType: ResourceType): boolean {
    const lock = this.locks.get(resourceType);
    return lock !== undefined && !this.isLockExpired(lock);
  }
  
  /**
   * Get lock info for a resource
   */
  getLockInfo(resourceType: ResourceType): ResourceLock | null {
    const lock = this.locks.get(resourceType);
    if (lock && !this.isLockExpired(lock)) {
      return { ...lock };
    }
    return null;
  }
  
  /**
   * Get all current locks
   */
  getAllLocks(): ResourceLock[] {
    const locks: ResourceLock[] = [];
    for (const lock of this.locks.values()) {
      if (!this.isLockExpired(lock)) {
        locks.push({ ...lock });
      }
    }
    return locks;
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Queue Management
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Get queue length for a resource
   */
  getQueueLength(resourceType: ResourceType): number {
    return this.queues.get(resourceType)?.length ?? 0;
  }
  
  /**
   * Clear queue for a resource
   */
  clearQueue(resourceType: ResourceType): number {
    const queue = this.queues.get(resourceType);
    if (!queue) return 0;
    
    const count = queue.length;
    
    // Reject all queued requests
    for (const request of queue) {
      request.reject(createFeatureError(
        FeatureErrorCode.CANCELLED,
        'Queue cleared',
        'ConcurrentAccessManager'
      ));
    }
    
    this.queues.delete(resourceType);
    return count;
  }
  
  private async queueForLock(
    resourceType: ResourceType,
    ownerId: string,
    timeoutMs: number,
    priority: number = 0
  ): Promise<{ success: boolean; error?: FeatureError }> {
    // Check queue size limit
    const queue = this.queues.get(resourceType) || [];
    
    if (queue.length >= this.options.maxQueueSize) {
      return {
        success: false,
        error: createFeatureError(
          FeatureErrorCode.RESOURCE_EXHAUSTED,
          `Queue full for resource: ${resourceType}`,
          'ConcurrentAccessManager'
        ),
      };
    }
    
    return new Promise((resolve) => {
      const requestId = `req_${++this.requestCounter}`;
      
      const request: QueuedRequest = {
        id: requestId,
        resourceType,
        requesterId: ownerId,
        params: {},
        priority: this.options.enablePriority ? priority : 0,
        createdAt: new Date().toISOString(),
        timeoutMs,
        resolve: (value) => resolve(value as { success: boolean; error?: FeatureError }),
        reject: (error) => resolve({
          success: false,
          error: error as FeatureError,
        }),
      };
      
      // Add to queue (sorted by priority if enabled)
      queue.push(request);
      if (this.options.enablePriority) {
        queue.sort((a, b) => b.priority - a.priority);
      }
      this.queues.set(resourceType, queue);
      
      this.logger.debug(`Request queued: ${requestId} for ${resourceType}`, {
        queueLength: queue.length,
      });
      
      // Set timeout
      setTimeout(() => {
        this.removeFromQueue(resourceType, requestId);
        request.reject(createFeatureError(
          FeatureErrorCode.TIMEOUT,
          `Timeout waiting for resource: ${resourceType}`,
          'ConcurrentAccessManager'
        ));
      }, timeoutMs);
    });
  }
  
  private processQueue(resourceType: ResourceType): void {
    const queue = this.queues.get(resourceType);
    if (!queue || queue.length === 0) return;
    
    // Check if resource is now available
    if (this.isLocked(resourceType)) return;
    
    // Get next request
    const request = queue.shift();
    if (!request) return;
    
    // Acquire lock for requester
    this.setLock(resourceType, request.requesterId);
    
    this.logger.debug(`Queue processed: ${request.id} acquired ${resourceType}`);
    
    request.resolve({ success: true });
  }
  
  private removeFromQueue(resourceType: ResourceType, requestId: string): void {
    const queue = this.queues.get(resourceType);
    if (!queue) return;
    
    const index = queue.findIndex(r => r.id === requestId);
    if (index !== -1) {
      queue.splice(index, 1);
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Lock Helpers
  // ─────────────────────────────────────────────────────────────────────────────
  
  private setLock(resourceType: ResourceType, ownerId: string): void {
    const now = new Date();
    const expiresAt = this.options.lockExpiryMs > 0
      ? new Date(now.getTime() + this.options.lockExpiryMs).toISOString()
      : undefined;
    
    this.locks.set(resourceType, {
      resourceType,
      ownerId,
      acquiredAt: now.toISOString(),
      expiresAt,
    });
    
    // Set expiry timer
    if (this.options.lockExpiryMs > 0) {
      this.setExpiryTimer(resourceType);
    }
  }
  
  private refreshLock(resourceType: ResourceType, ownerId: string): void {
    const lock = this.locks.get(resourceType);
    if (lock && lock.ownerId === ownerId) {
      this.setLock(resourceType, ownerId);
    }
  }
  
  private isLockExpired(lock: ResourceLock): boolean {
    if (!lock.expiresAt) return false;
    return new Date(lock.expiresAt) < new Date();
  }
  
  private setExpiryTimer(resourceType: ResourceType): void {
    this.clearExpiryTimer(resourceType);
    
    const timer = setTimeout(() => {
      const lock = this.locks.get(resourceType);
      if (lock && this.isLockExpired(lock)) {
        this.logger.info(`Lock expired: ${resourceType} by ${lock.ownerId}`);
        this.locks.delete(resourceType);
        this.processQueue(resourceType);
      }
    }, this.options.lockExpiryMs);
    
    this.expiryTimers.set(resourceType, timer);
  }
  
  private clearExpiryTimer(resourceType: ResourceType): void {
    const timer = this.expiryTimers.get(resourceType);
    if (timer) {
      clearTimeout(timer);
      this.expiryTimers.delete(resourceType);
    }
  }
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Cleanup
  // ─────────────────────────────────────────────────────────────────────────────
  
  /**
   * Clear all locks and queues
   */
  clearAll(): void {
    // Clear expiry timers
    for (const timer of this.expiryTimers.values()) {
      clearTimeout(timer);
    }
    this.expiryTimers.clear();
    
    // Clear all queues (reject pending)
    for (const [resourceType] of this.queues) {
      this.clearQueue(resourceType);
    }
    
    // Clear locks
    this.locks.clear();
    
    this.logger.info('All locks and queues cleared');
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// Singleton Instance
// ═══════════════════════════════════════════════════════════════════════════════

let accessManagerInstance: ConcurrentAccessManager | null = null;

export function getConcurrentAccessManager(options?: Partial<ConcurrencyOptions>): ConcurrentAccessManager {
  if (!accessManagerInstance) {
    accessManagerInstance = new ConcurrentAccessManager(options);
  }
  return accessManagerInstance;
}

export function resetConcurrentAccessManager(): void {
  if (accessManagerInstance) {
    accessManagerInstance.clearAll();
    accessManagerInstance = null;
  }
}

export default {
  ConcurrentAccessManager,
  getConcurrentAccessManager,
  resetConcurrentAccessManager,
};
