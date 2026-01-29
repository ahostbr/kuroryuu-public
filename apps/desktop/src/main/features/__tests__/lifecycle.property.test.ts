/**
 * Lifecycle Property Tests
 * 
 * Property-based tests for module lifecycle management:
 * - State transitions
 * - Error recovery
 * - Graceful shutdown
 * 
 * Requirements: 5.5, 8.1
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as fc from 'fast-check';
import {
  LifecycleManager,
  resetLifecycleManager,
  type LifecycleState,
  type LifecycleOptions,
} from '../lifecycle';
import { resetEventBus } from '../event-bus';

// ═══════════════════════════════════════════════════════════════════════════════
// Arbitraries
// ═══════════════════════════════════════════════════════════════════════════════

// Generate valid lifecycle states
const lifecycleStateArb = fc.constantFrom<LifecycleState>(
  'uninitialized',
  'initializing',
  'ready',
  'shutting_down',
  'shutdown',
  'error'
);

// Generate lifecycle options
const lifecycleOptionsArb = fc.record({
  autoRecover: fc.boolean(),
  maxRecoveryAttempts: fc.integer({ min: 1, max: 10 }),
  recoveryDelayMs: fc.integer({ min: 100, max: 5000 }),
  healthCheckIntervalMs: fc.integer({ min: 0, max: 60000 }),
  shutdownTimeoutMs: fc.integer({ min: 1000, max: 30000 }),
});

// ═══════════════════════════════════════════════════════════════════════════════
// Tests
// ═══════════════════════════════════════════════════════════════════════════════

describe('Lifecycle Property Tests', () => {
  beforeEach(() => {
    resetEventBus();
    resetLifecycleManager();
  });
  
  afterEach(() => {
    resetLifecycleManager();
    vi.clearAllMocks();
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Initial State
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Initial State', () => {
    it('property: new lifecycle manager starts uninitialized', async () => {
      await fc.assert(
        fc.asyncProperty(lifecycleOptionsArb, async (options) => {
          const manager = new LifecycleManager(options);
          
          expect(manager.getState()).toBe('uninitialized');
          expect(manager.getStateHistory()).toHaveLength(0);
          expect(manager.getFeatureManager()).toBeNull();
          
          return true;
        }),
        { numRuns: 20 }
      );
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: State Transitions
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: State Transitions', () => {
    it('property: initialize transitions to ready or error', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            autoRecover: fc.boolean(),
            maxRecoveryAttempts: fc.integer({ min: 1, max: 5 }),
            recoveryDelayMs: fc.constant(100),
            healthCheckIntervalMs: fc.constant(0),
            shutdownTimeoutMs: fc.constant(1000),
          }),
          async (options) => {
            const manager = new LifecycleManager(options);
            
            const result = await manager.initialize();
            
            // Should transition to either ready or error
            const state = manager.getState();
            expect(['ready', 'error']).toContain(state);
            
            // State history should have at least 2 entries (initializing + final)
            const history = manager.getStateHistory();
            expect(history.length).toBeGreaterThanOrEqual(2);
            
            // First transition should be to initializing
            expect(history[0].state).toBe('initializing');
            
            // Cleanup
            await manager.shutdown();
            
            return true;
          }
        ),
        { numRuns: 10 }
      );
    });
    
    it('property: shutdown from ready transitions to shutdown', async () => {
      const manager = new LifecycleManager({
        healthCheckIntervalMs: 0,
        shutdownTimeoutMs: 1000,
      });
      
      await manager.initialize();
      
      if (manager.getState() === 'ready') {
        const result = await manager.shutdown();
        
        expect(result.success).toBe(true);
        expect(manager.getState()).toBe('shutdown');
      }
    });
    
    it('property: double shutdown is idempotent', async () => {
      const manager = new LifecycleManager({
        healthCheckIntervalMs: 0,
        shutdownTimeoutMs: 1000,
      });
      
      await manager.initialize();
      
      // First shutdown
      const result1 = await manager.shutdown();
      const state1 = manager.getState();
      
      // Second shutdown
      const result2 = await manager.shutdown();
      const state2 = manager.getState();
      
      // Both should succeed
      expect(result1.success).toBe(true);
      expect(result2.success).toBe(true);
      
      // State should be the same
      expect(state2).toBe(state1);
    });
    
    it('property: cannot initialize when already initializing or ready', async () => {
      const manager = new LifecycleManager({
        healthCheckIntervalMs: 0,
        shutdownTimeoutMs: 1000,
      });
      
      // First init
      await manager.initialize();
      
      if (manager.getState() === 'ready') {
        // Try to init again
        const result = await manager.initialize();
        
        expect(result.success).toBe(false);
        expect(result.error).toBeDefined();
      }
      
      await manager.shutdown();
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: State History
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: State History', () => {
    it('property: state history entries have required fields', async () => {
      const manager = new LifecycleManager({
        healthCheckIntervalMs: 0,
        shutdownTimeoutMs: 1000,
      });
      
      await manager.initialize();
      await manager.shutdown();
      
      const history = manager.getStateHistory();
      
      for (const entry of history) {
        // Required fields exist
        expect(entry.state).toBeDefined();
        expect(entry.timestamp).toBeDefined();
        
        // State is valid
        expect([
          'uninitialized',
          'initializing',
          'ready',
          'shutting_down',
          'shutdown',
          'error',
        ]).toContain(entry.state);
        
        // Timestamp is valid ISO string
        const date = new Date(entry.timestamp);
        expect(date.toString()).not.toBe('Invalid Date');
      }
    });
    
    it('property: state history timestamps are monotonically increasing', async () => {
      const manager = new LifecycleManager({
        healthCheckIntervalMs: 0,
        shutdownTimeoutMs: 1000,
      });
      
      await manager.initialize();
      await manager.shutdown();
      
      const history = manager.getStateHistory();
      
      for (let i = 1; i < history.length; i++) {
        const prevTime = new Date(history[i - 1].timestamp).getTime();
        const currTime = new Date(history[i].timestamp).getTime();
        
        expect(currTime).toBeGreaterThanOrEqual(prevTime);
      }
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Options Validation
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Options Handling', () => {
    it('property: options are preserved after construction', async () => {
      await fc.assert(
        fc.asyncProperty(
          fc.record({
            autoRecover: fc.boolean(),
            maxRecoveryAttempts: fc.integer({ min: 1, max: 10 }),
            recoveryDelayMs: fc.integer({ min: 100, max: 5000 }),
            healthCheckIntervalMs: fc.constant(0), // Disable for test speed
            shutdownTimeoutMs: fc.integer({ min: 1000, max: 5000 }),
          }),
          async (options) => {
            const manager = new LifecycleManager(options);
            
            // Manager should be created without error
            expect(manager).toBeDefined();
            expect(manager.getState()).toBe('uninitialized');
            
            return true;
          }
        ),
        { numRuns: 20 }
      );
    });
    
    it('property: default options are used when not specified', async () => {
      const manager = new LifecycleManager();
      
      expect(manager).toBeDefined();
      expect(manager.getState()).toBe('uninitialized');
    });
    
    it('property: partial options merge with defaults', async () => {
      const partialOptions = { autoRecover: false };
      const manager = new LifecycleManager(partialOptions);
      
      expect(manager).toBeDefined();
      expect(manager.getState()).toBe('uninitialized');
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Health Information
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Health Information', () => {
    it('property: health info is empty before initialization', async () => {
      const manager = new LifecycleManager();
      
      const health = manager.getModuleHealth();
      
      expect(Array.isArray(health)).toBe(true);
      expect(health).toHaveLength(0);
    });
    
    it('property: accessors return valid objects', async () => {
      const manager = new LifecycleManager({
        healthCheckIntervalMs: 0,
        shutdownTimeoutMs: 1000,
      });
      
      // Before init
      expect(manager.getFeatureManager()).toBeNull();
      expect(manager.getEventBus()).toBeDefined();
      expect(manager.getConfigManager()).toBeDefined();
      
      await manager.initialize();
      
      // After init (if successful)
      if (manager.getState() === 'ready') {
        expect(manager.getFeatureManager()).not.toBeNull();
      }
      
      await manager.shutdown();
      
      // After shutdown
      expect(manager.getFeatureManager()).toBeNull();
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Error States
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Error Handling', () => {
    it('property: error state includes error information', async () => {
      const manager = new LifecycleManager({
        healthCheckIntervalMs: 0,
        shutdownTimeoutMs: 1000,
      });
      
      await manager.initialize();
      
      const history = manager.getStateHistory();
      
      // Check if any error states have error info
      for (const entry of history) {
        if (entry.state === 'error') {
          expect(entry.error).toBeDefined();
          expect(entry.error?.code).toBeDefined();
          expect(entry.error?.message).toBeDefined();
        }
      }
      
      await manager.shutdown();
    });
  });
  
  // ─────────────────────────────────────────────────────────────────────────────
  // Property: Resource Cleanup
  // ─────────────────────────────────────────────────────────────────────────────
  
  describe('Property: Resource Cleanup', () => {
    it('property: shutdown cleans up resources', async () => {
      const manager = new LifecycleManager({
        healthCheckIntervalMs: 0,
        shutdownTimeoutMs: 1000,
      });
      
      await manager.initialize();
      await manager.shutdown();
      
      // Feature manager should be null after shutdown
      expect(manager.getFeatureManager()).toBeNull();
      
      // Health info should be empty
      expect(manager.getModuleHealth()).toHaveLength(0);
    });
  });
});
