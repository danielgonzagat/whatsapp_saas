#!/usr/bin/env node

import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import {
  collectChangedFiles,
  collectNameStatus,
  repoRoot,
  resolveDiffRange,
} from './lib/changed-files.mjs';
import { readJsonFile } from './lib/scan-utils.mjs';

const constitution = readJsonFile('ops/kloel-ai-constitution.json', null);
const failures = [];
const CONSTITUTION_AUTHORITY_FILES = new Set([
  'ops/kloel-ai-constitution.json',
  'scripts/ops/check-ai-constitution.mjs',
]);
const REQUIRED_CONSTITUTION_SECTIONS = [
  'graphContract',
  'agentWorkContract',
  'convergenceContract',
  'evidenceContract',
];
const REQUIRED_CONSTITUTION_ARRAYS = [
  ['nonNegotiables', 8],
  ['agentWorkContract.requiredBeforeEditing', 6],
  ['agentWorkContract.requiredAfterEditing', 4],
  ['agentWorkContract.forbiddenWork', 20],
  ['convergenceContract.monotonicRules', 8],
  ['convergenceContract.forbiddenNewCodeSignals', 20],
  ['evidenceContract.acceptedProofClasses', 6],
  ['evidenceContract.rejectedProofClasses', 8],
];
const REQUIRED_SELF_INTEGRITY_SNIPPETS = [
  'resolveDiffRange',
  'collectConstitutionChangedFiles',
  'checkFunctionalProofForProductionChanges',
  'checkGateWiring',
  'checkConstitutionContract',
  'destructive git restore command',
  'hook bypass command',
  'unsafe cast bridge',
  'fake/mock implementation marker',
  'swallowed promise rejection',
  'mudou sem teste/smoke/prova operacional',
];
const PACKAGE_SCRIPT_REQUIREMENTS = [
  [
    'check:ai-constitution',
    (value) => value === 'node scripts/ops/check-ai-constitution.mjs',
    'package.json deve manter check:ai-constitution apontando para scripts/ops/check-ai-constitution.mjs.',
  ],
  [
    'guard:new-code',
    (value) => String(value || '').includes('npm run check:ai-constitution'),
    'guard:new-code deve executar check:ai-constitution antes dos demais gates de codigo novo.',
  ],
  [
    'check:all',
    (value) => String(value || '').includes('check-all-gates.mjs'),
    'check:all deve continuar delegando para scripts/ops/check-all-gates.mjs.',
  ],
];
const GATE_FILE_SNIPPETS = [
  [
    'scripts/ops/check-all-gates.mjs',
    `label: 'governance-boundary'`,
    'check-all-gates deve manter governance-boundary como gate do conjunto completo.',
  ],
  [
    'scripts/ops/check-all-gates.mjs',
    `label: 'ai-constitution'`,
    'check-all-gates deve manter ai-constitution como gate do conjunto completo.',
  ],
  [
    '.github/workflows/ci-cd.yml',
    'npm run check:all',
    '.github/workflows/ci-cd.yml deve executar npm run check:all para tornar a constituicao bloqueante no GitHub.',
  ],
  [
    '.husky/pre-push',
    'npm run prepush:scoped',
    '.husky/pre-push deve continuar chamando npm run prepush:scoped.',
  ],
  [
    'scripts/ops/run-scoped-pre-push.mjs',
    'npm run guard:new-code',
    'scripts/ops/run-scoped-pre-push.mjs deve continuar executando guard:new-code.',
  ],
];
const NON_PRODUCTION_PREFIXES = ['scripts/ops/', 'ops/', '.github/', 'docs/', 'e2e/'];
const TS_PRODUCTION_PREFIXES = ['backend/src/', 'frontend/src/', 'worker/src/'];
const PRISMA_PRODUCTION_PREFIXES = ['backend/prisma/', 'prisma/'];
const TS_SOURCE_SUFFIXES = ['.ts', '.tsx', '.mts', '.cts'];
const PRISMA_SOURCE_SUFFIXES = ['.prisma', '.sql'];
const FUNCTIONAL_PROOF_PREFIXES = ['e2e/', 'docs/adr/', 'docs/runbooks/', 'scripts/smoke/'];
const FUNCTIONAL_PROOF_TERMS = 'smoke proof certification readiness contract integration'.split(
  ' ',
);

