/**
 * Ocado Integration - MCP Tool Definitions (Agent/Container Side)
 *
 * These tools run inside the container and communicate with the host via IPC.
 * The host-side implementation is in host.ts.
 *
 * SAFETY NOTE: There is intentionally NO checkout tool. This integration can
 * read and modify the basket, but payment/checkout can only be triggered by
 * the user clicking the checkout URL in their browser.
 */

// @ts-ignore - SDK available in container environment only
import { tool } from '@anthropic-ai/claude-agent-sdk';
import { z } from 'zod';
import fs from 'fs';
import path from 'path';

const IPC_DIR = '/workspace/ipc';
const TASKS_DIR = path.join(IPC_DIR, 'tasks');
const RESULTS_SUBDIR = 'ocado_results';

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });
  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filepath = path.join(dir, filename);
  const tmp = `${filepath}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
  fs.renameSync(tmp, filepath);
  return filename;
}

async function waitForResult(
  groupFolder: string,
  requestId: string,
  maxWait = 90000
): Promise<{ success: boolean; message: string; data?: unknown }> {
  const resultsDir = path.join(IPC_DIR, groupFolder, RESULTS_SUBDIR);
  const resultFile = path.join(resultsDir, `${requestId}.json`);
  const pollInterval = 1000;
  let elapsed = 0;

  while (elapsed < maxWait) {
    if (fs.existsSync(resultFile)) {
      try {
        const result = JSON.parse(fs.readFileSync(resultFile, 'utf-8'));
        fs.unlinkSync(resultFile);
        return result;
      } catch (err) {
        return { success: false, message: `Failed to read result: ${err}` };
      }
    }
    await new Promise(resolve => setTimeout(resolve, pollInterval));
    elapsed += pollInterval;
  }

  return { success: false, message: 'Request timed out after 90s' };
}

export interface SkillToolsContext {
  groupFolder: string;
  isMain: boolean;
}

export function createOcadoTools(ctx: SkillToolsContext) {
  const { groupFolder, isMain } = ctx;

  return [

    tool(
      'ocado_search',
      `Search for products on Ocado. Returns product names, prices, IDs and stock status.
Use this to find product IDs before adding to basket. Main group only.`,
      {
        query: z.string().describe('Search term, e.g. "oat milk" or "sourdough bread"'),
        limit: z.number().int().min(1).max(20).optional().describe('Max results to return (default 10)'),
      },
      async (args: { query: string; limit?: number }) => {
        if (!isMain) return { content: [{ type: 'text', text: 'Ocado tools are only available in the main group.' }], isError: true };

        const requestId = `ocado-search-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        writeIpcFile(TASKS_DIR, { type: 'ocado_search', requestId, groupFolder, ...args, timestamp: new Date().toISOString() });

        const result = await waitForResult(groupFolder, requestId);
        return {
          content: [{ type: 'text', text: result.message + (result.data ? '\n\n' + JSON.stringify(result.data, null, 2) : '') }],
          isError: !result.success
        };
      }
    ),

    tool(
      'ocado_get_basket',
      `Get the current contents of the Ocado basket, including item names, quantities, prices and a checkout URL.
Always show the user the checkout URL so they can complete the purchase themselves. Main group only.`,
      {},
      async () => {
        if (!isMain) return { content: [{ type: 'text', text: 'Ocado tools are only available in the main group.' }], isError: true };

        const requestId = `ocado-basket-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        writeIpcFile(TASKS_DIR, { type: 'ocado_get_basket', requestId, groupFolder, timestamp: new Date().toISOString() });

        const result = await waitForResult(groupFolder, requestId);
        return {
          content: [{ type: 'text', text: result.message + (result.data ? '\n\n' + JSON.stringify(result.data, null, 2) : '') }],
          isError: !result.success
        };
      }
    ),

    tool(
      'ocado_add_to_basket',
      `Add one or more products to the Ocado basket by product ID.
Use ocado_search first to find product IDs. After adding, always show the user the checkout URL.
IMPORTANT: This tool cannot checkout or place orders — only the user can do that by clicking the checkout link. Main group only.`,
      {
        items: z.array(z.object({
          productId: z.string().describe('Ocado product/SKU ID from ocado_search'),
          quantity: z.number().int().min(1).max(99).optional().describe('Quantity to add (default 1)'),
        })).describe('List of items to add'),
      },
      async (args: { items: Array<{ productId: string; quantity?: number }> }) => {
        if (!isMain) return { content: [{ type: 'text', text: 'Ocado tools are only available in the main group.' }], isError: true };

        const requestId = `ocado-add-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        writeIpcFile(TASKS_DIR, { type: 'ocado_add_to_basket', requestId, groupFolder, items: args.items, timestamp: new Date().toISOString() });

        const result = await waitForResult(groupFolder, requestId);
        const checkoutUrl = (result.data as { checkoutUrl?: string })?.checkoutUrl || 'https://www.ocado.com/webshop/checkoutRegistration.do';
        const text = result.message + `\n\nWhen you're ready to checkout: ${checkoutUrl}`;
        return {
          content: [{ type: 'text', text }],
          isError: !result.success
        };
      }
    ),

    tool(
      'ocado_get_lists',
      `Get saved shopping lists from Ocado account. Main group only.`,
      {},
      async () => {
        if (!isMain) return { content: [{ type: 'text', text: 'Ocado tools are only available in the main group.' }], isError: true };

        const requestId = `ocado-lists-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
        writeIpcFile(TASKS_DIR, { type: 'ocado_get_lists', requestId, groupFolder, timestamp: new Date().toISOString() });

        const result = await waitForResult(groupFolder, requestId);
        return {
          content: [{ type: 'text', text: result.message + (result.data ? '\n\n' + JSON.stringify(result.data, null, 2) : '') }],
          isError: !result.success
        };
      }
    ),

  ];
}
