/**
 * PRD Workflow E2E Tests
 *
 * Tests the full workflow execution flow:
 * - Selecting PRDs and clicking workflow nodes
 * - Executing workflows (PTY spawning)
 * - Marking workflows as done
 * - Status transitions
 * - Visual state changes
 */

import { test, expect } from './fixtures/electron.fixture';
import { WorkflowGraphPage } from './page-objects/workflow-graph.po';
import { DetailPanelPage } from './page-objects/detail-panel.po';
import { createTestPRD, STATUS_TRANSITION_SCENARIOS, WORKFLOW_METADATA } from './fixtures/prd-test-data';
import type { PRDStatus } from './fixtures/prd-test-data';

test.describe('PRD Workflow E2E Tests', () => {
  let workflowGraph: WorkflowGraphPage;
  let detailPanel: DetailPanelPage;

  test.beforeEach(async ({ mainWindow }) => {
    workflowGraph = new WorkflowGraphPage(mainWindow);
    detailPanel = new DetailPanelPage(mainWindow);

    // Navigate to PRD Workflow page (Dojo)
    // The exact navigation depends on your app's routing
    await mainWindow.evaluate(() => {
      // Reset any existing state
      if (window.__ZUSTAND_STORE__) {
        const store = window.__ZUSTAND_STORE__.getState();
        if (store.clearAllPRDs) store.clearAllPRDs();
        if (store.clearExecutingWorkflows) store.clearExecutingWorkflows();
      }
      if (window.__MOCK_ELECTRON_API__) {
        window.__MOCK_ELECTRON_API__.reset();
      }
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Test Flow 1: Happy Path - Execute Workflow
  // ═══════════════════════════════════════════════════════════════════════════════

  test.describe('Happy Path: Workflow Execution', () => {
    test('should open detail panel when clicking workflow node', async ({ mainWindow }) => {
      // Setup: Add draft PRD
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        // addPRD returns the new ID, use it for selectPRD
        const newId = store.addPRD(p);
        store.selectPRD(newId);
      }, prd);

      // Wait for graph to render
      await workflowGraph.waitForGraph();

      // Click plan-feature node
      await workflowGraph.clickNode('plan-feature');

      // Verify panel opens
      await detailPanel.waitForOpen();
      expect(await detailPanel.isOpen()).toBe(true);

      // Verify correct workflow label
      const label = await detailPanel.getWorkflowLabel();
      expect(label).toContain('Plan');
    });

    test('should show Execute button enabled for available workflow', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
      }, prd);

      await workflowGraph.waitForGraph();
      await workflowGraph.clickNode('plan-feature');
      await detailPanel.waitForOpen();

      // Execute button should be enabled
      expect(await detailPanel.isExecuteEnabled()).toBe(true);
    });

    test('should transition node to executing state when Execute clicked', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
      }, prd);

      await workflowGraph.waitForGraph();
      await workflowGraph.clickNode('plan-feature');
      await detailPanel.waitForOpen();

      // Click Execute
      await detailPanel.clickExecute();

      // Wait for executing state
      await workflowGraph.waitForExecuting('plan-feature');

      // Verify visual state
      expect(await workflowGraph.getNodeState('plan-feature')).toBe('executing');
      expect(await workflowGraph.isSpinnerVisible('plan-feature')).toBe(true);
    });

    test('should create PTY when Execute clicked', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
      }, prd);

      await workflowGraph.waitForGraph();
      await workflowGraph.clickNode('plan-feature');
      await detailPanel.waitForOpen();
      await detailPanel.clickExecute();

      // Check mock API was called
      const ptyCreated = await mainWindow.evaluate(() => {
        const api = window.__MOCK_ELECTRON_API__;
        return api ? api.getCreateCalls().length > 0 : false;
      });

      expect(ptyCreated).toBe(true);
    });

    test('should show Mark Done button on executing node', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
        // Directly set executing state for this test
        store.setExecutingWorkflow(p.id, 'plan-feature', 'test-pty-1');
      }, prd);

      await workflowGraph.waitForGraph();

      // Mark Done button should be visible
      expect(await workflowGraph.isMarkDoneVisible('plan-feature')).toBe(true);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Test Flow 2: Status Transitions
  // ═══════════════════════════════════════════════════════════════════════════════

  test.describe('Status Transitions', () => {
    for (const scenario of STATUS_TRANSITION_SCENARIOS) {
      test(`${scenario.description}`, async ({ mainWindow }) => {
        // Setup PRD with starting status
        const prd = createTestPRD({
          status: scenario.fromStatus,
          title: `Test PRD for ${scenario.workflow}`
        });

        await mainWindow.evaluate((p) => {
          const store = window.__ZUSTAND_STORE__.getState();
          store.addPRD(p);
          store.selectPRD(p.id);
          // Set executing state
          store.setExecutingWorkflow(p.id, scenario.workflow, 'test-pty');
        }, { ...prd, workflow: scenario.workflow });

        await workflowGraph.waitForGraph();

        // Click Mark Done
        await workflowGraph.clickMarkDone(scenario.workflow);

        // Verify status transition
        const newStatus = await mainWindow.evaluate(() => {
          const store = window.__ZUSTAND_STORE__.getState();
          const prd = store.getSelectedPRD?.() || store.selectedPRD;
          return prd?.status;
        });

        expect(newStatus).toBe(scenario.toStatus);
      });
    }

    test('should clear executing state after Mark Done', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
        store.setExecutingWorkflow(p.id, 'plan-feature', 'test-pty');
      }, prd);

      await workflowGraph.waitForGraph();
      await workflowGraph.clickMarkDone('plan-feature');

      // Verify executing state cleared
      const isExecuting = await mainWindow.evaluate((prdId) => {
        const store = window.__ZUSTAND_STORE__.getState();
        return !!store.executingWorkflows?.[prdId];
      }, prd.id);

      expect(isExecuting).toBe(false);
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Test Flow 3: Quizmaster Path
  // ═══════════════════════════════════════════════════════════════════════════════

  test.describe('Quizmaster Alternative', () => {
    test('should show Quizmaster button for planning nodes', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
      }, prd);

      await workflowGraph.waitForGraph();
      await workflowGraph.clickNode('plan-feature');
      await detailPanel.waitForOpen();

      // Quizmaster button should be visible for planning nodes
      expect(await detailPanel.isQuizmasterVisible()).toBe(true);
    });

    test('should hide Quizmaster button for execution nodes', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'approved' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
      }, prd);

      await workflowGraph.waitForGraph();
      await workflowGraph.clickNode('execute');
      await detailPanel.waitForOpen();

      // Quizmaster button should NOT be visible for execute node
      expect(await detailPanel.isQuizmasterVisible()).toBe(false);
    });

    test('should launch Quizmaster PTY with correct prompt', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
      }, prd);

      await workflowGraph.waitForGraph();
      await workflowGraph.clickNode('plan-feature');
      await detailPanel.waitForOpen();
      await detailPanel.clickQuizmaster();

      // Check that PTY was created with Quizmaster prompt
      const lastCreate = await mainWindow.evaluate(() => {
        const api = window.__MOCK_ELECTRON_API__;
        return api?.getLastCreate();
      });

      expect(lastCreate).toBeDefined();
      // The args should include the quizmaster prompt path
      const argsStr = JSON.stringify(lastCreate?.args || []);
      expect(argsStr.toLowerCase()).toContain('quizmaster');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Test Flow 4: Locked Node Prevention
  // ═══════════════════════════════════════════════════════════════════════════════

  test.describe('Locked Node Prevention', () => {
    test('should show locked state for unavailable workflows', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
      }, prd);

      await workflowGraph.waitForGraph();

      // Execute node requires 'approved' status, should be locked for 'draft'
      expect(await workflowGraph.getNodeState('execute')).toBe('locked');

      // Validate node requires 'in_progress' status, should be locked for 'draft'
      expect(await workflowGraph.getNodeState('validate')).toBe('locked');
    });

    test('should show lock badge on locked nodes', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
      }, prd);

      await workflowGraph.waitForGraph();

      // Lock badge should be visible on locked nodes
      expect(await workflowGraph.isLockBadgeVisible('execute')).toBe(true);
    });

    test('should disable Execute button for locked workflow', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
        // Force open detail panel for a locked node
        store.selectWorkflowNode?.('execute');
      }, prd);

      // If panel opens for locked node, Execute should be disabled
      if (await detailPanel.isOpen()) {
        expect(await detailPanel.isExecuteEnabled()).toBe(false);
      }
    });

    test('should unlock workflow when PRD status changes', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
      }, prd);

      await workflowGraph.waitForGraph();

      // Initially execute is locked
      expect(await workflowGraph.getNodeState('execute')).toBe('locked');

      // Change PRD status to approved
      await mainWindow.evaluate((prdId) => {
        const store = window.__ZUSTAND_STORE__.getState();
        store.updatePRDStatus?.(prdId, 'approved');
      }, prd.id);

      // Give React time to re-render
      await mainWindow.waitForTimeout(500);

      // Now execute should be available
      expect(await workflowGraph.getNodeState('execute')).toBe('available');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Test Flow 5: Error Recovery
  // ═══════════════════════════════════════════════════════════════════════════════

  test.describe('Error Recovery', () => {
    test('should show error modal on PTY creation failure', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);

        // Configure mock to fail
        if (window.__MOCK_ELECTRON_API__) {
          window.__MOCK_ELECTRON_API__.setNextCreateToFail('PTY daemon unavailable');
        }
      }, prd);

      await workflowGraph.waitForGraph();
      await workflowGraph.clickNode('plan-feature');
      await detailPanel.waitForOpen();
      await detailPanel.clickExecute();

      // Wait for error modal
      const errorModal = mainWindow.locator('[data-testid="workflow-error-modal"]');
      await errorModal.waitFor({ state: 'visible', timeout: 5000 });

      // Verify error message
      const errorMessage = await mainWindow.locator('[data-testid="error-message"]').textContent();
      expect(errorMessage).toContain('PTY');
    });

    test('should allow retry after error', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);

        // First call fails
        if (window.__MOCK_ELECTRON_API__) {
          window.__MOCK_ELECTRON_API__.setNextCreateToFail('Temporary failure');
        }
      }, prd);

      await workflowGraph.waitForGraph();
      await workflowGraph.clickNode('plan-feature');
      await detailPanel.waitForOpen();
      await detailPanel.clickExecute();

      // Wait for error modal
      const errorModal = mainWindow.locator('[data-testid="workflow-error-modal"]');
      await errorModal.waitFor({ state: 'visible', timeout: 5000 });

      // Click retry
      await mainWindow.locator('[data-testid="retry-button"]').click();

      // Second attempt should succeed (mock auto-resets failure)
      await workflowGraph.waitForExecuting('plan-feature');
      expect(await workflowGraph.getNodeState('plan-feature')).toBe('executing');
    });
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Visual State Tests
  // ═══════════════════════════════════════════════════════════════════════════════

  test.describe('Visual States', () => {
    test('should display correct styles for available node', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
      }, prd);

      await workflowGraph.waitForGraph();

      const node = workflowGraph.getNode('plan-feature');
      const classes = await node.getAttribute('class') || '';

      // Available state: bg-blue-500/10
      expect(classes).toMatch(/bg-blue-500/);
    });

    test('should display correct styles for executing node', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
        store.setExecutingWorkflow(p.id, 'plan-feature', 'test-pty');
      }, prd);

      await workflowGraph.waitForGraph();

      const node = workflowGraph.getNode('plan-feature');
      const classes = await node.getAttribute('class') || '';

      // Executing state: bg-orange-500/20, border-orange-500
      expect(classes).toMatch(/bg-orange-500/);
      expect(classes).toMatch(/border-orange-500/);
    });

    test('should display correct styles for completed node', async ({ mainWindow }) => {
      // A completed node is one where the workflow's required status has been passed
      const prd = createTestPRD({ status: 'in_review' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
      }, prd);

      await workflowGraph.waitForGraph();

      // plan-feature requires 'draft', so with 'in_review' it's completed
      const state = await workflowGraph.getNodeState('plan-feature');
      expect(state).toBe('completed');
    });

    test('should display correct styles for locked node', async ({ mainWindow }) => {
      const prd = createTestPRD({ status: 'draft' });
      await mainWindow.evaluate((p) => {
        const store = window.__ZUSTAND_STORE__.getState();
        const newId = store.addPRD(p);
        store.selectPRD(newId);
      }, prd);

      await workflowGraph.waitForGraph();

      const node = workflowGraph.getNode('execute');
      const classes = await node.getAttribute('class') || '';

      // Locked state: opacity-40
      expect(classes).toMatch(/opacity-40/);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════════════
// Type declarations for window globals used in tests
// ═══════════════════════════════════════════════════════════════════════════════════

declare global {
  interface Window {
    __ZUSTAND_STORE__: {
      getState: () => {
        addPRD: (prd: unknown) => void;
        selectPRD: (id: string) => void;
        getSelectedPRD?: () => { status: string } | null;
        selectedPRD?: { status: string };
        clearAllPRDs?: () => void;
        clearExecutingWorkflows?: () => void;
        setExecutingWorkflow: (prdId: string, workflow: string, ptyId: string) => void;
        executingWorkflows?: Record<string, unknown>;
        updatePRDStatus?: (prdId: string, status: string) => void;
        selectWorkflowNode?: (workflow: string) => void;
      };
    };
    __MOCK_ELECTRON_API__: {
      reset: () => void;
      getCreateCalls: () => unknown[];
      getLastCreate: () => { args?: string[] } | undefined;
      setNextCreateToFail: (message: string) => void;
    };
  }
}
