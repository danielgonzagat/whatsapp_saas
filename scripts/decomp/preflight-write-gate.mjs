#!/usr/bin/env node
// PreToolUse hook for Write/Edit/MultiEdit.
//
// SAFETY MISSION: bloquear, ANTES da escrita acontecer, qualquer operação
// de IA CLI que produziria um arquivo que o GitHub não aceitaria. Sem isso,
// IAs gastam tokens construindo errado e mais tokens consertando.
//
// Hook protocol:
//   - Lê JSON do stdin: { tool_name, tool_input: { file_path, content, old_string, new_string, edits, replace_all } }
//   - Em caso de violação: print mensagem de erro em stderr, exit 2 (Claude Code: bloqueia tool e mostra stderr ao modelo)
//   - Em caso ok: exit 0
//
// Regras enforcedas: ver scripts/decomp/lib/gate-rules.mjs

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '..', '..');

const { evaluateContent, simulateToolEdit, getLockedFiles, isProtectedPath, isSelfImmutable } =
  await import('./lib/gate-rules.mjs');

function readStdin() {
  try {
    return readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function block(reasons) {
  const header =
    '🛑 WORKSPACE GATE BLOCK — operação não permitida pelo espelho local de governance GitHub';
  const body = reasons.map((r, i) => '  [' + (i + 1) + '] ' + r).join('\n');
  const footer =
    '\n— Este bloqueio é INTRANSPONÍVEL. Qualquer IA CLI no workspace está sujeita às mesmas regras.\n' +
    '— Para decompor arquivos > limite de linha use SOMENTE: node scripts/decomp/safe-decompose.mjs\n' +
    '— Para forbidden tokens: corrija a causa raiz, nunca suprima.\n' +
    '— Regras canônicas: scripts/decomp/lib/gate-rules.mjs e CI scripts/ops/check-architecture-guardrails.mjs';
  process.stderr.write(header + '\n' + body + footer + '\n');
  process.exit(2);
}

function allow() {
  process.exit(0);
}

const raw = readStdin();
if (!raw) allow();

let payload;
try {
  payload = JSON.parse(raw);
} catch {
  allow();
}

const toolName = payload.tool_name;
const toolInput = payload.tool_input;
if (!toolInput || !toolInput.file_path) allow();
if (!['Write', 'Edit', 'MultiEdit'].includes(toolName)) allow();

const filePath = toolInput.file_path;
const relPath = path.isAbsolute(filePath) ? path.relative(REPO_ROOT, filePath) : filePath;

// REGRA 1: arquivos protegidos por CLAUDE.md são intocáveis por IA
if (isProtectedPath(relPath)) {
  block([
    'Arquivo PROTEGIDO por CLAUDE.md: ' + relPath,
    'Somente o dono do repositório (humano) pode editar este arquivo. Se uma regra precisa mudar, peça ao Daniel.',
  ]);
}

// REGRA 2: arquivos do próprio sistema de gates não podem ser modificados por IA
// (se uma IA editar a regra, todo o sistema é burlado — daí intransponível)
if (isSelfImmutable(relPath)) {
  block([
    'Arquivo SELF-IMMUTABLE: ' + relPath + ' faz parte do sistema de governance do workspace.',
    'Nenhuma IA pode editar arquivos que controlam as próprias regras (anti-burla). Apenas Daniel pode.',
  ]);
}

// REGRA 3: simula a edição e roda gates de conteúdo
let sim;
try {
  sim = simulateToolEdit({ toolName, toolInput, repoRoot: REPO_ROOT });
} catch (e) {
  // simulação falhou — não bloqueia (tool real vai falhar/funcionar normalmente)
  allow();
}
if (!sim) allow();

const lockedFiles = getLockedFiles(REPO_ROOT);
const violations = evaluateContent({
  relPath: sim.relPath,
  content: sim.resulting,
  isNewFile: sim.isNewFile,
  lockedFiles,
});

if (violations.length > 0) {
  block(violations.map((v) => '[' + v.rule + '] ' + v.detail));
}

allow();
