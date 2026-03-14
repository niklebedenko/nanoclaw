import { getCalendar, runScript, ScriptResult } from '../lib/auth.js';
import { config } from '../lib/config.js';

interface Input {
  query: string;
  timeMin?: string;
  timeMax?: string;
  maxResults?: number;
}

runScript<Input>(async ({ query, timeMin, timeMax, maxResults = 10 }): Promise<ScriptResult> => {
  if (!query?.trim()) {
    return { success: false, message: 'Search query cannot be empty.' };
  }

  const calendar = await getCalendar();
  const res = await calendar.events.list({
    calendarId: config.calendarId,
    q: query,
    timeMin: timeMin || new Date().toISOString(),
    timeMax: timeMax || undefined,
    maxResults,
    singleEvents: true,
    orderBy: 'startTime',
  });

  const events = (res.data.items || []).map(e => ({
    id: e.id,
    summary: e.summary || '(no title)',
    start: e.start?.dateTime || e.start?.date || '',
    end: e.end?.dateTime || e.end?.date || '',
    location: e.location || '',
    description: e.description?.slice(0, 200) || '',
    link: e.htmlLink || '',
  }));

  return {
    success: true,
    message: events.length ? `Found ${events.length} event(s) matching "${query}"` : `No events found for "${query}".`,
    data: { events },
  };
});
