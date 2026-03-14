#!/usr/bin/env npx tsx
/**
 * Google Calendar - One-time OAuth2 setup
 * Usage: npx tsx .claude/skills/gcal-integration/scripts/setup.ts
 */

import fs from 'fs';
import path from 'path';
import * as readline from 'readline';
import { google } from 'googleapis';
import { config } from '../lib/config.js';

async function setup(): Promise<void> {
  console.log('=== Google Calendar Authentication Setup ===\n');

  const dataDir = path.dirname(config.credentialsPath);
  fs.mkdirSync(dataDir, { recursive: true });

  if (!fs.existsSync(config.credentialsPath)) {
    console.log('You need to create OAuth credentials first:\n');
    console.log('1. Go to https://console.cloud.google.com/apis/credentials');
    console.log('2. Create a project (or select existing)');
    console.log('3. Enable the Google Calendar API:');
    console.log('   https://console.cloud.google.com/apis/library/calendar-json.googleapis.com');
    console.log('4. Go to Credentials > Create Credentials > OAuth client ID');
    console.log('5. Application type: Desktop app');
    console.log('6. Download the JSON and save it to:');
    console.log(`   ${config.credentialsPath}\n`);
    console.log('Then run this script again.');
    process.exit(1);
  }

  const creds = JSON.parse(fs.readFileSync(config.credentialsPath, 'utf-8'));
  const { client_id, client_secret, redirect_uris } = creds.installed || creds.web || {};

  if (!client_id || !client_secret) {
    console.error('Invalid credentials file. Download the OAuth client JSON from GCP Console.');
    process.exit(1);
  }

  const oAuth2Client = new google.auth.OAuth2(
    client_id, client_secret, redirect_uris?.[0] || 'urn:ietf:wg:oauth:2.0:oob'
  );

  const authUrl = oAuth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: config.scopes,
  });

  console.log('Open this URL in your browser:\n');
  console.log(authUrl);
  console.log('\nAfter authorizing, paste the code below.\n');

  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  const code = await new Promise<string>(resolve => {
    rl.question('Authorization code: ', (answer) => { rl.close(); resolve(answer.trim()); });
  });

  const { tokens } = await oAuth2Client.getToken(code);
  fs.writeFileSync(config.tokenPath, JSON.stringify(tokens, null, 2));
  console.log(`\nToken saved to: ${config.tokenPath}`);

  // Verify
  oAuth2Client.setCredentials(tokens);
  const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });
  const res = await calendar.events.list({
    calendarId: 'primary',
    timeMin: new Date().toISOString(),
    maxResults: 3,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = res.data.items || [];
  console.log(`\n✅ Authentication successful! Found ${events.length} upcoming event(s).`);
  if (events.length > 0) {
    for (const e of events) {
      const start = e.start?.dateTime || e.start?.date || '';
      console.log(`  - ${e.summary} (${start})`);
    }
  }
}

setup().catch(err => {
  console.error('Setup failed:', err.message);
  process.exit(1);
});
