import { readdirSync } from 'node:fs';
import path from 'node:path';

const NON_PRODUCTION_PREFIXES = ['scripts/ops/', 'ops/', '.github/', 'docs/', 'e2e/'];
const TS_PRODUCTION_PREFIXES = ['backend/src/', 'frontend/src/', 'worker/src/'];
const PRISMA_PRODUCTION_PREFIXES = ['backend/prisma/', 'prisma/'];
const TS_SOURCE_SUFFIXES = ['.ts', '.tsx', '.mts', '.cts'];
const PRISMA_SOURCE_SUFFIXES = ['.prisma', '.sql'];
const FUNCTIONAL_PROOF_PREFIXES = ['e2e/', 'docs/adr/', 'docs/runbooks/', 'scripts/smoke/'];
const FUNCTIONAL_PROOF_TERMS = 'smoke proof certification readiness contract integration'.split(
  ' ',
);

export function countGeneratedOverlayNotes(root, forbiddenDirs) {
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

export function collectStatusNameEntries(execGit) {
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

export function isProductionSourceFile(file) {
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

export function hasFunctionalProofSignal(file) {
  return (
    isTestFile(file) ||
    hasAnyPrefix(file, FUNCTIONAL_PROOF_PREFIXES) ||
    includesAnyTerm(file, FUNCTIONAL_PROOF_TERMS)
  );
}

function isTestFile(file) {
  return (
    /(?:^|\/)(?:__tests__|test|tests|specs)\//.test(file) ||
    /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file)
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
