/**
 * One-time setup script for GitHub OAuth credentials
 * Run with: npx electron setup-github-oauth.js
 */

const { app, safeStorage } = require('electron');
const Store = require('electron-store');

// Your GitHub OAuth App credentials - set via environment or command line
const GITHUB_CLIENT_ID = process.env.GITHUB_CLIENT_ID || process.argv[2] || '';
const GITHUB_CLIENT_SECRET = process.env.GITHUB_CLIENT_SECRET || process.argv[3] || '';

if (!GITHUB_CLIENT_ID) {
  console.error('ERROR: GITHUB_CLIENT_ID required. Set env var or pass as first argument.');
  process.exit(1);
}

app.whenReady().then(() => {
  console.log('\n=== GitHub OAuth Setup ===\n');
  
  if (!safeStorage.isEncryptionAvailable()) {
    console.error('ERROR: Encryption not available on this system');
    app.quit();
    return;
  }
  
  const store = new Store({ name: 'kuroryuu-secrets' });
  
  const creds = JSON.stringify({
    clientId: GITHUB_CLIENT_ID,
    clientSecret: GITHUB_CLIENT_SECRET || undefined,
    createdAt: Date.now()
  });
  
  try {
    const encrypted = safeStorage.encryptString(creds);
    const allCreds = store.get('oauthAppCreds', {});
    allCreds['github'] = encrypted.toString('base64');
    store.set('oauthAppCreds', allCreds);
    
    console.log('✅ GitHub OAuth credentials saved successfully!');
    console.log(`   Client ID: ${GITHUB_CLIENT_ID}`);
    console.log(`   Secret: ${GITHUB_CLIENT_SECRET ? '***' + GITHUB_CLIENT_SECRET.slice(-6) : '(none)'}`);
    console.log(`   Store: ${store.path}`);
    console.log('\nYou can now run the app and connect to GitHub.\n');
  } catch (err) {
    console.error('ERROR:', err.message);
  }
  
  app.quit();
});

app.on('window-all-closed', () => {
  // Prevent default behavior
});
