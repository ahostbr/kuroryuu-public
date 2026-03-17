/**
 * BrowserManager — Manages browser sessions via Electron WebContentsView.
 *
 * Mirrors LiteEditor's browser-manager.ts approach:
 * - Uses WebContentsView with partition: 'persist:browser' for automatic cookie persistence
 * - DOM indexing via injected JavaScript (data-agent-idx attributes)
 * - Session management (create, destroy, list)
 *
 * Cookies, localStorage, and OAuth sessions persist across restarts automatically
 * via Electron's partition system — no manual cookie management needed.
 */

import { WebContentsView, BrowserWindow } from 'electron';

// ============================================================================
// DOM Indexing Script — injected into pages to index interactive elements
// ============================================================================

const DOM_INDEX_SCRIPT = `
(function() {
  const selectors = [
    'a[href]', 'button', 'input', 'textarea', 'select',
    '[role="button"]', '[role="link"]', '[contenteditable="true"]',
    '[onclick]', '[tabindex]'
  ].join(', ');

  const elements = [];
  let idx = 0;

  document.querySelectorAll(selectors).forEach(el => {
    const rect = el.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return;
    if (rect.bottom < 0 || rect.top > window.innerHeight) return;

    el.setAttribute('data-agent-idx', String(idx));
    elements.push({
      index: idx,
      tag: el.tagName.toLowerCase(),
      type: el.getAttribute('type') || '',
      text: (el.textContent || '').trim().slice(0, 120),
      value: el.value || '',
      placeholder: el.getAttribute('placeholder') || '',
      href: el.getAttribute('href') || '',
      ariaLabel: el.getAttribute('aria-label') || '',
      name: el.getAttribute('name') || '',
      checked: el.checked || false,
      bounds: { x: Math.round(rect.x), y: Math.round(rect.y), w: Math.round(rect.width), h: Math.round(rect.height) }
    });
    idx++;
  });

  return JSON.stringify({
    url: location.href,
    title: document.title,
    elementCount: elements.length,
    elements: elements,
    visibleText: document.body.innerText.slice(0, 5000)
  });
})()
`;

// ============================================================================
// Types
// ============================================================================

interface BrowserSession {
  id: string;
  view: WebContentsView;
  consoleLogs: Array<{ level: string; message: string; timestamp: number }>;
}

interface ReadPageResult {
  url: string;
  title: string;
  elementCount: number;
  elements: Array<Record<string, unknown>>;
  visibleText: string;
}

// ============================================================================
// BrowserManager
// ============================================================================

export class BrowserManager {
  private sessions: Map<string, BrowserSession> = new Map();
  private mainWindow: BrowserWindow | null = null;
  private sessionCounter = 0;

  /** Must be called after mainWindow is created */
  setMainWindow(win: BrowserWindow): void {
    this.mainWindow = win;
  }

  /** Create a new browser session */
  createSession(): { id: string } {
    const id = `browser-${++this.sessionCounter}`;

    const view = new WebContentsView({
      webPreferences: {
        partition: 'persist:browser',  // Cookie persistence — same as LiteEditor
        sandbox: true,
        contextIsolation: true,
      },
    });

    // Spoof user-agent to look like regular Chrome
    const defaultUA = view.webContents.getUserAgent();
    view.webContents.setUserAgent(
      defaultUA.replace(/\s*Electron\/\S+/g, '').replace(/\s*Kuroryuu\/\S+/g, '')
    );

    // Set a reasonable viewport size (offscreen rendering)
    view.setBounds({ x: 0, y: 0, width: 1280, height: 900 });

    // Capture console logs
    const session: BrowserSession = { id, view, consoleLogs: [] };

    view.webContents.on('console-message', (_event, level, message) => {
      const levelNames = ['verbose', 'info', 'warning', 'error'];
      session.consoleLogs.push({
        level: levelNames[level] || 'info',
        message: message.slice(0, 500),
        timestamp: Date.now(),
      });
      // Keep max 500 entries
      if (session.consoleLogs.length > 500) {
        session.consoleLogs.splice(0, session.consoleLogs.length - 500);
      }
    });

    // Add view to main window (hidden — it doesn't need to be visible)
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.contentView.addChildView(view);
      // Position offscreen so it doesn't interfere with UI
      view.setBounds({ x: -9999, y: -9999, width: 1280, height: 900 });
    }

