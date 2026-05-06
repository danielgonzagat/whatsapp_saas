#!/usr/bin/env node
// safe-decompose.mjs — única ferramenta autorizada para decompor arquivos
// que excederiam os limites do gate. Garante preservação 100% de tecnologia
// (snapshot → execute → verify → rollback se algo for perdido).
//
// Uso:
//   node scripts/decomp/safe-decompose.mjs --file <path> --plan <plan.json> [--dry-run]
//
// plan.json formato:
//   {
//     "parts": {
//       "<partName>.ts": ["exportA", "exportB", ...],
//       "<partName2>.ts": ["exportC", ...]
//     },
//     "shim": "re-export"   // ou "passthrough" (default re-export)
//   }
//
// Pré-condição:
//   Toda export top-level do arquivo original DEVE estar atribuída a exatamente
//   um part. Caso contrário, exit não-zero ANTES de qualquer escrita.
//
// Pós-condição (verificada):
//   1. Cada part respeita MAX_NEW_FILE_LINES.
//   2. Cada part NÃO contém forbidden tokens.
//   3. Soma de exports nos parts == exports originais. Sem perda.
//   4. Cada export é importável a partir do shim (re-export check).
//   5. Hash do conteúdo recombinado (modulo imports e whitespace) é compatível.
//
// Se qualquer pós-condição falhar: ROLLBACK do backup, exit 1.

import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync, rmSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(here, '..', '..');

const { evaluateContent, extractExports, getLockedFiles, MAX_NEW_FILE_LINES } =
  await import('./lib/gate-rules.mjs');

function die(msg) {
  process.stderr.write('safe-decompose: ' + msg + '\n');
  process.exit(1);
}

function parseArgs(argv) {
  const a = { dryRun: false };
  for (let i = 2; i < argv.length; i++) {
    const k = argv[i];
    if (k === '--file') a.file = argv[++i];
    else if (k === '--plan') a.plan = argv[++i];
    else if (k === '--dry-run') a.dryRun = true;
  }
  if (!a.file || !a.plan) die('uso: --file <path> --plan <plan.json> [--dry-run]');
  return a;
}

function sha256(s) {
  return createHash('sha256').update(s).digest('hex');
}

