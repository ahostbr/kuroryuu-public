/**
 * Update Flow E2E Tests
 *
 * Tests the auto-updater UI notification flow:
 * - Update available notification
 * - Download progress display
 * - Update ready with restart button
 * - "Up to date" message
 * - Error handling
 *
 * These tests use electronApp.evaluate to send IPC events directly
 * from the main process to the renderer, simulating real updater events.
 */

import { test as base, _electron as electron, type ElectronApplication, type Page, expect } from '@playwright/test';
import path from 'path';

// Custom fixture that doesn't navigate to Dojo (unlike the main fixture)
type TestFixtures = {
  electronApp: ElectronApplication;
  mainWindow: Page;
};

const test = base.extend<TestFixtures>({
  electronApp: async ({}, use) => {
    const appPath = path.join(__dirname, '../out/main/index.js');

    const app = await electron.launch({
      args: [appPath],
      env: {
        ...process.env,
        E2E_TEST_MODE: 'true',
        NODE_ENV: 'test',
      },
    });

    await use(app);
    await app.close();
  },

  mainWindow: async ({ electronApp }, use) => {
    const window = await electronApp.firstWindow();
    await window.waitForLoadState('domcontentloaded');
    await window.waitForTimeout(2000); // Give React time to hydrate

    // Close any modal dialogs that might be open
    const closeButton = window.locator('button:has-text("Close")').first();
    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.click();
      await window.waitForTimeout(300);
    }

    await use(window);
  },
});

// Helper to send update status via IPC from main process
async function sendUpdateStatus(
  electronApp: ElectronApplication,
  status: {
    status: 'checking' | 'available' | 'not-available' | 'downloading' | 'ready' | 'error';
    version?: string;
    percent?: number;
    error?: string;
  }
) {
  await electronApp.evaluate(async ({ BrowserWindow }, updateStatus) => {
    const windows = BrowserWindow.getAllWindows();
    for (const win of windows) {
      win.webContents.send('update-status', updateStatus);
    }
  }, status);
}

