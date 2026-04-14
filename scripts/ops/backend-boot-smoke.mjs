#!/usr/bin/env node
/**
 * Backend boot smoke test.
 *
 * Launches `node backend/dist/src/bootstrap.js` with a stub env and waits
 * for NestJS to report `AppModule dependencies initialized`. Exits 0 on
 * success, non-zero on any dependency-injection failure, missing-module
 * exception, or timeout.
 *
 * This closes the gap documented in commit f29bc060 where biome's
 * `organizeImports` reorder silently broke a module-cycle eager reference
 * and the test suite (which uses `@nestjs/testing` Test.createTestingModule)
 * did not catch it. The official NestFactory path that production uses
 * behaves differently — this smoke test exercises that exact path.
 *
 * Expected to be called from scripts/ops/run-scoped-pre-push.mjs after
 * `Backend build` when backendChanged is true. Also safe to invoke
 * manually: `node scripts/ops/backend-boot-smoke.mjs`.
 */

import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

const REPO_ROOT = process.cwd();
const BOOTSTRAP_PATH = resolve(REPO_ROOT, 'backend/dist/src/bootstrap.js');
const TIMEOUT_MS = 25_000;
// Wait for these markers in any order. They span the three module cycles that
// historically broke: BillingModule (cycle A), WhatsappModule (cycle A+B),
// KloelModule (cycle B), plus AppModule to prove full graph resolution, plus
// RoutesResolver to prove controllers are being mounted (late signal — if we
// see this, NestJS has passed the DI phase entirely).
const MODULE_MARKERS = [
  'BillingModule dependencies initialized',
  'WhatsappModule dependencies initialized',
  'KloelModule dependencies initialized',
  'AppModule dependencies initialized',
];
const LATE_MARKER = 'RoutesResolver';
const FAILURE_PATTERNS = [
  /UndefinedModuleException/,
  /Nest cannot create the .+ instance/,
  /The module at index \[\d+\] of the .+ "imports" array is undefined/,
  /Cannot read propert(?:y|ies) of undefined/,
  /Circular dependency detected/,
];

if (!existsSync(BOOTSTRAP_PATH)) {
  console.error(
    `[boot-smoke] Missing ${BOOTSTRAP_PATH}. Run \`npm --prefix backend run build\` first.`,
  );
  process.exit(2);
}

const STUB_ENV = {
  ...process.env,
  NODE_ENV: 'test',
  // Postgres will refuse auth in the stub env — that is fine and expected.
  // `SKIP_DB_CONNECTION_CHECK=1` tells main.ts to proceed even though the
  // db check fails, so we can exercise the NestJS DI path end-to-end.
  SKIP_DB_CONNECTION_CHECK: '1',
  DATABASE_URL: 'postgresql://boot-smoke:boot-smoke@127.0.0.1:5432/boot-smoke?schema=public',
  REDIS_URL: 'redis://127.0.0.1:6379',
  JWT_SECRET: 'boot-smoke-test-secret-32-characters-long-xxx',
  JWT_REFRESH_SECRET: 'boot-smoke-test-refresh-32-characters-long-xx',
  ASAAS_API_KEY: 'stub',
  ASAAS_WEBHOOK_TOKEN: 'stub',
  OPENAI_API_KEY: 'stub',
  PORT: '0',
};

console.log(`[boot-smoke] Spawning ${BOOTSTRAP_PATH} with stub env (timeout ${TIMEOUT_MS}ms)`);

const child = spawn(process.execPath, [BOOTSTRAP_PATH], {
  cwd: REPO_ROOT,
  env: STUB_ENV,
  stdio: ['ignore', 'pipe', 'pipe'],
});

let buffer = '';
let resolved = false;

function finish(code, reason) {
  if (resolved) return;
  resolved = true;
  if (child.exitCode === null) {
    child.kill('SIGTERM');
  }
  if (code === 0) {
    console.log(`[boot-smoke] OK — ${reason}`);
  } else {
    console.error(`[boot-smoke] FAIL — ${reason}`);
    console.error('[boot-smoke] Captured output (tail):');
    console.error(
      buffer
        .split('\n')
        .filter((line) => line.trim().length > 0)
        .slice(-60)
        .join('\n'),
    );
  }
  setTimeout(() => process.exit(code), 200);
}

function inspectBuffer() {
  for (const pattern of FAILURE_PATTERNS) {
    const match = buffer.match(pattern);
    if (match) {
      finish(1, `failure pattern matched: ${match[0].slice(0, 200)}`);
      return;
    }
  }
  if (!buffer.includes(LATE_MARKER)) return;
  const missing = MODULE_MARKERS.filter((marker) => !buffer.includes(marker));
  if (missing.length > 0) {
    finish(1, `${LATE_MARKER} reached but missing: ${missing.join(', ')}`);
    return;
  }
  finish(0, `${LATE_MARKER} reached with all cycle modules initialized`);
}

child.stdout.on('data', (chunk) => {
  buffer += chunk.toString();
  inspectBuffer();
});
child.stderr.on('data', (chunk) => {
  buffer += chunk.toString();
  inspectBuffer();
});
child.on('error', (err) => finish(1, `child process error: ${err.message}`));
child.on('exit', (code, signal) => {
  if (resolved) return;
  finish(1, `bootstrap exited early with code=${code} signal=${signal ?? 'none'}`);
});

setTimeout(() => finish(1, `timeout after ${TIMEOUT_MS}ms waiting for AppModule init`), TIMEOUT_MS);