if (!constitution?.graphContract || !constitution?.agentWorkContract) {
  fail('ops/kloel-ai-constitution.json ausente ou invalida.');
} else {
  checkConstitutionContract();
  checkSelfIntegrity();
  checkGateWiring();
  checkGraphContract();
  checkChangedFiles();
  checkForbiddenDeletions();
  checkFunctionalProofForProductionChanges();
}

if (failures.length > 0) {
  console.error('[check-ai-constitution] VIOLATION');
  for (const item of failures) {
    console.error(`- ${item}`);
  }
  process.exit(1);
}

console.log('[check-ai-constitution] OK');

function fail(message) {
  failures.push(message);
}

function readRepo(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

function checkConstitutionContract() {
  REQUIRED_CONSTITUTION_SECTIONS.forEach(requireConstitutionSection);
  REQUIRED_CONSTITUTION_ARRAYS.forEach(requireConstitutionArray);
  requireConstitutionMission();
}

function requireConstitutionSection(section) {
  if (!constitution[section] || typeof constitution[section] !== 'object') {
    fail(`ops/kloel-ai-constitution.json deve declarar ${section}.`);
  }
}

function requireConstitutionArray([fieldPath, minLength]) {
  const value = getContractField(fieldPath);
  if (!Array.isArray(value) || value.length < minLength || value.some((item) => !item)) {
    fail(
      `ops/kloel-ai-constitution.json deve manter ${fieldPath} com pelo menos ${minLength} itens.`,
    );
  }
}

function requireConstitutionMission() {
  if (!String(constitution.mission || '').includes('verifiable architecture')) {
    fail('A missao constitucional deve preservar arquitetura verificavel como objetivo explicito.');
  }
}

function getContractField(fieldPath) {
  return fieldPath.split('.').reduce((value, key) => value?.[key], constitution);
}

function checkSelfIntegrity() {
  const source = readRepo('scripts/ops/check-ai-constitution.mjs');
  REQUIRED_SELF_INTEGRITY_SNIPPETS.forEach((snippet) => requireSourceSnippet(source, snippet));
}

function requireSourceSnippet(source, snippet) {
  if (!source.includes(snippet)) {
    fail(`check-ai-constitution deve preservar self-integrity snippet: ${snippet}.`);
  }
}

function checkGateWiring() {
  const packageJson = readJsonFile('package.json', null);
  PACKAGE_SCRIPT_REQUIREMENTS.forEach((requirement) =>
    requirePackageScript(packageJson, requirement),
  );
  GATE_FILE_SNIPPETS.forEach(requireGateFileSnippet);
}

function requirePackageScript(packageJson, [scriptName, predicate, message]) {
  if (!predicate(packageJson?.scripts?.[scriptName])) {
    fail(message);
  }
}

function requireGateFileSnippet([file, snippet, message]) {
  if (existsSync(path.join(repoRoot, file)) && !readRepo(file).includes(snippet)) {
    fail(message);
  }
}

function checkGraphContract() {
  const daemonPath = 'scripts/obsidian-mirror-daemon.mjs';
  const lensPath = 'scripts/obsidian-graph-lens.mjs';
  if (!existsSync(path.join(repoRoot, daemonPath))) {
    fail(`${daemonPath} ausente; o espelho visual do workspace nao pode regredir.`);
    return;
  }
  if (!existsSync(path.join(repoRoot, lensPath))) {
    fail(`${lensPath} ausente; a lente nativa do Graph nao pode regredir.`);
    return;
  }

  const daemon = readRepo(daemonPath);
  const lens = readRepo(lensPath);
  const expectedSearch = JSON.stringify(constitution.graphContract.workspaceSearch);

  for (const [label, source] of [
    [daemonPath, daemon],
    [lensPath, lens],
  ]) {
    if (
      !source.includes(`WORKSPACE_GRAPH_SEARCH = ${expectedSearch}`) &&
      !source.includes(`WORKSPACE_GRAPH_SEARCH = '${constitution.graphContract.workspaceSearch}'`)
    ) {
      fail(`${label} deve manter WORKSPACE_GRAPH_SEARCH = ${expectedSearch}.`);
    }
    if (!source.includes('hideUnresolved: true')) {
      fail(`${label} deve manter hideUnresolved: true para bloquear nos nao-resolvidos.`);
    }
    if (!source.includes('showOrphans: true')) {
      fail(
        `${label} deve manter showOrphans: true para arquivos realmente desconectados continuarem visiveis.`,
      );
    }
  }

  if (!daemon.includes('function mirrorVisibleSegment') || !daemon.includes("'_dot_'")) {
    fail('O espelho deve manter mapeamento _dot_ para diretorios fonte iniciados por ponto.');
  }

  const writeGeneratedIndexes =
    /function writeGeneratedIndexes\(manifest\) \{(?<body>[\s\S]*?)\n\}/.exec(daemon)?.groups
      ?.body || '';
  if (!writeGeneratedIndexes.includes('removeGeneratedGraphOverlays();')) {
    fail('writeGeneratedIndexes deve remover overlays gerados.');
  }
  if (!writeGeneratedIndexes.includes('applyGraphDerivedTags(manifest);')) {
    fail('writeGeneratedIndexes deve aplicar tags derivadas no proprio ponto do arquivo.');
  }
  if (!/applyGraphDerivedTags\(manifest\);\s*return;/.test(writeGeneratedIndexes)) {
    fail('writeGeneratedIndexes deve retornar antes de gerar hubs/fatos artificiais.');
  }

  const bridgePath =
    '/Users/danielpenin/Documents/Obsidian Vault/.obsidian/plugins/codex-obsidian-bridge/main.js';
  if (existsSync(bridgePath)) {
    const bridge = readFileSync(bridgePath, 'utf8');
    if (!bridge.includes(`WORKSPACE_GRAPH_SEARCH = ${expectedSearch}`)) {
      fail('codex-obsidian-bridge deve abrir o Graph com a lente _source.');
    }
    if (!bridge.includes('hideUnresolved: true') || !bridge.includes('showOrphans: true')) {
      fail('codex-obsidian-bridge deve preservar hideUnresolved/showOrphans ao abrir o Graph.');
    }
  }

  const mirrorRoot = path.join(
    '/Users/danielpenin/Documents/Obsidian Vault',
    constitution.graphContract.mirrorRoot,
  );
  if (existsSync(mirrorRoot)) {
    const generatedCount = countGeneratedOverlayNotes(
      mirrorRoot,
      new Set(constitution.graphContract.forbiddenGeneratedSourceDirs),
    );
    if (generatedCount > 0) {
      fail(`O vault contem ${generatedCount} notas de overlay gerado dentro de _source.`);
    }
  }
}

function countGeneratedOverlayNotes(root, forbiddenDirs) {
  let count = 0;
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (forbiddenDirs.has(entry.name)) {
          count += countMarkdown(full);
          continue;
        }
        walk(full);
      }
    }
  };
  walk(root);
  return count;
}

