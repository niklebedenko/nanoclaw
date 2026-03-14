import { getCalendar, runScript, ScriptResult } from '../lib/auth.js';
import { config } from '../lib/config.js';

interface Input {
  summary: string;
  start: string;
  end: string;
  description?: string;
  location?: string;
  attendees?: string[];
  timeZone?: string;
}

function toEventTime(dt: string, tz?: string) {
  // All-day: "2026-03-15", timed: "2026-03-15T10:00:00"
  if (dt.includes('T')) {
    return { dateTime: dt.includes('+') || dt.endsWith('Z') ? dt : dt, timeZone: tz };
  }
  return { date: dt };
}

runScript<Input>(async ({ summary, start, end, description, location, attendees, timeZone }): Promise<ScriptResult> => {
  if (!summary || !start || !end) {
    return { success: false, message: 'summary, start, and end are required.' };
  }

  const calendar = await getCalendar();
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const res = await calendar.events.insert({
    calendarId: config.calendarId,
    requestBody: {
      summary,
      description,
      location,
      start: toEventTime(start, tz),
      end: toEventTime(end, tz),
      attendees: attendees?.map(email => ({ email })),
    },
  });

  return {
    success: true,
    message: `Event created: "${res.data.summary}"`,
    data: {
      id: res.data.id,
      summary: res.data.summary,
      start: res.data.start?.dateTime || res.data.start?.date,
      end: res.data.end?.dateTime || res.data.end?.date,
      link: res.data.htmlLink,
    },
  };
});
