#!/usr/bin/env node
// tools/e2e-sandbox/seed.mjs — seeds minimum data the most important flows need.
// Reads from .env.sandbox (must be `up` first).

import { readFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..', '..');

async function main() {
  const env = await loadEnv(join(ROOT, '.env.sandbox'));
  if (!env.DATABASE_URL) {
    throw new Error('.env.sandbox missing — run sandbox:up first');
  }

  console.log('[sandbox:seed] running prisma migrate deploy + db push');
  await run(['npx', 'prisma', 'migrate', 'deploy'], { cwd: join(ROOT, 'backend'), env: { ...process.env, ...env } });

  // Tiny inline seed via psql — workspace + user + product.
  const seedSql = `
INSERT INTO "Workspace"(id, name, "createdAt", "updatedAt")
VALUES ('ws-sandbox-1', 'Sandbox Workspace', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;

INSERT INTO "User"(id, email, name, "workspaceId", "createdAt", "updatedAt")
VALUES ('user-sandbox-1', 'sandbox@kloel.test', 'Sandbox User', 'ws-sandbox-1', NOW(), NOW())
ON CONFLICT (id) DO NOTHING;
`;
  await run(['psql', env.DATABASE_URL, '-v', 'ON_ERROR_STOP=1', '-c', seedSql], { env: process.env });
  console.log('[sandbox:seed] minimum data inserted');
}

async function loadEnv(file) {
  try {
    const raw = await readFile(file, 'utf8');
    const env = {};
    for (const line of raw.split('\n')) {
      const m = line.match(/^([A-Z_][\w]*)=(.+)$/);
      if (m) env[m[1]] = m[2];
    }
    return env;
  } catch {
    return {};
  }
}

function run(argv, { cwd, env }) {
  return new Promise((resolve, reject) => {
    const child = spawn(argv[0], argv.slice(1), { cwd, env, stdio: 'inherit' });
    child.on('exit', (code) => (code === 0 ? resolve() : reject(new Error(`${argv.join(' ')} → exit ${code}`))));
    child.on('error', reject);
  });
}

await main().catch((e) => {
  console.error('[sandbox:seed] FAIL:', e.message);
  process.exit(1);
});
