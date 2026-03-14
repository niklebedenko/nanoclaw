/**
 * Google Calendar - Host-side IPC Handler
 *
 * Handles all gcal_* IPC messages from container agents.
 * Runs scripts via googleapis on the host using OAuth2 tokens.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import pino from 'pino';

const logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  transport: { target: 'pino-pretty', options: { colorize: true } },
});

interface SkillResult {
  success: boolean;
  message: string;
  data?: unknown;
}

async function runScript(script: string, args: object): Promise<SkillResult> {
  const scriptPath = path.join(
    process.cwd(),
    '.claude',
    'skills',
    'gcal-integration',
    'scripts',
    `${script}.ts`,
  );

  return new Promise((resolve) => {
    const proc = spawn(
      'node',
      [require.resolve('tsx/dist/cli.mjs'), scriptPath],
      {
        cwd: process.cwd(),
        env: { ...process.env, NANOCLAW_ROOT: process.cwd() },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: true,
      },
    );

    let stdout = '';
    let stderr = '';
    proc.stdout.on('data', (d) => {
      stdout += d.toString();
    });
    proc.stderr.on('data', (d) => {
      stderr += d.toString();
    });
    proc.stdin.write(JSON.stringify(args));
    proc.stdin.end();

    const timer = setTimeout(() => {
      proc.kill('SIGTERM');
      resolve({ success: false, message: 'Script timed out (60s)' });
    }, 60000);

    proc.on('close', (code) => {
      clearTimeout(timer);
      if (stderr)
        logger.debug({ script, stderr: stderr.slice(0, 500) }, 'Script stderr');
      if (code !== 0) {
        resolve({
          success: false,
          message: `Script exited with code ${code}: ${stderr.slice(0, 200)}`,
        });
        return;
      }
      try {
        const lines = stdout.trim().split('\n');
        resolve(JSON.parse(lines[lines.length - 1]));
      } catch {
        resolve({
          success: false,
          message: `Failed to parse output: ${stdout.slice(0, 200)}`,
        });
      }
    });

    proc.on('error', (err) => {
      clearTimeout(timer);
      resolve({
        success: false,
        message: `Failed to spawn script: ${err.message}`,
      });
    });
  });
}

function writeResult(
  dataDir: string,
  sourceGroup: string,
  requestId: string,
  result: SkillResult,
): void {
  const dir = path.join(dataDir, 'ipc', sourceGroup, 'gcal_results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${requestId}.json`), JSON.stringify(result));
}

/**
 * Handle Google Calendar IPC messages.
 * @returns true if message was handled, false if not a gcal_* message
 */
export async function handleGcalIpc(
  data: Record<string, unknown>,
  sourceGroup: string,
  isMain: boolean,
  dataDir: string,
): Promise<boolean> {
  const type = data.type as string;

  if (!type?.startsWith('gcal_')) return false;

  if (!isMain) {
    logger.warn(
      { sourceGroup, type },
      'Google Calendar blocked: not main group',
    );
    return true;
  }

  const requestId = data.requestId as string;
  if (!requestId) {
    logger.warn({ type }, 'GCal request missing requestId');
    return true;
  }

  logger.info({ type, requestId }, 'Processing GCal request');

  let result: SkillResult;

  switch (type) {
    case 'gcal_list_events':
      result = await runScript('list-events', {
        maxResults: data.maxResults ?? 10,
        timeMin: data.timeMin,
        timeMax: data.timeMax,
      });
      break;

    case 'gcal_create_event':
      result = await runScript('create-event', {
        summary: data.summary,
        start: data.start,
        end: data.end,
        description: data.description,
        location: data.location,
        attendees: data.attendees,
      });
      break;

    case 'gcal_update_event':
      result = await runScript('update-event', {
        eventId: data.eventId,
        summary: data.summary,
        start: data.start,
        end: data.end,
        description: data.description,
        location: data.location,
        attendees: data.attendees,
      });
      break;

    case 'gcal_delete_event':
      result = await runScript('delete-event', { eventId: data.eventId });
      break;

    case 'gcal_search_events':
      result = await runScript('search-events', {
        query: data.query,
        timeMin: data.timeMin,
        timeMax: data.timeMax,
        maxResults: data.maxResults ?? 10,
      });
      break;

    default:
      return false;
  }

  writeResult(dataDir, sourceGroup, requestId, result);
  if (result.success) {
    logger.info({ type, requestId }, 'GCal request completed');
  } else {
    logger.error(
      { type, requestId, message: result.message },
      'GCal request failed',
    );
  }
  return true;
}
