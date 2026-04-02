#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const frontendRoot = resolve(repoRoot, 'frontend');
const tempRoot = mkdtempSync(resolve(tmpdir(), 'kloel-frontend-build-'));
const BUILD_TIMEOUT_MS = Number(process.env.KLOEL_FRONTEND_BUILD_TIMEOUT_MS || 180000);

function run(command, cwd = repoRoot) {
  execSync(command, {
    cwd,
    stdio: 'inherit',
    timeout: BUILD_TIMEOUT_MS,
  });
}

let failure = null;

try {
  console.log(`[frontend:build:clean] copiando frontend para ${tempRoot}`);
  run(
    [
      'rsync -a --delete',
      "--exclude '.next'",
      "--exclude '.turbo'",
      "--exclude 'coverage'",
      "--exclude '.vercel'",
      `${frontendRoot}/`,
      `${tempRoot}/`,
    ].join(' '),
  );

  console.log(`[frontend:build:clean] executando next build com timeout de ${BUILD_TIMEOUT_MS}ms`);
  run('npm run build', tempRoot);
} catch (error) {
  failure = error;
} finally {
  rmSync(tempRoot, { recursive: true, force: true });
}

if (failure) {
  if (failure?.code === 'ETIMEDOUT') {
    console.error(
      `[frontend:build:clean] build excedeu o timeout de ${BUILD_TIMEOUT_MS}ms. O Next iniciou, mas não finalizou dentro da janela configurada.`,
    );
  } else {
    console.error('[frontend:build:clean] falha ao validar o build limpo do frontend.');
  }

  process.exit(1);
}
