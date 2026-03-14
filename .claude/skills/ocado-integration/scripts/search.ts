/**
 * Ocado Integration - Product Search
 * Uses /api/webproductpagews/v6/product-pages/search (discovered via network capture)
 * Input:  { query: string, limit?: number }
 * Output: { success, message, data: { products: Product[] } }
 */

import { getBrowserContext, runScript, ScriptResult } from '../lib/browser.js';
import { config } from '../lib/config.js';

interface SearchInput {
  query: string;
  limit?: number;
}

runScript<SearchInput>(async ({ query, limit = 10 }): Promise<ScriptResult> => {
  if (!query?.trim()) {
    return { success: false, message: 'Search query cannot be empty' };
  }

  const context = await getBrowserContext();
  try {
    const page = context.pages()[0] || await context.newPage();

    // Navigate to Ocado first to establish session cookies
    await page.goto(`${config.baseUrl}`, {
      timeout: config.timeouts.navigation,
      waitUntil: 'domcontentloaded'
    });
    await page.waitForTimeout(2000);

    // Use the real search API (v6) discovered via network capture
    const result = await page.evaluate(async ({ query, limit }: { query: string; limit: number }) => {
      try {
        const res = await fetch(
          `/api/webproductpagews/v6/product-pages/search?includeAdditionalPageInfo=true&maxPageSize=${limit}&maxProductsToDecorate=${limit}&q=${encodeURIComponent(query)}&tag=web`,
          { headers: { 'Accept': 'application/json' } }
        );
        if (!res.ok) return { error: `API returned ${res.status}` };
        return await res.json();
      } catch (e) {
        return { error: String(e) };
      }
    }, { query, limit });

    if (result.error) {
      return { success: false, message: `Search API failed: ${result.error}` };
    }

    // Parse the v6 response: productGroups[].decoratedProducts[]
    const products: Array<Record<string, unknown>> = [];
    const groups = result.productGroups || [];
    for (const group of groups) {
      const items = (group as Record<string, unknown>).decoratedProducts || (group as Record<string, unknown>).products || [];
      for (const p of items as Array<Record<string, unknown>>) {
        products.push(p);
      }
    }

    const parsed = products.slice(0, limit).map((p) => ({
      id: String(p.productId || p.retailerProductId || ''),
      retailerId: String(p.retailerProductId || ''),
      name: String(p.name || ''),
      brand: String(p.brand || ''),
      size: String(p.packSizeDescription || ''),
      price: `£${(p.promoPrice as Record<string, unknown>)?.amount ?? (p.price as Record<string, unknown>)?.amount ?? '?'}`,
      originalPrice: `£${(p.price as Record<string, unknown>)?.amount ?? '?'}`,
      inStock: p.available !== false,
    }));

    if (!parsed.length) {
      return { success: false, message: `No products found for "${query}".` };
    }

    return {
      success: true,
      message: `Found ${parsed.length} products for "${query}"`,
      data: { products: parsed }
    };
  } finally {
    await context.close();
  }
});
