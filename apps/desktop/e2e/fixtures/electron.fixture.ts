import { test as base, _electron as electron, type ElectronApplication, type Page } from '@playwright/test';
import path from 'path';

export type TestFixtures = {
  electronApp: ElectronApplication;
  mainWindow: Page;
};

export const test = base.extend<TestFixtures>({
  electronApp: async ({}, use) => {
    // Path to built Electron app
    const appPath = path.join(__dirname, '../../out/main/index.js');

    const app = await electron.launch({
      args: [appPath],
      env: {
        ...process.env,
        E2E_TEST_MODE: 'true',
        NODE_ENV: 'test',
        PRD_WORKFLOW_DELAY_MS: '100', // Fast delays for testing
      },
    });

    await use(app);
    await app.close();
  },

  mainWindow: async ({ electronApp }, use) => {
    // Wait for first window
    const window = await electronApp.firstWindow();

    // Wait for app to be ready (data-testid added in Phase 5.8)
    await window.waitForLoadState('domcontentloaded');

    // Give React time to hydrate
    await window.waitForTimeout(1000);

    // Close any modal dialogs that might be open
    const closeButton = window.locator('button:has-text("Close")').first();
    if (await closeButton.isVisible({ timeout: 1000 }).catch(() => false)) {
      await closeButton.click();
      await window.waitForTimeout(300);
    }

    // Also try to close dialogs with X button
    const xButton = window.locator('[aria-label="Close"], [data-testid="close-button"]').first();
    if (await xButton.isVisible({ timeout: 500 }).catch(() => false)) {
      await xButton.click();
      await window.waitForTimeout(300);
    }

    // Navigate to Dojo page for PRD workflow tests
    // Click the Dojo link in the sidebar
    const dojoLink = window.locator('text=Dojo').first();
    if (await dojoLink.isVisible({ timeout: 5000 }).catch(() => false)) {
      await dojoLink.click();
      await window.waitForTimeout(500);

      // Click on PRD tab button to show workflow graph
      // The tab is a button containing the text "PRD"
      const prdTab = window.locator('button:has-text("PRD")').first();
      if (await prdTab.isVisible({ timeout: 2000 }).catch(() => false)) {
        await prdTab.click();
        // Wait for the PRD workflow page to render
        await window.waitForTimeout(1000);
      }
    }

    await use(window);
  },
});

export { expect } from '@playwright/test';