test.describe('Update Flow E2E Tests', () => {
  // ═══════════════════════════════════════════════════════════════════════════════
  // Test: Download Progress
  // ═══════════════════════════════════════════════════════════════════════════════

  test('should show download progress', async ({ electronApp, mainWindow }) => {
    // Send downloading status via IPC
    await sendUpdateStatus(electronApp, {
      status: 'downloading',
      percent: 50,
    });

    // Wait for notification to render
    await mainWindow.waitForTimeout(500);

    // Verify notification appears
    const notification = mainWindow.locator('[data-testid="update-notification"]');
    await expect(notification).toBeVisible({ timeout: 5000 });

    // Verify downloading state content
    const downloadingContent = mainWindow.locator('[data-testid="update-downloading"]');
    await expect(downloadingContent).toBeVisible();

    // Verify progress bar
    const progressBar = mainWindow.locator('[data-testid="update-progress"]');
    await expect(progressBar).toBeVisible();

    // Verify progress text shows percentage
    const progressText = mainWindow.locator('[data-testid="update-progress-text"]');
    await expect(progressText).toContainText('50%');
  });

  test('should update progress bar as download progresses', async ({ electronApp, mainWindow }) => {
    // Start at 25%
    await sendUpdateStatus(electronApp, {
      status: 'downloading',
      percent: 25,
    });
    await mainWindow.waitForTimeout(500);

    let progressText = mainWindow.locator('[data-testid="update-progress-text"]');
    await expect(progressText).toContainText('25%');

    // Update to 75%
    await sendUpdateStatus(electronApp, {
      status: 'downloading',
      percent: 75,
    });
    await mainWindow.waitForTimeout(500);

    progressText = mainWindow.locator('[data-testid="update-progress-text"]');
    await expect(progressText).toContainText('75%');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Test: Update Ready with Restart Button
  // ═══════════════════════════════════════════════════════════════════════════════

  test('should show update ready with restart button', async ({ electronApp, mainWindow }) => {
    // Send ready status
    await sendUpdateStatus(electronApp, {
      status: 'ready',
      version: '2.0.0',
    });
    await mainWindow.waitForTimeout(500);

    // Verify notification appears
    const notification = mainWindow.locator('[data-testid="update-notification"]');
    await expect(notification).toBeVisible({ timeout: 5000 });

    // Verify ready state content
    const readyContent = mainWindow.locator('[data-testid="update-ready"]');
    await expect(readyContent).toBeVisible();

    // Verify version is shown
    const versionText = mainWindow.locator('[data-testid="update-version"]');
    await expect(versionText).toContainText('2.0.0');

    // Verify restart button is visible
    const restartButton = mainWindow.locator('[data-testid="update-restart-button"]');
    await expect(restartButton).toBeVisible();
    await expect(restartButton).toContainText('Restart');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Test: "Up to Date" Message
  // ═══════════════════════════════════════════════════════════════════════════════

  test('should show "up to date" message', async ({ electronApp, mainWindow }) => {
    // Send not-available status
    await sendUpdateStatus(electronApp, {
      status: 'not-available',
    });
    await mainWindow.waitForTimeout(500);

    // Verify notification appears
    const notification = mainWindow.locator('[data-testid="update-notification"]');
    await expect(notification).toBeVisible({ timeout: 5000 });

    // Verify not-available state content
    const notAvailableContent = mainWindow.locator('[data-testid="update-not-available"]');
    await expect(notAvailableContent).toBeVisible();

    // Verify "up to date" text
    await expect(notAvailableContent).toContainText('up to date');
  });

  test('should auto-dismiss "up to date" message after delay', async ({ electronApp, mainWindow }) => {
    // Send not-available status
    await sendUpdateStatus(electronApp, {
      status: 'not-available',
    });

    // Wait for notification to appear
    const notification = mainWindow.locator('[data-testid="update-notification"]');
    await expect(notification).toBeVisible({ timeout: 5000 });

    // Wait for auto-dismiss (2 seconds in the component)
    await mainWindow.waitForTimeout(2500);

    // Notification should be hidden
    await expect(notification).not.toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Test: Error Handling
  // ═══════════════════════════════════════════════════════════════════════════════

  test('should show error notification on update failure', async ({ electronApp, mainWindow }) => {
    // Send error status
    await sendUpdateStatus(electronApp, {
      status: 'error',
      error: 'Network connection failed',
    });
    await mainWindow.waitForTimeout(500);

    // Verify notification appears
    const notification = mainWindow.locator('[data-testid="update-notification"]');
    await expect(notification).toBeVisible({ timeout: 5000 });

    // Verify error state content
    const errorContent = mainWindow.locator('[data-testid="update-error"]');
    await expect(errorContent).toBeVisible();

    // Verify error message
    const errorMessage = mainWindow.locator('[data-testid="update-error-message"]');
    await expect(errorMessage).toContainText('Network connection failed');
  });

  test('should show "Update failed" text on error', async ({ electronApp, mainWindow }) => {
    await sendUpdateStatus(electronApp, {
      status: 'error',
      error: 'Something went wrong',
    });
    await mainWindow.waitForTimeout(500);

    const errorContent = mainWindow.locator('[data-testid="update-error"]');
    await expect(errorContent).toBeVisible();
    await expect(errorContent).toContainText('Update failed');
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Test: Dismiss Functionality
  // ═══════════════════════════════════════════════════════════════════════════════

  test('should allow dismissing ready notification', async ({ electronApp, mainWindow }) => {
    // Send ready status
    await sendUpdateStatus(electronApp, {
      status: 'ready',
      version: '2.0.0',
    });
    await mainWindow.waitForTimeout(500);

    // Verify notification appears
    const notification = mainWindow.locator('[data-testid="update-notification"]');
    await expect(notification).toBeVisible({ timeout: 5000 });

    // Click dismiss button
    const dismissButton = mainWindow.locator('[data-testid="update-dismiss"]');
    await dismissButton.click();

    // Notification should be hidden
    await expect(notification).not.toBeVisible();
  });

  test('should not show dismiss button while downloading', async ({ electronApp, mainWindow }) => {
    // Send downloading status
    await sendUpdateStatus(electronApp, {
      status: 'downloading',
      percent: 50,
    });
    await mainWindow.waitForTimeout(500);

    // Dismiss button should not be visible during download
    const dismissButton = mainWindow.locator('[data-testid="update-dismiss"]');
    await expect(dismissButton).not.toBeVisible();
  });

  // ═══════════════════════════════════════════════════════════════════════════════
  // Test: Status Transitions
  // ═══════════════════════════════════════════════════════════════════════════════

  test('should transition through full update flow', async ({ electronApp, mainWindow }) => {
    // Step 1: Checking → Downloading
    await sendUpdateStatus(electronApp, {
      status: 'downloading',
      percent: 0,
    });
    await mainWindow.waitForTimeout(500);

    const notification = mainWindow.locator('[data-testid="update-notification"]');
    await expect(notification).toBeVisible({ timeout: 5000 });

    // Step 2: Downloading at 50%
    await sendUpdateStatus(electronApp, {
      status: 'downloading',
      percent: 50,
    });
    await mainWindow.waitForTimeout(500);

    let progressText = mainWindow.locator('[data-testid="update-progress-text"]');
    await expect(progressText).toContainText('50%');

    // Step 3: Download complete → Ready
    await sendUpdateStatus(electronApp, {
      status: 'ready',
      version: '2.0.0',
    });
    await mainWindow.waitForTimeout(500);

    const readyContent = mainWindow.locator('[data-testid="update-ready"]');
    await expect(readyContent).toBeVisible();

    const restartButton = mainWindow.locator('[data-testid="update-restart-button"]');
    await expect(restartButton).toBeVisible();
  });
});