    this.sessions.set(id, session);
    return { id };
  }

  /** Destroy a session */
  destroySession(id: string): boolean {
    const session = this.sessions.get(id);
    if (!session) return false;

    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.contentView.removeChildView(session.view);
    }
    (session.view.webContents as unknown as { destroy: () => void }).destroy?.();
    this.sessions.delete(id);
    return true;
  }

  /** List all sessions */
  listSessions(): string[] {
    return Array.from(this.sessions.keys());
  }

  /** Get or auto-create default session */
  private getSession(id?: string): BrowserSession {
    if (id && this.sessions.has(id)) return this.sessions.get(id)!;
    if (this.sessions.size === 0) {
      const { id: newId } = this.createSession();
      return this.sessions.get(newId)!;
    }
    return this.sessions.values().next().value!;
  }

  // ========================================================================
  // Navigation
  // ========================================================================

  async navigate(url: string, sessionId?: string): Promise<{ success: boolean; url: string }> {
    const session = this.getSession(sessionId);
    await session.view.webContents.loadURL(url);
    // Wait a moment for page to settle
    await new Promise((r) => setTimeout(r, 500));
    return { success: true, url: session.view.webContents.getURL() };
  }

  async goBack(sessionId?: string): Promise<{ success: boolean }> {
    const session = this.getSession(sessionId);
    if (session.view.webContents.canGoBack()) {
      session.view.webContents.goBack();
      await new Promise((r) => setTimeout(r, 300));
    }
    return { success: true };
  }

  async goForward(sessionId?: string): Promise<{ success: boolean }> {
    const session = this.getSession(sessionId);
    if (session.view.webContents.canGoForward()) {
      session.view.webContents.goForward();
      await new Promise((r) => setTimeout(r, 300));
    }
    return { success: true };
  }

  async reload(sessionId?: string): Promise<{ success: boolean }> {
    const session = this.getSession(sessionId);
    session.view.webContents.reload();
    await new Promise((r) => setTimeout(r, 500));
    return { success: true };
  }

  // ========================================================================
  // Page Reading
  // ========================================================================

  async readPage(sessionId?: string): Promise<ReadPageResult> {
    const session = this.getSession(sessionId);
    const resultJson = await session.view.webContents.executeJavaScript(DOM_INDEX_SCRIPT);
    return JSON.parse(resultJson);
  }

  async screenshot(sessionId?: string): Promise<{ success: boolean; dataUrl: string }> {
    const session = this.getSession(sessionId);
    const img = await session.view.webContents.capturePage();
    const dataUrl = `data:image/png;base64,${img.toPNG().toString('base64')}`;
    return { success: true, dataUrl };
  }

  // ========================================================================
  // Interaction
  // ========================================================================

  async click(index: number, sessionId?: string): Promise<{ success: boolean }> {
    const session = this.getSession(sessionId);
    await session.view.webContents.executeJavaScript(`
      (function() {
        const el = document.querySelector('[data-agent-idx="${index}"]');
        if (!el) return 'Element not found';
        el.scrollIntoView({ behavior: 'instant', block: 'center' });
        el.click();
        return 'ok';
      })()
    `);
    await new Promise((r) => setTimeout(r, 200));
    return { success: true };
  }

  async type(text: string, index?: number, sessionId?: string): Promise<{ success: boolean }> {
    const session = this.getSession(sessionId);
    const escapedText = text.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n');

    if (index !== undefined) {
      await session.view.webContents.executeJavaScript(`
        (function() {
          const el = document.querySelector('[data-agent-idx="${index}"]');
          if (!el) return 'Element not found';
          el.scrollIntoView({ behavior: 'instant', block: 'center' });
          el.focus();
          if (el.contentEditable === 'true') {
            el.textContent = '${escapedText}';
          } else {
            el.value = '${escapedText}';
          }
          el.dispatchEvent(new Event('input', { bubbles: true }));
          el.dispatchEvent(new Event('change', { bubbles: true }));
          return 'ok';
        })()
      `);
    } else {
      await session.view.webContents.executeJavaScript(`
        document.activeElement.value = '${escapedText}';
        document.activeElement.dispatchEvent(new Event('input', { bubbles: true }));
        document.activeElement.dispatchEvent(new Event('change', { bubbles: true }));
      `);
    }
    return { success: true };
  }

  async scroll(direction: string = 'down', amount: number = 300, sessionId?: string): Promise<{ success: boolean; scrollX: number; scrollY: number }> {
    const session = this.getSession(sessionId);
    const dx = direction === 'right' ? amount : direction === 'left' ? -amount : 0;
    const dy = direction === 'down' ? amount : direction === 'up' ? -amount : 0;
    const result = await session.view.webContents.executeJavaScript(`
      window.scrollBy(${dx}, ${dy});
      JSON.stringify({ scrollX: window.scrollX, scrollY: window.scrollY });
    `);
    const parsed = JSON.parse(result);
    return { success: true, scrollX: parsed.scrollX, scrollY: parsed.scrollY };
  }

  async selectOption(elementIndex: number, optionIndex: number, sessionId?: string): Promise<{ success: boolean; selectedValue: string }> {
    const session = this.getSession(sessionId);
    const result = await session.view.webContents.executeJavaScript(`
      (function() {
        const el = document.querySelector('[data-agent-idx="${elementIndex}"]');
        if (!el || el.tagName !== 'SELECT') return JSON.stringify({ error: 'Not a select element' });
        el.selectedIndex = ${optionIndex};
        el.dispatchEvent(new Event('change', { bubbles: true }));
        return JSON.stringify({ selectedValue: el.value });
      })()
    `);
    const parsed = JSON.parse(result);
    return { success: true, selectedValue: parsed.selectedValue || '' };
  }

  async executeJs(code: string, sessionId?: string): Promise<{ success: boolean; result: unknown }> {
    const session = this.getSession(sessionId);
    const result = await session.view.webContents.executeJavaScript(code);
    return { success: true, result };
  }

  // ========================================================================
  // Console & Status
  // ========================================================================

  getConsoleLogs(sessionId?: string, since?: number): Array<{ level: string; message: string; timestamp: number }> {
    const session = this.getSession(sessionId);
    if (since) return session.consoleLogs.filter((l) => l.timestamp >= since);
    return [...session.consoleLogs];
  }

  getStatus(sessionId?: string): { url: string; title: string; sessionId: string } {
    const session = this.getSession(sessionId);
    return {
      url: session.view.webContents.getURL(),
      title: session.view.webContents.getTitle(),
      sessionId: session.id,
    };
  }

  // ========================================================================
  // View Positioning (for embedding in desktop UI panels)
  // ========================================================================

  /** Show the browser view at specific bounds within the main window */
  showView(bounds: { x: number; y: number; width: number; height: number }, sessionId?: string): void {
    const session = this.getSession(sessionId);
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      // Ensure view is attached
      const children = this.mainWindow.contentView.children;
      if (!children.includes(session.view)) {
        this.mainWindow.contentView.addChildView(session.view);
      }
      session.view.setBounds(bounds);
    }
  }

  /** Hide the browser view (move offscreen) */
  hideView(sessionId?: string): void {
    const session = this.getSession(sessionId);
    session.view.setBounds({ x: -9999, y: -9999, width: 1, height: 1 });
  }

  /** Get current URL for a session */
  getCurrentUrl(sessionId?: string): string {
    const session = this.getSession(sessionId);
    return session.view.webContents.getURL();
  }

  /** Get current title for a session */
  getCurrentTitle(sessionId?: string): string {
    const session = this.getSession(sessionId);
    return session.view.webContents.getTitle();
  }

  /** Cleanup all sessions */
  destroyAll(): void {
    for (const id of this.sessions.keys()) {
      this.destroySession(id);
    }
  }
}

// Singleton
let _instance: BrowserManager | null = null;
export function getBrowserManager(): BrowserManager {
  if (!_instance) _instance = new BrowserManager();
  return _instance;
}
