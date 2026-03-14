/**
 * Ocado Integration - Get current basket contents
 * Uses /api/cart/v1/carts/active (discovered via network capture)
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
        const res = await fetch('/api/cart/v1/carts/active', {
          headers: { 'Accept': 'application/json' }
        });
        if (!res.ok) return { error: `API returned ${res.status}` };
        return { data: await res.json(), error: null };
      } catch (e) {
        return { data: null, error: String(e) };
      }
    });

    if (result.error || !result.data) {
      return { success: false, message: `Could not fetch basket: ${result.error}` };
    }

    const raw = result.data;
    const items = (raw.items || []).map((item: Record<string, unknown>) => ({
      productId: String(item.productId || ''),
      quantity: Number(item.quantity || 1),
      price: String((item.price as Record<string, unknown>)?.amount ?? ''),
      finalPrice: String((item.finalPrice as Record<string, unknown>)?.amount ?? ''),
    }));

    const totals = raw.totals || raw.activeCheckoutGroupTotals || {};
    const total = (totals.itemPriceAfterPromos as Record<string, unknown>)?.amount ?? 'unknown';
    const canCheckout = raw.activeCheckoutGroup?.canCheckout ?? false;

    return {
      success: true,
      message: items.length
        ? `${items.length} item${items.length !== 1 ? 's' : ''} in your basket. Total: £${total}`
        : 'Your basket is empty.',
      data: {
        items,
        total,
        canCheckout,
        checkoutUrl: 'https://www.ocado.com/webshop/checkoutRegistration.do'
      }
    };
  } finally {
    await context.close();
  }
});
