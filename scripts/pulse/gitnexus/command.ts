/**
 * GitNexus command runner — safe CLI invocation for all gitnexus commands.
 */
import { execFile } from 'node:child_process';

import type { GitNexusCommandResult } from './types';

const DEFAULT_TIMEOUT_MS = 300_000;

export function runGitNexus(
  args: string[],
  cwd?: string,
  timeoutMs?: number,
): Promise<GitNexusCommandResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const child = execFile(
      'npx',
      ['-y', 'gitnexus@latest', ...args],
      {
        cwd: cwd ?? process.cwd(),
        timeout: timeoutMs ?? DEFAULT_TIMEOUT_MS,
        maxBuffer: 10 * 1024 * 1024,
        env: { ...process.env },
        killSignal: 'SIGKILL',
      },
      (error, stdout, stderr) => {
        const durationMs = Date.now() - start;
        if (error) {
          const timedOut =
            (error as NodeJS.ErrnoException).code === 'ETIMEDOUT' || (error as any).killed === true;
          resolve({
            command: 'gitnexus',
            args,
            exitCode: (error as any).code === 'ETIMEDOUT' ? null : ((error as any).code ?? null),
            stdout: stdout ?? '',
            stderr:
              (stderr ?? '') +
              (timedOut ? `\nTimeout after ${timeoutMs ?? DEFAULT_TIMEOUT_MS}ms` : ''),
            durationMs,
            timedOut,
          });
          return;
        }
        resolve({
          command: 'gitnexus',
          args,
          exitCode: 0,
          stdout: stdout ?? '',
          stderr: stderr ?? '',
          durationMs,
          timedOut: false,
        });
      },
    );
    child.on('error', (err) => {
      resolve({
        command: 'gitnexus',
        args,
        exitCode: null,
        stdout: '',
        stderr: err.message,
        durationMs: Date.now() - start,
        timedOut: false,
      });
    });
  });
}
