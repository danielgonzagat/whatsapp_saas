import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
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

export function isTestFile(file) {
  return (
    /(?:^|\/)(?:__tests__|test|tests|specs)\//.test(file) ||
    /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(file)
  );
}

/**
 * Pure predicate: returns `true` when `file` is plausibly a text source we
 * should scan for forbidden patterns. Anything > 2 MiB is skipped to avoid
 * loading binary blobs into memory.
 */
export function isTextFile(repoRoot, file) {
  if (statSync(path.join(repoRoot, file)).size > 2 * 1024 * 1024) {
    return false;
  }
  return /\.(?:js|mjs|cjs|ts|tsx|jsx|json|md|yml|yaml|sh|css|scss|html|txt|prisma|sql|toml|conf|template)$/.test(
    file,
  );
}

/**
 * Merge two `Map<file, addedText>` records, joining overlapping entries with
 * a newline. Used to combine HEAD/cached/range diff passes into a single
 * "added lines" view per file.
 */
export function mergeAddedTextByFile(target, source) {
  for (const [file, added] of source) {
    target.set(file, [target.get(file), added].filter(Boolean).join('\n'));
  }
}

/**
 * Parse `git diff --unified=0` output into `Map<file, addedText>`. Only `+`
 * lines (excluding the `+++` header) survive; `+++ /dev/null` resets the
 * current file marker. Pure string transformation — no I/O.
 */
export function parseAddedTextByFile(diff) {
  const byFile = new Map();
  let currentFile = null;

  for (const line of diff.split('\n')) {
    if (line.startsWith('+++ b/')) {
      currentFile = line.slice('+++ b/'.length);
      if (!byFile.has(currentFile)) {
        byFile.set(currentFile, '');
      }
      continue;
    }
    if (line.startsWith('+++ /dev/null')) {
      currentFile = null;
      continue;
    }
    if (!currentFile || !line.startsWith('+') || line.startsWith('+++')) {
      continue;
    }
    byFile.set(currentFile, [byFile.get(currentFile), line.slice(1)].filter(Boolean).join('\n'));
  }

  return byFile;
}

/**
 * Read `docs/architecture/CANONICAL_MOVES.md` and return the set of legacy
 * paths that the human-authored manifesto explicitly authorizes for deletion
 * (because the responsibility moved/consolidated/retired). The manifest lists
 * each row as a Markdown table; we extract paths from the first column when
 * they look like repo-relative source paths.
 */
export function loadCanonicalMoveApprovals(repoRoot) {
  const manifestPath = path.join(repoRoot, 'docs', 'architecture', 'CANONICAL_MOVES.md');
  if (!existsSync(manifestPath)) {
    return new Set();
  }
  const approved = new Set();
  const body = readFileSync(manifestPath, 'utf8');
  for (const line of body.split('\n')) {
    if (!line.startsWith('|')) continue;
    const cells = line.split('|').map((c) => c.trim());
    if (cells.length < 2) continue;
    const first = cells[1];
    if (!first) continue;
    const m = first.match(/^`([^`]+)`$/);
    if (m && m[1].includes('/')) {
      approved.add(m[1]);
    }
  }
  return approved;
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
