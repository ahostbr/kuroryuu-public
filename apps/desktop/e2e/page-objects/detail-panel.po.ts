import type { Page, Locator } from '@playwright/test';

/**
 * Page Object for the Workflow Node Detail Panel
 * Handles interaction with the slide-in panel for workflow execution
 */
export class DetailPanelPage {
  readonly page: Page;

  // Selectors based on WorkflowNodeDetailPanel.tsx
  private readonly panelSelector = '[data-testid="node-detail-panel"]';
  private readonly executeButtonSelector = 'button:has-text("Execute")';
  private readonly quizmasterButtonSelector = 'button:has-text("Start with Quizmaster")';
  private readonly closeButtonSelector = 'button[aria-label="Close"], button:has(.lucide-x)';

  constructor(page: Page) {
    this.page = page;
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Element Locators
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Get the detail panel container
   */
  get panel(): Locator {
    return this.page.locator(this.panelSelector);
  }

  /**
   * Get the Execute button
   */
  get executeButton(): Locator {
    return this.panel.locator(this.executeButtonSelector);
  }

  /**
   * Get the Quizmaster button (only visible for planning nodes)
   */
  get quizmasterButton(): Locator {
    return this.panel.locator(this.quizmasterButtonSelector);
  }

  /**
   * Get the close button (X icon)
   */
  get closeButton(): Locator {
    return this.panel.locator(this.closeButtonSelector);
  }

  /**
   * Get the workflow label in the header
   */
  get workflowLabel(): Locator {
    return this.panel.locator('h3.font-semibold, [data-testid="workflow-label"]');
  }

  /**
   * Get the requirements section
   */
  get requirementsSection(): Locator {
    return this.panel.locator('[data-testid="requirements-section"]');
  }

  // ════════════════════════════════════════════════════════════════════════════
  // State Queries
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Check if the panel is currently open
   */
  async isOpen(): Promise<boolean> {
    return this.panel.isVisible();
  }

  /**
   * Check if the Execute button is enabled
   */
  async isExecuteEnabled(): Promise<boolean> {
    return this.executeButton.isEnabled();
  }

  /**
   * Check if the Quizmaster button is visible
   */
  async isQuizmasterVisible(): Promise<boolean> {
    return this.quizmasterButton.isVisible();
  }

  /**
   * Get the workflow label text
   */
  async getWorkflowLabel(): Promise<string> {
    const text = await this.workflowLabel.textContent();
    return text?.trim() || '';
  }

  /**
   * Check if requirements are met (green checkmark visible)
   */
  async areRequirementsMet(): Promise<boolean> {
    const greenCheck = this.panel.locator('.text-green-400, svg.lucide-check-circle-2.text-green');
    return (await greenCheck.count()) > 0;
  }

  /**
   * Get the current PRD status displayed
   */
  async getDisplayedStatus(): Promise<string> {
    const statusBadge = this.panel.locator('[data-testid="prd-status"], .capitalize');
    const text = await statusBadge.first().textContent();
    return text?.trim().toLowerCase().replace(' ', '_') || '';
  }

  /**
   * Check if the Execute button shows loading state
   */
  async isExecuteLoading(): Promise<boolean> {
    const loadingSpinner = this.executeButton.locator('.animate-spin, svg.lucide-loader-2');
    return loadingSpinner.isVisible();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Actions
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Click the Execute button
   */
  async clickExecute(): Promise<void> {
    await this.executeButton.click();
  }

  /**
   * Click the Quizmaster button
   */
  async clickQuizmaster(): Promise<void> {
    await this.quizmasterButton.click();
  }

  /**
   * Close the panel
   */
  async close(): Promise<void> {
    await this.closeButton.click();
    await this.waitForClose();
  }

  // ════════════════════════════════════════════════════════════════════════════
  // Wait Helpers
  // ════════════════════════════════════════════════════════════════════════════

  /**
   * Wait for the panel to open (become visible)
   */
  async waitForOpen(timeout = 5000): Promise<void> {
    await this.panel.waitFor({ state: 'visible', timeout });
  }

  /**
   * Wait for the panel to close (become hidden)
   */
  async waitForClose(timeout = 5000): Promise<void> {
    await this.panel.waitFor({ state: 'hidden', timeout });
  }

  /**
   * Wait for the Execute button to become enabled
   */
  async waitForExecuteEnabled(timeout = 5000): Promise<void> {
    await this.executeButton.waitFor({ state: 'visible', timeout });
    // Poll for enabled state
    await this.page.waitForFunction(
      (selector) => {
        const button = document.querySelector(selector) as HTMLButtonElement;
        return button && !button.disabled;
      },
      `${this.panelSelector} ${this.executeButtonSelector}`,
      { timeout }
    );
  }

  /**
   * Wait for loading state to complete
   */
  async waitForExecuteComplete(timeout = 10000): Promise<void> {
    // Wait for spinner to disappear or panel to close
    await this.page.waitForFunction(
      (selector) => {
        const panel = document.querySelector(selector);
        if (!panel) return true; // Panel closed
        const spinner = panel.querySelector('.animate-spin');
        return !spinner;
      },
      this.panelSelector,
      { timeout }
    );
  }
}
