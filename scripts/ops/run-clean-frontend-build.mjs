#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const frontendRoot = resolve(repoRoot, 'frontend');
const frontendNextDir = resolve(frontendRoot, '.next');
const frontendNodeModules = resolve(frontendRoot, 'node_modules');
const BUILD_TIMEOUT_MS = Number(process.env.KLOEL_FRONTEND_BUILD_TIMEOUT_MS || 180000);
const WHITESPACE_SPLIT_RE = /\s+/;
const FLAG_ARG_RE = /^--[a-z0-9-]+$/i;

function run(command, args, cwd = repoRoot, { stdio = 'inherit', encoding } = {}) {
  return execFileSync(command, args, {
    cwd,
    stdio,
    encoding,
    timeout: BUILD_TIMEOUT_MS,
  });
}

function resolveBuildArgs() {
  const rawArgs = String(process.env.KLOEL_FRONTEND_BUILD_ARGS || '--webpack')
    .split(WHITESPACE_SPLIT_RE)
    .map((item) => item.trim())
    .filter(Boolean);

  const allowedArgs = rawArgs.filter((item) => FLAG_ARG_RE.test(item));
  return allowedArgs.length > 0 ? allowedArgs : ['--webpack'];
}

function assertCleanWorktree() {
  const output = run('git', ['status', '--porcelain'], repoRoot, {
    stdio: ['ignore', 'pipe', 'pipe'],
    encoding: 'utf8',
  }).trim();

  if (!output) return;

  throw new Error(
    '[frontend:build:clean] o worktree precisa estar limpo para validar exatamente o commit que sera publicado.',
  );
}

let failure = null;

try {
  assertCleanWorktree();

  if (!existsSync(frontendNodeModules)) {
    throw new Error(
      '[frontend:build:clean] node_modules do frontend nao encontrado. Rode npm --prefix frontend ci antes do build limpo.',
    );
  }

  console.log('[frontend:build:clean] limpando .next do frontend antes da validacao');
  rmSync(frontendNextDir, { recursive: true, force: true });

  const buildArgs = resolveBuildArgs();
  console.log(
    `[frontend:build:clean] executando next build ${buildArgs.join(' ')} com timeout de ${BUILD_TIMEOUT_MS}ms`,
  );
  run('npm', ['run', 'build', '--', ...buildArgs], frontendRoot);
} catch (error) {
  failure = error;
}

if (failure) {
  if (failure?.code === 'ETIMEDOUT') {
    console.error(
      `[frontend:build:clean] build excedeu o timeout de ${BUILD_TIMEOUT_MS}ms. O Next iniciou, mas nao finalizou dentro da janela configurada.`,
    );
  } else if (
    typeof failure?.message === 'string' &&
    failure.message.includes('Failed to fetch') &&
    failure.message.includes('Google Fonts')
  ) {
    console.error(
      '[frontend:build:clean] build falhou por dependencia de Google Fonts em ambiente sem rede. Troque o import por fonte local/sistema ou rode o gate em ambiente com acesso externo.',
    );
  } else {
    console.error(
      typeof failure?.message === 'string'
        ? failure.message
        : '[frontend:build:clean] falha ao validar o build limpo do frontend.',
    );
  }

  process.exit(1);
}
