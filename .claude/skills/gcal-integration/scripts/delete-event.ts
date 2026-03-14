import { getCalendar, runScript, ScriptResult } from '../lib/auth.js';
import { config } from '../lib/config.js';

interface Input {
  eventId: string;
}

runScript<Input>(async ({ eventId }): Promise<ScriptResult> => {
  if (!eventId) {
    return { success: false, message: 'eventId is required.' };
  }

  const calendar = await getCalendar();
  await calendar.events.delete({
    calendarId: config.calendarId,
    eventId,
  });

  return {
    success: true,
    message: `Event ${eventId} deleted.`,
  };
});
