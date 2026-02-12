/**
 * E2E Explorer - Persistent Playwright session for the Kuroryuu desktop app
 * Usage: node e2e-explore.js <command> [args...]
 *
 * Commands:
 *   launch     - Launch the Electron app
 *   screenshot [name] - Take a screenshot
 *   click <selector> - Click an element
 *   nav <section> - Navigate to a sidebar section
 *   snapshot   - Get accessibility tree
 *   eval <code> - Run JS in the renderer
 *   close      - Close the app
 */

const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const SCREENSHOT_DIR = path.join(__dirname, '.playwright-cli');
const STATE_FILE = path.join(__dirname, '.e2e-state.json');

async function launch() {
  if (!fs.existsSync(SCREENSHOT_DIR)) fs.mkdirSync(SCREENSHOT_DIR, { recursive: true });

  console.log('Launching Electron...');
  const app = await electron.launch({
    args: ['.'],
    cwd: __dirname,
    env: { ...process.env, NODE_ENV: 'production' },
  });

  const window = await app.firstWindow();
  await window.waitForLoadState('domcontentloaded');
  await window.waitForTimeout(4000);

  const title = await window.title();
  console.log(`Title: ${title}`);

  // Save CDP endpoint for reconnection
  const wsEndpoint = app.process().pid;
  fs.writeFileSync(STATE_FILE, JSON.stringify({ pid: wsEndpoint, launched: Date.now() }));

  return { app, window };
}

async function screenshot(window, name = 'screen') {
  const ts = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const filename = `${name}-${ts}.png`;
  const filepath = path.join(SCREENSHOT_DIR, filename);
  await window.screenshot({ path: filepath });
  console.log(`Screenshot: ${filepath}`);
  return filepath;
}

async function main() {
  const cmd = process.argv[2] || 'launch-and-explore';

  const { app, window } = await launch();

  // Take initial screenshot
  await screenshot(window, 'home');

  // Interactive exploration based on args
  const action = process.argv[3];

  if (action === 'click') {
    const selector = process.argv[4];
    await window.click(selector);
    await window.waitForTimeout(1000);
    await screenshot(window, 'after-click');
  } else if (action === 'nav') {
    const section = process.argv[4];
    await window.click(`text=${section}`);
    await window.waitForTimeout(2000);
    await screenshot(window, `nav-${section}`);
  }

  // Keep alive for further commands via stdin
  console.log('READY - App launched. Send commands via stdin or kill to close.');

  process.stdin.setEncoding('utf8');
  process.stdin.on('data', async (data) => {
    const line = data.trim();
    const [cmd, ...args] = line.split(' ');

    try {
      switch (cmd) {
        case 'screenshot':
        case 'ss':
          await screenshot(window, args[0] || 'manual');
          break;
        case 'click':
          await window.click(args.join(' '));
          await window.waitForTimeout(1000);
          await screenshot(window, 'click');
          break;
        case 'nav':
          await window.click(`text=${args.join(' ')}`);
          await window.waitForTimeout(2000);
          await screenshot(window, `nav-${args.join('-')}`);
          break;
        case 'eval':
          const result = await window.evaluate(args.join(' '));
          console.log('Result:', JSON.stringify(result, null, 2));
          break;
        case 'title':
          console.log('Title:', await window.title());
          break;
        case 'close':
        case 'quit':
          await app.close();
          process.exit(0);
          break;
        default:
          console.log('Unknown command:', cmd);
      }
    } catch (err) {
      console.error('Error:', err.message);
    }
  });
}

main().catch(e => { console.error(e); process.exit(1); });
