/**
 * GitNexus command runner — safe CLI invocation for all gitnexus commands.
 */
import { spawn } from 'node:child_process';

import type { GitNexusCommandResult } from './types';

const DEFAULT_TIMEOUT_MS = 300_000;
const MAX_BUFFER_BYTES = 10 * 1024 * 1024;

function appendLimited(current: string, chunk: Buffer): string {
  const next = current + chunk.toString('utf8');
  if (Buffer.byteLength(next, 'utf8') <= MAX_BUFFER_BYTES) return next;
  return next.slice(next.length - MAX_BUFFER_BYTES);
}

function killProcessGroup(pid: number | undefined): void {
  if (!pid) return;
  try {
    process.kill(-pid, 'SIGKILL');
    return;
  } catch {
    // Fallback for platforms or shells that do not expose a process group.
  }

  try {
    process.kill(pid, 'SIGKILL');
  } catch {
    // Best-effort termination. The caller still resolves with a timeout.
  }
}

export function runGitNexus(
  args: string[],
  cwd?: string,
  timeoutMs?: number,
): Promise<GitNexusCommandResult> {
  const start = Date.now();
  return new Promise((resolve) => {
    const limitMs = timeoutMs ?? DEFAULT_TIMEOUT_MS;
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    let settled = false;
    let timeout: NodeJS.Timeout | undefined;
    let timeoutFallback: NodeJS.Timeout | undefined;

    const finish = (result: GitNexusCommandResult): void => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      if (timeoutFallback) clearTimeout(timeoutFallback);
      resolve(result);
    };

    const child = spawn(
      'npx',
      ['-y', 'gitnexus@latest', ...args],
      {
        cwd: cwd ?? process.cwd(),
        env: { ...process.env },
        detached: true,
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );

    timeoutFallback = setTimeout(() => {
      finish({
        command: 'gitnexus',
        args,
        exitCode: null,
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut: true,
      });
    }, limitMs + 5_000);

    timeout = setTimeout(() => {
      timedOut = true;
      stderr += `\nTimeout after ${limitMs}ms`;
      killProcessGroup(child.pid);
    }, limitMs);

    child.stdout?.on('data', (chunk: Buffer) => {
      stdout = appendLimited(stdout, chunk);
    });

    child.stderr?.on('data', (chunk: Buffer) => {
      stderr = appendLimited(stderr, chunk);
    });

    child.on('error', (err) => {
      finish({
        command: 'gitnexus',
        args,
        exitCode: null,
        stdout: '',
        stderr: err.message,
        durationMs: Date.now() - start,
        timedOut: false,
      });
    });

    child.on('close', (code, signal) => {
      finish({
        command: 'gitnexus',
        args,
        exitCode: timedOut ? null : (code ?? (signal ? 1 : null)),
        stdout,
        stderr,
        durationMs: Date.now() - start,
        timedOut,
      });
    });
  });
}
