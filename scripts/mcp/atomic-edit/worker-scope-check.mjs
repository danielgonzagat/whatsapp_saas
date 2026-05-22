#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';

function parseArgs(argv) {
  const repo = [];
  const allow = [];
  const require = [];
  let json = false;

  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--repo') {
      repo.push(argv[++i]);
    } else if (argv[i] === '--allow') {
      allow.push(argv[++i]);
    } else if (argv[i] === '--require') {
      require.push(argv[++i]);
    } else if (argv[i] === '--json') {
      json = true;
    }
  }

  return {
    repo: repo.length > 0 ? repo[0] : process.cwd(),
    allow,
    require,
    json,
  };
}

function getChangedFiles(repoPath) {
  const git = spawnSync('git', ['status', '--porcelain=v1'], {
    cwd: repoPath,
    encoding: 'utf8',
  });

  if (git.error) {
    throw new Error(`git status failed: ${git.error.message}`);
  }
  if (git.status !== 0) {
    throw new Error(`git status exited ${git.status}: ${git.stderr}`);
  }

  const lines = git.stdout.split('\n').filter(Boolean);
  const files = [];

  for (const line of lines) {
    const rest = line.substring(3);

    if (line.startsWith('R ') || line.startsWith('C ')) {
      const arrowIdx = rest.indexOf(' -> ');
      if (arrowIdx !== -1) {
        files.push(rest.substring(arrowIdx + 4));
      }
    } else {
      files.push(rest);
    }
  }

  return files;
}

function normalizePath(raw) {
  return raw.replace(/^\.\//, '').replace(/\/$/, '');
}

function isDefaultIgnoredPath(relPath) {
  return relPath === '.atomic' || relPath.startsWith('.atomic/');
}

function isOutsideRepo(repoPath, relPath) {
  const resolved = path.resolve(repoPath, relPath);
  const resolvedRepo = path.resolve(repoPath);
  return !resolved.startsWith(resolvedRepo + path.sep) && resolved !== resolvedRepo;
}

function anyPathMatches(changed, target) {
  return changed.some(
    (f) =>
      f === target ||
      target.startsWith(f + '/') ||
      f.startsWith(target + '/') ||
      target === '.',
  );
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const { repo, allow, require, json } = args;

  if (!fs.statSync(repo).isDirectory()) {
    process.stderr.write(`Error: --repo path is not a directory: ${repo}\n`);
    process.exit(2);
  }

  for (const p of [...allow, ...require]) {
    if (path.isAbsolute(p)) {
      process.stderr.write(
        `Error: --allow/--require paths must be repo-relative, got absolute: ${p}\n`,
      );
      process.exit(2);
    }
    if (isOutsideRepo(repo, p)) {
      process.stderr.write(`Error: path resolves outside repo: ${p}\n`);
      process.exit(2);
    }
  }

  let changedFiles;
  try {
    changedFiles = getChangedFiles(repo);
  } catch (err) {
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(2);
  }

  const normalizedChanged = changedFiles.map(normalizePath).filter((f) => !isDefaultIgnoredPath(f));
  const normalizedAllow = allow.map(normalizePath);
  const normalizedRequire = require.map(normalizePath);

  function isAllowed(f) {
    if (normalizedAllow.length === 0) return true;
    return normalizedAllow.some((a) => anyPathMatches([f], a));
  }

  const violations = normalizedChanged.filter((f) => !isAllowed(f));
  const missingRequired = normalizedRequire.filter(
    (r) => !anyPathMatches(normalizedChanged, r),
  );

  const ok = violations.length === 0 && missingRequired.length === 0;

  if (json) {
    process.stdout.write(
      JSON.stringify({
        ok,
        repo: path.resolve(repo),
        allowlist: normalizedAllow,
        required: normalizedRequire,
        changedFiles: normalizedChanged,
        violations,
        missingRequired,
      }) + '\n',
    );
  } else {
    process.stdout.write(`Repo: ${path.resolve(repo)}\n`);
    process.stdout.write(
      `Allowlist: ${normalizedAllow.length > 0 ? normalizedAllow.join(', ') : '(none)'}\n`,
    );
    process.stdout.write(
      `Required: ${normalizedRequire.length > 0 ? normalizedRequire.join(', ') : '(none)'}\n`,
    );
    process.stdout.write(`Changed files (${normalizedChanged.length}):\n`);

    for (const f of normalizedChanged) {
      const marker = isAllowed(f) ? '\u2713' : '\u2717';
      process.stdout.write(`  ${marker} ${f}\n`);
    }

    if (violations.length > 0) {
      process.stdout.write(`\nVIOLATIONS (${violations.length}):\n`);
      for (const v of violations) {
        process.stdout.write(`  \u2717 ${v} (not in allowlist)\n`);
      }
    }

    if (missingRequired.length > 0) {
      process.stdout.write(`\nMISSING REQUIRED (${missingRequired.length}):\n`);
      for (const r of missingRequired) {
        process.stdout.write(`  \u2717 ${r} (required but not in changed files)\n`);
      }
    }

    if (ok) {
      process.stdout.write(
        `\n\u2713 All changed files within allowlist, all required files present.\n`,
      );
    } else {
      process.stdout.write(`\n\u2717 Scope check FAILED.\n`);
    }
  }

  process.exit(ok ? 0 : 1);
}

main();
