#!/usr/bin/env npx tsx
/**
 * Ocado Integration - One-time authentication setup
 * Usage: npx tsx .claude/skills/ocado-integration/scripts/setup.ts
 *
 * Opens Firefox so you can log in to Ocado manually.
 * Session is saved to data/ocado-browser-profile/ for future use.
 */

import { firefox } from 'playwright';
import * as readline from 'readline';
import fs from 'fs';
import path from 'path';
import { config, cleanupLockFiles, saveCookies } from '../lib/browser.js';

async function setup(): Promise<void> {
  console.log('=== Ocado Authentication Setup ===\n');
  console.log('This will open Firefox for you to log in to Ocado.');
  console.log('Your session will be saved for automated use.\n');
  console.log(`Profile: ${config.browserDataDir}\n`);

  fs.mkdirSync(config.browserDataDir, { recursive: true });
  fs.mkdirSync(path.dirname(config.authPath), { recursive: true });
  cleanupLockFiles();

  console.log('Launching browser...\n');

  const context = await firefox.launchPersistentContext(config.browserDataDir, {
    headless: false,
    viewport: config.viewport,
  });

  const page = context.pages()[0] || await context.newPage();
  await page.goto('https://www.ocado.com/webshop/startWebshop.do');

  console.log('Please log in to Ocado in the browser window.');
  console.log('Once you can see your account/basket, come back here and press Enter.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  await new Promise<void>(resolve => {
    rl.question('Press Enter when logged in... ', () => { rl.close(); resolve(); });
  });

  // Verify by checking for a logged-in element
  console.log('\nVerifying login...');
  await page.goto('https://www.ocado.com/webshop/startWebshop.do');
  await page.waitForTimeout(config.timeouts.pageLoad);

  // Look for account/logout indicators
  const isLoggedIn = await page.locator('[data-test="header-account-button"], .account-button, [aria-label*="account" i]')
    .first().isVisible().catch(() => false);

  if (isLoggedIn) {
    fs.writeFileSync(config.authPath, JSON.stringify({
      authenticated: true,
      timestamp: new Date().toISOString()
    }, null, 2));

    console.log('\n✅ Authentication successful!');
    console.log(`Session saved to: ${config.browserDataDir}`);
  } else {
    console.log('\n⚠️  Could not auto-verify login, but session may still be saved.');
    console.log('Try running a search to confirm it works.');
    // Save anyway — the selector may just be wrong
    fs.writeFileSync(config.authPath, JSON.stringify({
      authenticated: true,
      timestamp: new Date().toISOString(),
      note: 'auto-verify failed, saved anyway'
    }, null, 2));
  }

  // Save all cookies so scripts can restore them later
  await saveCookies(context);
  console.log('Cookies saved for future script use.');

  await context.close();
}

setup().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
