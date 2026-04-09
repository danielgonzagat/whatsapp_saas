#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const frontendRoot = resolve(repoRoot, 'frontend');
const tempRoot = mkdtempSync(resolve(tmpdir(), 'kloel-frontend-build-'));
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

function listUntrackedFrontendPaths() {
  const output = run(
    'git',
    ['ls-files', '--others', '--exclude-standard', '--', 'frontend'],
    repoRoot,
    {
      stdio: ['ignore', 'pipe', 'pipe'],
      encoding: 'utf8',
    },
  ).trim();
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
  const rsyncArgs = [
    '-a',
    '--delete',
    '--exclude',
    'node_modules',
    '--exclude',
    '.next',
    '--exclude',
    '.turbo',
    '--exclude',
    'coverage',
    '--exclude',
    '.vercel',
  ];

  for (const untrackedPath of untrackedFrontendPaths) {
    rsyncArgs.push('--exclude', untrackedPath);
  }
  rsyncArgs.push(`${frontendRoot}/`, `${tempRoot}/`);

  run('rsync', rsyncArgs);

  if (!existsSync(frontendNodeModules)) {
    throw new Error(
      '[frontend:build:clean] node_modules do frontend não encontrado para o build isolado.',
    );
  }

  console.log('[frontend:build:clean] copiando node_modules do frontend para o workspace isolado');
  cpSync(frontendNodeModules, `${tempRoot}/node_modules`, { recursive: true });

  const buildArgs = resolveBuildArgs();
  console.log(
    `[frontend:build:clean] executando next build ${buildArgs.join(' ')} com timeout de ${BUILD_TIMEOUT_MS}ms`,
  );
  run('npm', ['run', 'build', '--', ...buildArgs], tempRoot);
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
