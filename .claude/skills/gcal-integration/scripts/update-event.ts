import { getCalendar, runScript, ScriptResult } from '../lib/auth.js';
import { config } from '../lib/config.js';

interface Input {
  eventId: string;
  summary?: string;
  start?: string;
  end?: string;
  description?: string;
  location?: string;
  attendees?: string[];
  timeZone?: string;
}

function toEventTime(dt: string, tz?: string) {
  if (dt.includes('T')) {
    return { dateTime: dt, timeZone: tz };
  }
  return { date: dt };
}

runScript<Input>(async ({ eventId, summary, start, end, description, location, attendees, timeZone }): Promise<ScriptResult> => {
  if (!eventId) {
    return { success: false, message: 'eventId is required.' };
  }

  const calendar = await getCalendar();
  const tz = timeZone || Intl.DateTimeFormat().resolvedOptions().timeZone;

  const body: Record<string, unknown> = {};
  if (summary !== undefined) body.summary = summary;
  if (description !== undefined) body.description = description;
  if (location !== undefined) body.location = location;
  if (start !== undefined) body.start = toEventTime(start, tz);
  if (end !== undefined) body.end = toEventTime(end, tz);
  if (attendees !== undefined) body.attendees = attendees.map(email => ({ email }));

  const res = await calendar.events.patch({
    calendarId: config.calendarId,
    eventId,
    requestBody: body,
  });

  return {
    success: true,
    message: `Event updated: "${res.data.summary}"`,
    data: {
      id: res.data.id,
      summary: res.data.summary,
      start: res.data.start?.dateTime || res.data.start?.date,
      end: res.data.end?.dateTime || res.data.end?.date,
      link: res.data.htmlLink,
    },
  };
});
