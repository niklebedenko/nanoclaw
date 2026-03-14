/**
 * Ocado Integration - Get saved regulars/lists
 * Uses /api/regulars/v1/regulars (discovered via network capture)
 */

import { getBrowserContext, runScript, ScriptResult } from '../lib/browser.js';
import { config } from '../lib/config.js';

runScript<Record<string, never>>(async (): Promise<ScriptResult> => {
  const context = await getBrowserContext();
  try {
    const page = context.pages()[0] || await context.newPage();

    await page.goto(`${config.baseUrl}`, {
      waitUntil: 'domcontentloaded',
      timeout: config.timeouts.navigation
    });
    await page.waitForTimeout(2000);

    const result = await page.evaluate(async () => {
      try {
        const res = await fetch('/api/regulars/v1/regulars', {
          headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) return { error: `API returned ${res.status}` };
        return { data: await res.json(), error: null };
      } catch (e) {
        return { data: null, error: String(e) };
      }
    });

    if (result.error || !result.data) {
      return { success: false, message: `Could not fetch regulars: ${result.error}` };
    }

    const regulars = (Array.isArray(result.data) ? result.data : []).map(
      (r: Record<string, unknown>) => ({
        productId: String(r.productId || ''),
        quantity: Number(r.quantity || 1),
        frequency: String(r.frequency || ''),
      })
    );

    return {
      success: true,
      message: regulars.length
        ? `${regulars.length} regular item${regulars.length !== 1 ? 's' : ''}`
        : 'No regulars found.',
      data: { regulars }
    };
  } finally {
    await context.close();
  }
});
