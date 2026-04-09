#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const frontendRoot = resolve(repoRoot, 'frontend');
const tempRepoRoot = mkdtempSync(resolve(tmpdir(), 'kloel-frontend-build-'));
const tempFrontendRoot = resolve(tempRepoRoot, 'frontend');
const BUILD_TIMEOUT_MS = Number(process.env.KLOEL_FRONTEND_BUILD_TIMEOUT_MS || 180000);
const frontendNodeModules = resolve(frontendRoot, 'node_modules');

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
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);

  const allowedArgs = rawArgs.filter((item) => /^--[a-z0-9-]+$/i.test(item));
  return allowedArgs.length > 0 ? allowedArgs : ['--webpack'];
}

let failure = null;

try {
  rmSync(tempRepoRoot, { recursive: true, force: true });
  console.log(`[frontend:build:clean] criando worktree limpo em ${tempRepoRoot}`);
  run('git', ['worktree', 'add', '--detach', tempRepoRoot, 'HEAD']);

  if (!existsSync(frontendNodeModules)) {
    throw new Error(
      '[frontend:build:clean] node_modules do frontend não encontrado para o build isolado.',
    );
  }

  console.log('[frontend:build:clean] copiando node_modules do frontend para o workspace isolado');
  cpSync(frontendNodeModules, `${tempFrontendRoot}/node_modules`, { recursive: true });

  const buildArgs = resolveBuildArgs();
  console.log(
    `[frontend:build:clean] executando next build ${buildArgs.join(' ')} com timeout de ${BUILD_TIMEOUT_MS}ms`,
  );
  run('npm', ['run', 'build', '--', ...buildArgs], tempFrontendRoot);
} catch (error) {
  failure = error;
} finally {
  try {
    run('git', ['worktree', 'remove', '--force', tempRepoRoot]);
  } catch {
    rmSync(tempRepoRoot, { recursive: true, force: true });
  }
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
