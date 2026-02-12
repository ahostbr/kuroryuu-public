const { _electron: electron } = require('playwright');
const path = require('path');
const fs = require('fs');

const DIR = path.join(__dirname, '.playwright-cli');
if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });

let shotN = 0;
async function ss(win, label) {
  const file = path.join(DIR, `tour-${String(++shotN).padStart(2,'0')}-${label}.png`);
  await win.screenshot({ path: file });
  console.log(`[${shotN}] ${label}: ${file}`);
}

(async () => {
  console.log('Launching Kuroryuu...');
  const app = await electron.launch({
    args: ['.'],
    cwd: __dirname,
    env: { ...process.env, E2E_TEST_MODE: 'true' },
  });
  const w = await app.firstWindow();
  await w.waitForLoadState('domcontentloaded');
  await w.waitForTimeout(4000);
  console.log('Title:', await w.title());

  // 1. Home
  await ss(w, 'home');

  // Tour sidebar sections
  const sections = [
    'ChatBot',
    'Claude Teams',
    'Kuroryuu Agents',
    'Generative UI',
    'LLM Apps',
    'Terminals',
    'Capture',
    'Server Status',
    'HTTP Traffic',
    'PTY Traffic',
    'Integrations',
    'Domain Config',
    'Claude Plugin',
    'Settings',
  ];

  for (const section of sections) {
    try {
      console.log(`Navigating to: ${section}...`);
      await w.click(`text=${section}`, { timeout: 3000 });
      await w.waitForTimeout(2000);
      await ss(w, section.toLowerCase().replace(/\s+/g, '-'));
    } catch (e) {
      console.log(`  Skipped ${section}: ${e.message.slice(0, 60)}`);
    }
  }

  console.log(`\nTour complete! ${shotN} screenshots in ${DIR}`);
  await app.close();
})().catch(e => { console.error(e); process.exit(1); });
