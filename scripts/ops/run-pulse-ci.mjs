#!/usr/bin/env node

import { spawn } from 'node:child_process';
import path from 'node:path';

const rootDir = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  '..',
  '..',
);

const timeoutMs = Number.parseInt(process.env.PULSE_CI_TIMEOUT_MS || '', 10) || 300000;
const child = spawn(
  process.execPath,
  [path.join(rootDir, 'scripts', 'pulse', 'run.js'), '--certify', '--tier', '0'],
  {
    cwd: rootDir,
    stdio: 'inherit',
    env: {
      ...process.env,
      PULSE_DISABLE_LOCAL_ENV:
        process.env.PULSE_DISABLE_LOCAL_ENV || 'true',
    },
  },
);

const timer = setTimeout(() => {
  console.error(
    `PULSE CI timed out after ${timeoutMs}ms. Investigate deep runtime probes or raise PULSE_CI_TIMEOUT_MS if the longer runtime is intentional.`,
  );
  child.kill('SIGTERM');
}, timeoutMs);

child.on('exit', (code, signal) => {
  clearTimeout(timer);

  if (signal) {
    process.exit(124);
  }

  process.exit(code ?? 1);
});

child.on('error', (error) => {
  clearTimeout(timer);
  console.error(`Failed to start PULSE CI: ${error.message}`);
  process.exit(1);
});
