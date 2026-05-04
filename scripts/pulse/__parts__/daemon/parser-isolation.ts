import * as path from 'path';
import { spawn } from 'child_process';
import type { Break, PulseConfig, PulseParserDefinition } from '../../types';

function resolveTsNodeRegister(rootDir: string): string {
  const candidates = [
    rootDir,
    path.join(rootDir, 'backend'),
    path.join(rootDir, 'worker'),
    path.join(rootDir, 'e2e'),
  ];
  for (const candidate of candidates) {
    try {
      return require.resolve('ts-node/register/transpile-only', { paths: [candidate] });
    } catch {
      // Try the next workspace.
    }
  }
  throw new Error('Unable to resolve ts-node/register/transpile-only for isolated parser worker.');
}

function parseParserWorkerOutput(output: string): Break[] {
  const line = output
    .split(/\r?\n/)
    .reverse()
    .find((entry) => entry.startsWith('__PULSE_PARSER_RESULT__'));
  if (!line) {
    throw new Error('Parser worker exited without a structured result.');
  }
  const payload = JSON.parse(line.replace('__PULSE_PARSER_RESULT__', '')) as
    | { ok: true; breaks: Break[] }
    | { ok: false; error: string };
  if (payload.ok === false) {
    throw new Error(payload.error);
  }
  return payload.breaks;
}

function runParserInIsolatedProcess(
  parser: PulseParserDefinition,
  config: PulseConfig,
  timeoutMs: number,
): Promise<Break[]> {
  return new Promise((resolve, reject) => {
    const workerPath = path.join(config.rootDir, 'scripts', 'pulse', 'parser-worker.ts');
    const encodedConfig = Buffer.from(JSON.stringify(config), 'utf8').toString('base64url');
    const startedAt = Date.now();
    const commandArgs = [
      '-r',
      resolveTsNodeRegister(config.rootDir),
      workerPath,
      parser.name,
      '<encoded-config>',
    ];
    const child = spawn(
      process.execPath,
      commandArgs.map((arg) => (arg === '<encoded-config>' ? encodedConfig : arg)),
      {
        cwd: config.rootDir,
        env: {
          ...process.env,
          TS_NODE_PROJECT: path.join(config.rootDir, 'scripts', 'pulse', 'tsconfig.json'),
        },
        stdio: ['ignore', 'pipe', 'pipe'],
      },
    );
    let settled = false;
    let stdout = '';
    let stderr = '';
    const buildDiagnostic = (kind: 'timeout' | 'failure', extra: string): string => {
      const elapsedMs = Date.now() - startedAt;
      return [
        `parser=${parser.name}`,
        `file=${parser.file}`,
        `kind=${kind}`,
        `pid=${child.pid ?? 'unknown'}`,
        `elapsedMs=${elapsedMs}`,
        `timeoutMs=${timeoutMs}`,
        `command=${process.execPath} ${commandArgs.join(' ')}`,
        `stdout=${stdout.trim().slice(-2000) || '<empty>'}`,
        `stderr=${stderr.trim().slice(-2000) || '<empty>'}`,
        extra,
      ].join(' | ');
    };
    const timer = setTimeout(() => {
      if (settled) {
        return;
      }
      settled = true;
      child.kill('SIGKILL');
      reject(
        new Error(
          buildDiagnostic(
            'timeout',
            'action=SIGKILL sent to isolated parser worker because the parser exceeded its budget.',
          ),
        ),
      );
    }, timeoutMs);

    child.stdout.on('data', (chunk: Buffer) => {
      stdout += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      stderr += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      reject(error);
    });
    child.on('close', (code) => {
      if (settled) {
        return;
      }
      settled = true;
      clearTimeout(timer);
      try {
        resolve(parseParserWorkerOutput(stdout));
      } catch (error) {
        const detail = stderr.trim()
          ? `${(error as Error).message}: ${stderr.trim()}`
          : (error as Error).message;
        reject(
          new Error(
            buildDiagnostic(
              'failure',
              code === 0 ? `result=${detail}` : `exitCode=${code} | result=${detail}`,
            ),
          ),
        );
      }
    });
  });
}

/**
 * Run parser with timeout enforcement.
 *
 * @param parser - Parser definition.
 * @param config - Pulse config.
 * @param timeoutMs - Timeout in milliseconds.
 * @returns Breaks found by parser.
 * @throws Error if parser times out.
 */
export async function runParserWithTimeout(
  parser: PulseParserDefinition,
  config: PulseConfig,
  timeoutMs: number,
): Promise<Break[]> {
  return runParserInIsolatedProcess(parser, config, timeoutMs);
}