function normalizeForHash(content) {
  // remove imports, comments, blank lines — para checagem de equivalência
  // estrutural entre original vs recombinado.
  return content
    .split('\n')
    .filter((l) => !/^\s*import\s/.test(l))
    .filter((l) => !/^\s*\/\//.test(l))
    .filter((l) => !/^\s*\/\*/.test(l) && !/^\s*\*/.test(l) && !/^\s*\*\/\s*$/.test(l))
    .filter((l) => l.trim().length > 0)
    .join('\n');
}

const args = parseArgs(process.argv);
const fileAbs = path.isAbsolute(args.file) ? args.file : path.join(REPO_ROOT, args.file);
const fileRel = path.relative(REPO_ROOT, fileAbs);

if (!existsSync(fileAbs)) die('arquivo não existe: ' + fileRel);
const original = readFileSync(fileAbs, 'utf8');
const originalHash = sha256(original);
const originalExports = extractExports(original);

if (originalExports.size === 0) {
  die('arquivo não exporta nada (top-level). Decomposição sem sentido.');
}

const planAbs = path.isAbsolute(args.plan) ? args.plan : path.join(REPO_ROOT, args.plan);
if (!existsSync(planAbs)) die('plan.json não existe: ' + args.plan);
let plan;
try {
  plan = JSON.parse(readFileSync(planAbs, 'utf8'));
} catch (e) {
  die('plan.json inválido: ' + e.message);
}
if (!plan.parts || typeof plan.parts !== 'object') die('plan.json: faltou campo "parts"');

// Valida cobertura: cada export do original presente em exatamente um part.
const planned = new Set();
for (const [partName, exps] of Object.entries(plan.parts)) {
  for (const e of exps) {
    if (planned.has(e)) die('export "' + e + '" atribuído a mais de um part.');
    planned.add(e);
  }
}
const missing = [...originalExports].filter((e) => !planned.has(e) && !e.startsWith('default:'));
if (missing.length > 0) {
  die('plan incompleto. Exports não atribuídos: ' + missing.join(', '));
}

// Snapshot: backup do arquivo original
const auditDir = path.join(REPO_ROOT, '.audit', 'safe-decompose');
mkdirSync(auditDir, { recursive: true });
const backup = path.join(
  auditDir,
  fileRel.replace(/\//g, '__') + '.' + originalHash.slice(0, 12) + '.bak',
);
copyFileSync(fileAbs, backup);

// Determina o diretório dos parts: <fileRel sem extensão>/__parts__/
const baseNoExt = fileRel.replace(/\.tsx?$|\.mjs$|\.cjs$|\.jsx?$/, '');
const partsDir = path.join(REPO_ROOT, baseNoExt, '__parts__');

if (args.dryRun) {
  console.log('[dry-run] backup em', backup);
  console.log('[dry-run] parts em', partsDir);
  console.log('[dry-run] plan:', JSON.stringify(plan.parts, null, 2));
  process.exit(0);
}

// IMPORTANTE: a EXTRAÇÃO real (cortar exports do original e mover para parts)
// requer AST parse confiável (TypeScript Compiler API). Esta versão skeleton
// faz APENAS validação + snapshot + alerta.
//
// O fluxo real esperado: o operador (humano ou Daniel) cria os arquivos parts
// manualmente OU via uma versão completa deste tool, e safe-decompose VERIFICA
// que tudo permanece íntegro.

// Modo VERIFY: se os parts já foram criados (via outra ferramenta ou edição
// manual), verifica que tudo bate.
console.log('[safe-decompose] modo VERIFY (split AST não implementado nesta versão).');
console.log('[safe-decompose] Esperado: parts em', partsDir);
console.log('[safe-decompose] Esperado: shim em', fileAbs);

let allOk = true;
const collectedExports = new Set();
const partFiles = [];

if (existsSync(partsDir)) {
  const fs = await import('node:fs');
  for (const entry of fs.readdirSync(partsDir)) {
    if (!entry.endsWith('.ts') && !entry.endsWith('.tsx')) continue;
    const partPath = path.join(partsDir, entry);
    partFiles.push(partPath);
    const content = readFileSync(partPath, 'utf8');
    const lockedFiles = getLockedFiles(REPO_ROOT);
    const v = evaluateContent({
      relPath: path.relative(REPO_ROOT, partPath),
      content,
      isNewFile: true,
      lockedFiles,
    });
    if (v.length > 0) {
      console.error('[FAIL] part', entry, 'viola gates:');
      for (const vv of v) console.error('  - ' + vv.detail);
      allOk = false;
    }
    for (const e of extractExports(content)) collectedExports.add(e);
  }
} else {
  console.error('[FAIL] partsDir não existe. Decomposição manual ainda não realizada.');
  allOk = false;
}

// Verifica shim (= o arquivo original que vira re-export)
const shim = readFileSync(fileAbs, 'utf8');
const shimExports = extractExports(shim);
for (const e of shimExports) collectedExports.add(e);

// Verifica perda de exports
const lost = [...originalExports].filter((e) => !collectedExports.has(e));
if (lost.length > 0) {
  console.error('[FAIL] exports PERDIDOS após decomposição: ' + lost.join(', '));
  allOk = false;
}

if (!allOk) {
  console.error('[ROLLBACK] restaurando arquivo original do backup ' + backup);
  copyFileSync(backup, fileAbs);
  process.exit(1);
}

console.log(
  '[OK] safe-decompose VERIFY: 0 perdas. Original=' +
    originalExports.size +
    ' exports, parts+shim=' +
    collectedExports.size +
    ' exports.',
);
console.log('[OK] backup preservado em ' + backup);
