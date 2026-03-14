import fs from 'fs';
import { google } from 'googleapis';
import { config } from './config.js';

export { config };

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

export async function getCalendar() {
  if (!fs.existsSync(config.credentialsPath)) {
    throw new Error('Google Calendar credentials not found. Download OAuth client JSON from GCP Console and save to data/gcal-credentials.json');
  }
  if (!fs.existsSync(config.tokenPath)) {
    throw new Error('Google Calendar not authenticated. Run the gcal setup script first.');
  }

  const creds = JSON.parse(fs.readFileSync(config.credentialsPath, 'utf-8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web || {};
  const oAuth2Client = new google.auth.OAuth2(client_id, client_secret, redirect_uris?.[0] || 'urn:ietf:wg:oauth:2.0:oob');

  const token = JSON.parse(fs.readFileSync(config.tokenPath, 'utf-8'));
  oAuth2Client.setCredentials(token);

  // Auto-save refreshed tokens
  oAuth2Client.on('tokens', (newTokens) => {
    const merged = { ...token, ...newTokens };
    fs.writeFileSync(config.tokenPath, JSON.stringify(merged, null, 2));
  });

  return google.calendar({ version: 'v3', auth: oAuth2Client });
}

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
