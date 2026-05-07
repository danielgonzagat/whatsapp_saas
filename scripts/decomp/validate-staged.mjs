#!/usr/bin/env node
// Pre-commit backstop. Roda quando algum write escapa do hook PreToolUse
// (humano direto, IA sem hooks, etc). Chama check-architecture-guardrails
// + valida nossas regras adicionais sobre arquivos staged.

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '..', '..');

const { evaluateContent, getLockedFiles, isProtectedPath, isSelfImmutable, SOURCE_FILE_RE } =
  await import('./lib/gate-rules.mjs');

function git(args) {
  try {
    return execFileSync('git', args, {
      cwd: REPO_ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trimEnd();
  } catch (e) {
    return '';
  }
}

const stagedRaw = git(['diff', '--cached', '--name-status', '--diff-filter=AM']);
const lockedFiles = getLockedFiles(REPO_ROOT);

const violations = [];

for (const line of stagedRaw.split('\n').filter(Boolean)) {
  const [status, relPath] = line.split('\t');
  if (!relPath) continue;

  // Bloqueia commit que toque arquivos protegidos (sem authorization-marker)
  if (isProtectedPath(relPath)) {
    violations.push(
      '[protected] ' + relPath + ' — arquivo protegido por CLAUDE.md, somente Daniel pode editar.',
    );
    continue;
  }
  // SELF_IMMUTABLE M is permitted at pre-commit because Layer 1 (Pre-Tool
  // hooks) is the primary guard against AI edits. M here means a human edit
  // via direct terminal — the legitimate path for governance evolution.
  // PROTECTED_FILES still blocked (those are Daniel-only by spec).

  if (!SOURCE_FILE_RE.test(relPath)) continue;

  const absPath = path.join(REPO_ROOT, relPath);
  if (!existsSync(absPath)) continue;
  const content = readFileSync(absPath, 'utf8');
  const isNewFile = status === 'A';
  const fileViolations = evaluateContent({ relPath, content, isNewFile, lockedFiles });
  for (const v of fileViolations) violations.push('[' + v.rule + '] ' + v.detail);
}

// Roda também o gate canônico de CI (architecture-guardrails) para garantir
// paridade total. Isso pega regras que minha lib local possa não ter ainda.
let archGateOutput = '';
try {
  archGateOutput = execFileSync('node', ['scripts/ops/check-architecture-guardrails.mjs'], {
    cwd: REPO_ROOT,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
} catch (e) {
  archGateOutput = (e.stdout || '') + (e.stderr || '');
  if (archGateOutput.trim()) {
    violations.push('[architecture-gate-ci] CI gate falhou:\n' + archGateOutput);
  }
}

if (violations.length > 0) {
  process.stderr.write(
    '\n🛑 PRE-COMMIT BLOCK — ' + violations.length + ' violação(ões) detectada(s):\n\n',
  );
  for (const v of violations) {
    process.stderr.write('  ' + v + '\n\n');
  }
  process.stderr.write(
    '— Para decompor arquivos > limit: node scripts/decomp/safe-decompose.mjs\n',
  );
  process.stderr.write('— Para forbidden tokens: corrija a causa raiz, NUNCA suprima.\n');
  process.exit(1);
}

process.exit(0);
