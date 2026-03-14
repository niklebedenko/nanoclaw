import path from 'path';

const ROOT = process.env.NANOCLAW_ROOT || process.cwd();

export const config = {
  credentialsPath: path.join(ROOT, 'data', 'gcal-credentials.json'),
  tokenPath: path.join(ROOT, 'data', 'gcal-token.json'),
  calendarId: 'primary',
  scopes: ['https://www.googleapis.com/auth/calendar'],
};
