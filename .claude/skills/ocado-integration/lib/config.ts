/**
 * Ocado Integration - Centralised Configuration
 */

import path from 'path';

const ROOT = process.env.NANOCLAW_ROOT || process.cwd();

export const config = {
  browser: 'firefox' as const,
  browserDataDir: path.join(ROOT, 'data', 'ocado-browser-profile'),
  authPath: path.join(ROOT, 'data', 'ocado-auth.json'),
  baseUrl: 'https://www.ocado.com',

  viewport: { width: 1280, height: 900 },

  timeouts: {
    navigation: 30000,
    elementWait: 8000,
    afterClick: 1000,
    pageLoad: 4000,
    apiCall: 10000,
  },
};