function countMarkdown(dir) {
  let count = 0;
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      count += countMarkdown(full);
    } else if (entry.isFile() && entry.name.endsWith('.md')) {
      count++;
    }
  }
  return count;
}

function checkChangedFiles() {
  const changed = collectConstitutionChangedFiles().filter((file) =>
    existsSync(path.join(repoRoot, file)),
  );
  const forbiddenPatterns = [
    { pattern: /\beslint-disable\b/, label: 'eslint-disable' },
    { pattern: /@ts-ignore|@ts-nocheck|@ts-expect-error/, label: 'TypeScript suppression' },
    {
      pattern: /\bbiome-ignore\b|\bnosemgrep\b|\bNOSONAR\b|\bnoqa\b/,
      label: 'static-analysis suppression',
    },
    { pattern: /\bdescribe\.skip\b|\bit\.skip\b|\btest\.skip\b/, label: 'skipped test' },
    {
      pattern: /\[skip ci\]|\[ci skip\]|\[codacy skip\]|\[skip codacy\]/i,
      label: 'CI/Codacy skip tag',
    },
    { pattern: /\bgit\s+restore\b/, label: 'destructive git restore command' },
    { pattern: /\bgit\s+reset\s+--hard\b/, label: 'destructive git reset command' },
    { pattern: /\bgit\s+checkout\s+--\b/, label: 'destructive git checkout command' },
    { pattern: /\bgit\s+clean\s+-[^\s]*f/, label: 'destructive git clean command' },
    { pattern: /\brm\s+-rf\b/, label: 'destructive recursive removal command' },
    { pattern: /\bgit\s+push\b[^\n]*(?:--force|-f)\b/, label: 'force push command' },
    { pattern: /\bgit\s+(?:commit|push)\b[^\n]*--no-verify\b/, label: 'hook bypass command' },
    { pattern: /\b(?:it|test|describe)\.only\b/, label: 'focused test committed' },
    { pattern: /\bas\s+any\b|:\s*any\b/, label: 'unsafe any type relaxation' },
    { pattern: /\bunknown\s+as\b|\bas\s+unknown\s+as\b/, label: 'unsafe cast bridge' },
    { pattern: /\!\./, label: 'unsafe existence assertion' },
    { pattern: /\bTODO\b|\bFIXME\b|\bHACK\b|\bXXX\b/i, label: 'new unresolved debt marker' },
    { pattern: /\b(?:console\.log|console\.debug|debugger)\b/, label: 'debug artifact' },
    {
      pattern: /\b(?:Math\.random|faker\.|chance\.|loremIpsum)\b/,
      label: 'synthetic runtime data',
    },
    { pattern: /\b(?:localStorage|sessionStorage)\b/, label: 'browser storage as source of truth' },
    {
      pattern: /\b(?:sampleData|demoData|placeholderData|dummyData)\b/i,
      label: 'synthetic data fixture',
    },
    {
      pattern: /\b(?:bypass|skipValidation|ignoreErrors|allowUnsafe|unsafeMode)\b/i,
      label: 'bypass-oriented flag',
    },
    {
      pattern: /\b(?:continueOnError|continue-on-error)\s*[:=]\s*(?:true|'true'|"true")\b/i,
      label: 'error gate converted to advisory mode',
    },
    { pattern: /\bprocess\.exit\(0\)/, label: 'forced successful process exit' },
    {
      pattern: /\bmock(?:ed)?\b|\bfake\b|\bstub\b/i,
      label: 'fake/mock implementation marker',
      productionOnly: true,
    },
    {
      pattern: /return\s+\{[^}\n]*(?:ok|success)\s*:\s*true[^}\n]*\}/,
      label: 'suspicious unconditional success return',
    },
    { pattern: /catch\s*\([^)]*\)\s*\{\s*\}/, label: 'empty catch block' },
    { pattern: /catch\s*\{\s*\}/, label: 'empty catch block' },
    {
      pattern: /catch\s*\([^)]*\)\s*\{\s*(?:return|continue|;)\s*;?\s*\}/,
      label: 'swallowed exception',
    },
    {
      pattern: /catch\s*\{\s*(?:return|continue|;)\s*;?\s*\}/,
      label: 'swallowed exception',
    },
    {
      pattern:
        /\.catch\s*\(\s*(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>\s*(?:\{\s*\}|undefined|null|true|false|Promise\.resolve\([^)]*\))\s*\)/,
      label: 'swallowed promise rejection',
    },
  ];

  for (const file of changed) {
    if (CONSTITUTION_AUTHORITY_FILES.has(file)) {
      continue;
    }
    if (!isTextFile(file)) {
      continue;
    }
    const content = addedTextForFile(file);
    for (const { pattern, label, productionOnly = false } of forbiddenPatterns) {
      if (productionOnly && isTestFile(file)) {
        continue;
      }
      if (pattern.test(content)) {
        fail(`${file} contem ${label}; a constituicao proibe bypass/supressao.`);
      }
    }
  }
}

