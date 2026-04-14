import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { collectChangedFiles, repoRoot } from './changed-files.mjs';

const IGNORED_DIRS = new Set(['.git', '.next', 'build', 'coverage', 'dist', 'node_modules', 'out']);

export { repoRoot };

export function toPosixPath(value) {
  return value.split(path.sep).join('/');
}

export function readRepoFile(relativePath) {
  return readFileSync(path.join(repoRoot, relativePath), 'utf8');
}

export function readJsonFile(relativePath, fallback) {
  const absolutePath = path.join(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    return fallback;
  }

  return JSON.parse(readFileSync(absolutePath, 'utf8'));
}

export function listFiles(relativeRoots, options = {}) {
  const { extensions = null, includeTests = true, changedOnly = false, predicate = null } = options;

  const normalizedRoots = relativeRoots.map((root) => root.replace(/\/+$/, ''));

  const acceptFile = (relativePath) => {
    if (
      extensions &&
      !extensions.some((extension) => relativePath.toLowerCase().endsWith(extension.toLowerCase()))
    ) {
      return false;
    }
    if (!includeTests && /\.(?:spec|test)\.[cm]?[jt]sx?$/.test(relativePath)) {
      return false;
    }
    return predicate ? predicate(relativePath) : true;
  };

  if (changedOnly) {
    return collectChangedFiles()
      .map(toPosixPath)
      .filter((relativePath) =>
        normalizedRoots.some(
          (root) => relativePath === root || relativePath.startsWith(`${root}/`),
        ),
      )
      .filter((relativePath) => existsSync(path.join(repoRoot, relativePath)))
      .filter(acceptFile)
      .sort();
  }

  const results = [];

  const walk = (absoluteDir) => {
    for (const entry of readdirSync(absoluteDir)) {
      if (IGNORED_DIRS.has(entry)) {
        continue;
      }

      const absolutePath = path.join(absoluteDir, entry);
      const stats = statSync(absolutePath);

      if (stats.isDirectory()) {
        walk(absolutePath);
        continue;
      }

      const relativePath = toPosixPath(path.relative(repoRoot, absolutePath));
      if (acceptFile(relativePath)) {
        results.push(relativePath);
      }
    }
  };

  for (const root of normalizedRoots) {
    const absoluteRoot = path.join(repoRoot, root);
    if (!existsSync(absoluteRoot)) {
      continue;
    }
    walk(absoluteRoot);
  }

  return results.sort();
}

export function loadApprovalEntries(relativePath, label) {
  const entries = readJsonFile(relativePath, []);
  if (!Array.isArray(entries)) {
    throw new Error(`${label} deve conter um array.`);
  }

  const today = new Date().toISOString().slice(0, 10);
  for (const entry of entries) {
    const hasFileTarget = typeof entry?.file === 'string' || typeof entry?.filePrefix === 'string';
    if (!hasFileTarget || !entry?.rule || !entry?.reason || !entry?.issue || !entry?.expires) {
      throw new Error(
        `${label} tem uma entrada invalida. Campos obrigatorios: file ou filePrefix, rule, reason, issue, expires.`,
      );
    }

    if (String(entry.expires) < today) {
      throw new Error(
        `${label} contem excecao expirada: ${entry.file} (${entry.rule}) expirou em ${entry.expires}.`,
      );
    }
  }

  return entries;
}

export function matchesApproval(entries, file, rule, matcher) {
  return entries.some((entry) => {
    if (entry.rule !== rule) {
      return false;
    }

    const exactMatch = typeof entry.file === 'string' && entry.file === file;
    const prefixMatch = typeof entry.filePrefix === 'string' && file.startsWith(entry.filePrefix);
    if (!exactMatch && !prefixMatch) {
      return false;
    }

    if (!matcher) {
      return true;
    }

    return matcher(entry);
  });
}

export function runNodeScript(relativePath, args = []) {
  const absolutePath = path.join(repoRoot, relativePath);
  return spawnSync('node', [absolutePath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    stdio: 'pipe',
  });
}
