import { getCalendar, runScript, ScriptResult } from '../lib/auth.js';
import { config } from '../lib/config.js';

interface Input {
  maxResults?: number;
  timeMin?: string;
  timeMax?: string;
}

runScript<Input>(async ({ maxResults = 10, timeMin, timeMax }): Promise<ScriptResult> => {
  const calendar = await getCalendar();
  const res = await calendar.events.list({
    calendarId: config.calendarId,
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
    attendees: (e.attendees || []).map(a => a.email).filter(Boolean),
    link: e.htmlLink || '',
  }));

  return {
    success: true,
    message: events.length ? `${events.length} upcoming event(s)` : 'No upcoming events.',
    data: { events },
  };
});
