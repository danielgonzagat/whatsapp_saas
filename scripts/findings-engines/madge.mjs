#!/usr/bin/env node
/**
 * madge findings engine — circular dependency detection per workspace.
 * NOT constitution-locked.
 */

import { existsSync } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { buildReport, fingerprint } from './_schema.mjs';

const execFileP = promisify(execFile);

const SOURCE_ROOTS = ['backend/src', 'frontend/src', 'worker/src'];

async function getVersion() {
  try {
    const { stdout } = await execFileP('npx', ['--no-install', 'madge', '--version'], {
      maxBuffer: 64 * 1024 * 1024,
      timeout: 15_000,
    });
    return stdout.trim();
  } catch {
    return 'unknown';
  }
}

async function runMadge(srcRoot) {
  try {
    const { stdout } = await execFileP(
      'npx',
      [
        '--no-install',
        'madge',
        '--extensions',
        'ts,tsx,mts,mjs,js',
        '--circular',
        '--json',
        srcRoot,
      ],
      { maxBuffer: 64 * 1024 * 1024, timeout: 60_000 },
    );
    return parseMadgeOutput(stdout);
  } catch (err) {
    // madge exits 1 when cycles exist — not a failure
    if (err.stdout) return parseMadgeOutput(err.stdout);
    throw err;
  }
}

function parseMadgeOutput(raw) {
  const start = raw.indexOf('[');
  const end = raw.lastIndexOf(']');
  if (start === -1 || end === -1 || start > end) return [];
  const json = raw.slice(start, end + 1);
  return JSON.parse(json);
}

async function collectFindings() {
  const version = await getVersion();
  const start = performance.now();
  const findings = [];

  for (const srcRoot of SOURCE_ROOTS) {
    if (!existsSync(srcRoot)) continue;

    const cycles = await runMadge(srcRoot);

    for (const cycle of cycles) {
      if (!Array.isArray(cycle) || cycle.length < 2) continue;

      const cyclePaths = cycle.map((p) => `${srcRoot}/${p}`.replace(/\/+/g, '/'));

      const cycleStr = `${cyclePaths.join(' → ')} → ${cyclePaths[0]}`;

      for (const file of cyclePaths) {
        findings.push({
          file,
          line: undefined,
          category: 'cycle',
          severity: 'high',
          engine: 'madge',
          rule: 'madge/circular',
          message: `circular dependency in cycle: ${cycleStr}`,
          fingerprint: fingerprint({
            file,
            line: 0,
            rule: 'madge/circular',
            message: `circular dependency in cycle: ${cycleStr}`,
          }),
        });
      }
    }
  }

  const durationMs = Math.round(performance.now() - start);

  process.stdout.write(
    JSON.stringify(buildReport('madge', version, findings, { durationMs, status: 'ok' }), null, 2) +
      '\n',
  );
}

collectFindings().catch((err) => {
  console.error('madge engine error:', err.message);
  process.exit(1);
});
