/**
 * Ocado Integration - Host-side IPC Handler
 *
 * Handles all ocado_* IPC messages from container agents.
 * Runs Playwright scripts on the host using the user's real Chrome session.
 *
 * SAFETY: Only ocado_search, ocado_get_basket, ocado_add_to_basket, ocado_get_lists
 * are handled. There is NO checkout handler — it is architecturally impossible
 * for the agent to trigger payment.
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
    'ocado-integration',
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
      resolve({ success: false, message: 'Script timed out (120s)' });
    }, 120000);

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
  const dir = path.join(dataDir, 'ipc', sourceGroup, 'ocado_results');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, `${requestId}.json`), JSON.stringify(result));
}

/**
 * Handle Ocado IPC messages.
 * @returns true if message was handled, false if not an ocado_* message
 */
export async function handleOcadoIpc(
  data: Record<string, unknown>,
  sourceGroup: string,
  isMain: boolean,
  dataDir: string,
): Promise<boolean> {
  const type = data.type as string;

  if (!type?.startsWith('ocado_')) return false;

  if (!isMain) {
    logger.warn(
      { sourceGroup, type },
      'Ocado integration blocked: not main group',
    );
    return true;
  }

  const requestId = data.requestId as string;
  if (!requestId) {
    logger.warn({ type }, 'Ocado request missing requestId');
    return true;
  }

  logger.info({ type, requestId }, 'Processing Ocado request');

  let result: SkillResult;

  switch (type) {
    case 'ocado_search':
      result = await runScript('search', {
        query: data.query,
        limit: data.limit ?? 10,
      });
      break;

    case 'ocado_get_basket':
      result = await runScript('get-basket', {});
      break;

    case 'ocado_get_lists':
      result = await runScript('get-lists', {});
      break;

    // NOTE: ocado_checkout is intentionally absent.
    // The agent cannot trigger checkout — only the user can via the checkout URL.

    default:
      return false;
  }

  writeResult(dataDir, sourceGroup, requestId, result);
  if (result.success) {
    logger.info({ type, requestId }, 'Ocado request completed');
  } else {
    logger.error(
      { type, requestId, message: result.message },
      'Ocado request failed',
    );
  }
  return true;
}
