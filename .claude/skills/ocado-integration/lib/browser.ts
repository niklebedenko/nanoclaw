/**
 * Ocado Integration - Shared browser utilities
 */

import { firefox, BrowserContext } from 'playwright';
import fs from 'fs';
import path from 'path';
import { config } from './config.js';

export { config };

const cookieJarPath = path.join(
  process.env.NANOCLAW_ROOT || process.cwd(),
  'data',
  'ocado-cookies.json',
);

export interface ScriptResult {
  success: boolean;
  message: string;
  data?: unknown;
}

export async function readInput<T>(): Promise<T> {
  return new Promise((resolve, reject) => {
    let data = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', chunk => { data += chunk; });
    process.stdin.on('end', () => {
      try { resolve(JSON.parse(data)); }
      catch (err) { reject(new Error(`Invalid JSON input: ${err}`)); }
    });
    process.stdin.on('error', reject);
  });
}

export function writeResult(result: ScriptResult): void {
  console.log(JSON.stringify(result));
}

export function cleanupLockFiles(): void {
  for (const f of ['lock', 'parent.lock', '.parentlock']) {
    const p = path.join(config.browserDataDir, f);
    if (fs.existsSync(p)) { try { fs.unlinkSync(p); } catch {} }
  }
}

/**
 * Save all cookies from context to disk
 */
export async function saveCookies(context: BrowserContext): Promise<void> {
  const cookies = await context.cookies('https://www.ocado.com');
  fs.writeFileSync(cookieJarPath, JSON.stringify(cookies, null, 2));
}

/**
 * Restore saved cookies into context
 */
export async function restoreCookies(context: BrowserContext): Promise<void> {
  if (!fs.existsSync(cookieJarPath)) return;
  try {
    const cookies = JSON.parse(fs.readFileSync(cookieJarPath, 'utf-8'));
    if (Array.isArray(cookies) && cookies.length > 0) {
      await context.addCookies(cookies);
    }
  } catch {}
}

/**
 * Launch persistent Firefox browser context with saved Ocado session.
 * Restores cookies from the cookie jar on launch.
 */
export async function getBrowserContext(): Promise<BrowserContext> {
  if (!fs.existsSync(config.authPath)) {
    throw new Error('Ocado not authenticated. Run the ocado setup script first.');
  }

  cleanupLockFiles();

  const context = await firefox.launchPersistentContext(config.browserDataDir, {
    headless: false,
    viewport: config.viewport,
  });

  // Inject saved cookies before any navigation
  await restoreCookies(context);

  return context;
}

/**
 * Wrap a script handler with standard error handling.
 * Saves cookies after the handler completes (even on error).
 */
export async function runScript<T>(
  handler: (input: T) => Promise<ScriptResult>
): Promise<void> {
  try {
    const input = await readInput<T>();
    const result = await handler(input);
    writeResult(result);
  } catch (err) {
    writeResult({
      success: false,
      message: `Script failed: ${err instanceof Error ? err.message : String(err)}`
    });
    process.exit(1);
  }
}
