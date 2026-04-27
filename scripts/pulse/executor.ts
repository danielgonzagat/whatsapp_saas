/**
 * Agent Executor abstraction.
 * Replaces hard-coded `codex exec --full-auto` with pluggable backends.
 *   - CodexExecutor — spawns `codex exec --full-auto` (legacy)
 *   - KiloExecutor  — in-process agent (DeepSeek V4 Pro / Kilo)
 */

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { buildArtifactRegistry } from './artifact-registry';
import { ensureDir, pathExists, readTextFile } from './safe-fs';

export interface ExecutorResult {
  executed: boolean;
  command: string | null;
  exitCode: number | null;
  finalMessage: string | null;
}

export interface Executor {
  readonly name: string;
  isAvailable(): boolean;
  runUnit(
    rootDir: string,
    prompt: string,
    opts?: { model?: string; timeout?: number },
  ): Promise<ExecutorResult>;
}

export class CodexExecutor implements Executor {
  readonly name = 'codex';
  isAvailable(): boolean {
    try {
      const r = spawnSync('codex', ['--version'], {
        encoding: 'utf8',
        stdio: 'pipe',
        timeout: 10_000,
      });
      return r.status === 0;
    } catch {
      return false;
    }
  }
  async runUnit(
    rootDir: string,
    prompt: string,
    opts?: { model?: string; timeout?: number },
  ): Promise<ExecutorResult> {
    const registry = buildArtifactRegistry(rootDir);
    ensureDir(registry.tempDir, { recursive: true });
    const logPath = path.join(registry.tempDir, `pulse-exec-codex-${Date.now()}.txt`);
    const args = ['exec', '--full-auto', '-C', rootDir, '--output-last-message', logPath];
    if (opts?.model) args.push('-m', opts.model);
    args.push('-');
    const result = spawnSync('codex', args, {
      cwd: rootDir,
      input: prompt,
      encoding: 'utf8',
      stdio: ['pipe', 'inherit', 'inherit'],
      timeout: opts?.timeout ?? 600_000,
    });
    return {
      executed: true,
      command: ['codex', ...args].join(' '),
      exitCode: result.status,
      finalMessage:
        (pathExists(logPath) ? readTextFile(logPath).trim() : null) ||
        result.stdout?.slice(0, 2000) ||
        null,
    };
  }
}

export class KiloExecutor implements Executor {
  readonly name = 'kilo';
  /**
   * Honest availability check: this executor only writes a context file
   * and does NOT autonomously run Kilo, so it should advertise itself as
   * available only when the operator has explicitly opted in via
   * `KLOEL_KILO_EXECUTOR_AVAILABLE=true`. Otherwise the autonomy loop
   * (executor.ts callers) sees a falsy `isAvailable` and skips it instead
   * of believing a Kilo run actually happened.
   */
  isAvailable(): boolean {
    return process.env.KLOEL_KILO_EXECUTOR_AVAILABLE === 'true';
  }
  async runUnit(
    rootDir: string,
    prompt: string,
    _opts?: { model?: string; timeout?: number },
  ): Promise<ExecutorResult> {
    const registry = buildArtifactRegistry(rootDir);
    ensureDir(registry.tempDir, { recursive: true });
    const execFile = path.join(registry.tempDir, 'KILO_EXEC_CONTEXT.json');
    const outputFile = path.join(registry.tempDir, 'KILO_EXEC_RESULT.json');
    const fs = await import('fs/promises');
    await fs.writeFile(
      execFile,
      JSON.stringify(
        { prompt, rootDir, timestamp: new Date().toISOString(), outputPath: outputFile },
        null,
        2,
      ),
      'utf8',
    );
    return {
      executed: false,
      command: `kilo:${execFile}`,
      exitCode: null,
      finalMessage: `KILO_EXEC_CONTEXT written to ${execFile}. The in-process Kilo agent should execute this unit and write results to ${outputFile}. After completion, re-run PULSE validation to confirm.`,
    };
  }
}

export type ExecutorKind = 'codex' | 'kilo';

export function createExecutor(kind: ExecutorKind): Executor {
  switch (kind) {
    case 'codex':
      return new CodexExecutor();
    case 'kilo':
      return new KiloExecutor();
    default:
      throw new Error(`Unknown executor kind: ${kind}`);
  }
}

export function detectAvailableExecutor(): ExecutorKind | null {
  if (new CodexExecutor().isAvailable()) return 'codex';
  if (process.env.KILO_AGENT_ID || process.env.DEEPSEEK_API_KEY) return 'kilo';
  return null;
}