function addedTextForFile(file) {
  const diffAttempts = [
    ['diff', '--unified=0', '--', file],
    ['diff', '--cached', '--unified=0', '--', file],
  ];

  const diffRange = resolveDiffRange();
  if (diffRange) {
    diffAttempts.push(['diff', '--unified=0', diffRange, '--', file]);
  }

  const added = diffAttempts
    .map((args) => addedTextFromDiff(args))
    .filter(Boolean)
    .join('\n');
  if (added.trim()) {
    return added;
  }

  if (isTracked(file)) {
    return '';
  }
  return readRepo(file);
}

function addedTextFromDiff(args) {
  try {
    return extractAddedText(execGit(args));
  } catch {
    return '';
  }
}

function execGit(args) {
  return execFileSync('git', args, {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  });
}

function extractAddedText(diff) {
  return diff
    .split('\n')
    .filter((line) => line.startsWith('+') && !line.startsWith('+++'))
    .map((line) => line.slice(1))
    .join('\n');
}

function isTracked(file) {
  try {
    execFileSync('git', ['ls-files', '--error-unmatch', '--', file], {
      cwd: repoRoot,
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function isTextFile(file) {
  if (statSync(path.join(repoRoot, file)).size > 2 * 1024 * 1024) {
    return false;
  }
  return /\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|yml|yaml|sh|css|scss|html|txt|prisma|sql|toml|conf|template)$/.test(
    file,
  );
}

function isTestFile(file) {
  return (
    /(?:^|\/)(?:__tests__|test|tests|specs)\//.test(file) ||
    /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file)
  );
}

function checkForbiddenDeletions() {
  const deleted = collectConstitutionNameStatus()
    .filter((entry) => entry.status.startsWith('D'))
    .flatMap((entry) => entry.paths);

  const dangerousDeleted = deleted.filter(
    (file) =>
      /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file) ||
      file.endsWith('.md') ||
      file.startsWith('scripts/ops/') ||
      file.startsWith('ops/') ||
      file.startsWith('.github/workflows/'),
  );

  for (const file of dangerousDeleted) {
    fail(
      `${file} foi deletado; delecao de teste/governance/docs exige prova humana explicita fora do fluxo automatico.`,
    );
  }

  const productionDeleted = deleted.filter((file) => isProductionSourceFile(file));
  if (
    productionDeleted.length > 0 &&
    !collectConstitutionChangedFiles().some(hasFunctionalProofSignal)
  ) {
    for (const file of productionDeleted) {
      fail(
        `${file} foi deletado sem prova funcional alterada; delecao de codigo de producao nao pode esconder falha.`,
      );
    }
  }
}

function checkFunctionalProofForProductionChanges() {
  const changed = collectConstitutionChangedFiles();
  const productionChanged = changed.filter(isUnprovenProductionChangeCandidate);
  if (productionChanged.length === 0 || changed.some(hasFunctionalProofSignal)) {
    return;
  }

  productionChanged.forEach((file) =>
    fail(`${file} mudou sem teste/smoke/prova operacional no mesmo changeset.`),
  );
}

function isUnprovenProductionChangeCandidate(file) {
  return (
    existsSync(path.join(repoRoot, file)) &&
    isProductionSourceFile(file) &&
    !CONSTITUTION_AUTHORITY_FILES.has(file)
  );
}

function collectConstitutionChangedFiles() {
  const statusFiles = collectStatusNameEntries().flatMap((entry) => entry.paths);
  return [...new Set([...collectChangedFiles(), ...statusFiles])].filter(Boolean);
}

function collectConstitutionNameStatus() {
  return [...collectNameStatus(), ...collectStatusNameEntries()];
}

function collectStatusNameEntries() {
  try {
    return parseStatusEntries(execGit(['status', '--short']));
  } catch {
    return [];
  }
}

function parseStatusEntries(output) {
  return output
    .split('\n')
    .filter(Boolean)
    .map(parseStatusEntry)
    .filter((entry) => entry.paths.length > 0);
}

function parseStatusEntry(line) {
  const pathText = line.slice(3);
  const renamedPath = pathText.includes(' -> ') ? pathText.split(' -> ').at(-1) : pathText;
  return {
    status: line.slice(0, 2).trim() || line.slice(0, 2),
    paths: renamedPath ? [renamedPath] : [],
  };
}

function isProductionSourceFile(file) {
  const isTypedSource =
    hasAnyPrefix(file, TS_PRODUCTION_PREFIXES) && hasAnySuffix(file, TS_SOURCE_SUFFIXES);
  const isPrismaSource =
    hasAnyPrefix(file, PRISMA_PRODUCTION_PREFIXES) && hasAnySuffix(file, PRISMA_SOURCE_SUFFIXES);
  const isScriptSource =
    file.startsWith('scripts/') &&
    !file.startsWith('scripts/pulse/parser-tests/') &&
    file.endsWith('.mjs');

  return (
    !isTestFile(file) &&
    !hasAnyPrefix(file, NON_PRODUCTION_PREFIXES) &&
    (isTypedSource || isPrismaSource || isScriptSource)
  );
}

function hasFunctionalProofSignal(file) {
  return (
    isTestFile(file) ||
    hasAnyPrefix(file, FUNCTIONAL_PROOF_PREFIXES) ||
    includesAnyTerm(file, FUNCTIONAL_PROOF_TERMS)
  );
}

function hasAnyPrefix(value, prefixes) {
  return prefixes.some((prefix) => value.startsWith(prefix));
}

function hasAnySuffix(value, suffixes) {
  return suffixes.some((suffix) => value.endsWith(suffix));
}

function includesAnyTerm(value, terms) {
  return terms.some((term) => value.toLowerCase().includes(term));
}
