#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const frontendRoot = resolve(repoRoot, 'frontend');
const tempRoot = mkdtempSync(resolve(tmpdir(), 'kloel-frontend-build-'));
const BUILD_TIMEOUT_MS = Number(process.env.KLOEL_FRONTEND_BUILD_TIMEOUT_MS || 180000);
const BUILD_ARGS = process.env.KLOEL_FRONTEND_BUILD_ARGS || '--webpack';
const frontendNodeModules = resolve(frontendRoot, 'node_modules');

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function run(command, cwd = repoRoot) {
  execSync(command, {
    cwd,
    stdio: 'inherit',
    timeout: BUILD_TIMEOUT_MS,
  });
}

function read(command, cwd = repoRoot) {
  return execSync(command, {
    cwd,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

function listUntrackedFrontendPaths() {
  const output = read('git ls-files --others --exclude-standard -- frontend');
  if (!output) return [];

  return output
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => line.replace(/^frontend\//, ''))
    .filter(Boolean);
}

let failure = null;

try {
  console.log(`[frontend:build:clean] copiando frontend para ${tempRoot}`);
  const untrackedFrontendPaths = listUntrackedFrontendPaths();
  const untrackedExcludes = untrackedFrontendPaths.map((path) => `--exclude ${shellQuote(path)}`);

  run(
    [
      'rsync -a --delete',
      "--exclude 'node_modules'",
      "--exclude '.next'",
      "--exclude '.turbo'",
      "--exclude 'coverage'",
      "--exclude '.vercel'",
      ...untrackedExcludes,
      `${frontendRoot}/`,
      `${tempRoot}/`,
    ].join(' '),
  );

  if (!existsSync(frontendNodeModules)) {
    throw new Error(
      '[frontend:build:clean] node_modules do frontend não encontrado para o build isolado.',
    );
  }

  console.log('[frontend:build:clean] copiando node_modules do frontend para o workspace isolado');
  run(`cp -R '${frontendNodeModules}' '${tempRoot}/node_modules'`);

  console.log(
    `[frontend:build:clean] executando next build ${BUILD_ARGS} com timeout de ${BUILD_TIMEOUT_MS}ms`,
  );
  run(`npm run build -- ${BUILD_ARGS}`.trim(), tempRoot);
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
  } else if (
    typeof failure?.message === 'string' &&
    failure.message.includes('Failed to fetch') &&
    failure.message.includes('Google Fonts')
  ) {
    console.error(
      '[frontend:build:clean] build falhou por dependência de Google Fonts em ambiente sem rede. Troque o import por fonte local/sistema ou rode o gate em ambiente com acesso externo.',
    );
  } else {
    console.error('[frontend:build:clean] falha ao validar o build limpo do frontend.');
  }

  process.exit(1);
}
