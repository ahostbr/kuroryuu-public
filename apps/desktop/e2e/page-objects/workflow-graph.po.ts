import type { Page, Locator } from '@playwright/test';

/**
 * Page Object for the PRD Workflow Graph component
 * Handles interaction with workflow nodes and their visual states
 */
export class WorkflowGraphPage {
  readonly page: Page;

  constructor(page: Page) {
    this.page = page;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Node Locators
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Get a workflow node by its workflow ID
   */
  getNode(workflowId: string): Locator {
    return this.page.locator(`[data-workflow="${workflowId}"]`);
  }

  /**
   * Get the workflow graph container
   */
  getGraph(): Locator {
    return this.page.locator('[data-testid="workflow-graph"]');
  }

  /**
   * Get all workflow nodes
   */
  getAllNodes(): Locator {
    return this.page.locator('[data-testid^="workflow-node-"]');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // State-Based Node Locators
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Get node in available state (bg-blue-500/10)
   */
  getAvailableNode(workflowId: string): Locator {
    return this.getNode(workflowId).filter({
      has: this.page.locator('.bg-blue-500\\/10')
    });
  }

  /**
   * Get node in executing state (bg-orange-500/20)
   */
  getExecutingNode(workflowId: string): Locator {
    return this.getNode(workflowId).filter({
      has: this.page.locator('.bg-orange-500\\/20')
    });
  }

  /**
   * Get node in completed state (bg-green-500/10)
   */
  getCompletedNode(workflowId: string): Locator {
    return this.getNode(workflowId).filter({
      has: this.page.locator('.bg-green-500\\/10')
    });
  }

  /**
   * Get node in locked state (opacity-40)
   */
  getLockedNode(workflowId: string): Locator {
    return this.getNode(workflowId).filter({
      has: this.page.locator('.opacity-40')
    });
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Actions
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Click a workflow node to open the detail panel
   */
  async clickNode(workflowId: string): Promise<void> {
    await this.getNode(workflowId).click();
  }

  /**
   * Click the Mark Done button on an executing node
   */
  async clickMarkDone(workflowId: string): Promise<void> {
    const markDoneButton = this.getNode(workflowId).locator('button:has-text("Mark Done")');
    await markDoneButton.click();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // State Queries
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Check if a node is visible on the graph
   */
  async isNodeVisible(workflowId: string): Promise<boolean> {
    return this.getNode(workflowId).isVisible();
  }

  /**
   * Get the current visual state of a node
   */
  async getNodeState(workflowId: string): Promise<'available' | 'executing' | 'completed' | 'locked' | 'unknown'> {
    const node = this.getNode(workflowId);
    const classes = await node.getAttribute('class') || '';

    if (classes.includes('bg-orange-500')) return 'executing';
    if (classes.includes('bg-green-500')) return 'completed';
    if (classes.includes('opacity-40')) return 'locked';
    if (classes.includes('bg-blue-500')) return 'available';

    return 'unknown';
  }

  /**
   * Check if the Mark Done button is visible on a node
   */
  async isMarkDoneVisible(workflowId: string): Promise<boolean> {
    const markDoneButton = this.getNode(workflowId).locator('button:has-text("Mark Done")');
    return markDoneButton.isVisible();
  }

  /**
   * Check if the spinner badge is visible (executing state)
   */
  async isSpinnerVisible(workflowId: string): Promise<boolean> {
    const spinner = this.getNode(workflowId).locator('.animate-spin');
    return spinner.isVisible();
  }

  /**
   * Check if the lock badge is visible (locked state)
   */
  async isLockBadgeVisible(workflowId: string): Promise<boolean> {
    const lock = this.getNode(workflowId).locator('svg.lucide-lock');
    return lock.isVisible();
  }

  /**
   * Get the progress percentage if visible
   */
  async getProgress(workflowId: string): Promise<number | null> {
    const progressBar = this.getNode(workflowId).locator('[data-testid="progress-bar"]');
    const isVisible = await progressBar.isVisible();
    if (!isVisible) return null;

    const style = await progressBar.getAttribute('style') || '';
    const match = style.match(/width:\s*(\d+)%/);
    return match ? parseInt(match[1], 10) : null;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Wait Helpers
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Wait for the workflow graph to be visible
   */
  async waitForGraph(): Promise<void> {
    await this.getGraph().waitFor({ state: 'visible' });
  }

  /**
   * Wait for a node to enter executing state
   */
  async waitForExecuting(workflowId: string, timeout = 5000): Promise<void> {
    await this.getExecutingNode(workflowId).waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for a node to enter completed state
   */
  async waitForCompleted(workflowId: string, timeout = 5000): Promise<void> {
    await this.getCompletedNode(workflowId).waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for a node to become available (unlocked)
   */
  async waitForAvailable(workflowId: string, timeout = 5000): Promise<void> {
    await this.getAvailableNode(workflowId).waitFor({ state: 'visible', timeout });
  }
}
