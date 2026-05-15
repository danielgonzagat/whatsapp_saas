#!/usr/bin/env node

import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const targets = [
  {
    label: 'backend',
    cwd: path.join(repoRoot, 'backend'),
    bin: path.join(repoRoot, 'backend', 'node_modules', '.bin', 'eslint'),
    args: ['{src,apps,libs,test}/**/*.ts'],
  },
  {
    label: 'frontend',
    cwd: path.join(repoRoot, 'frontend'),
    bin: path.join(repoRoot, 'frontend', 'node_modules', '.bin', 'eslint'),
    args: [
      '.',
      '--ignore-pattern',
      'coverage/**',
      '--ignore-pattern',
      '.next/**',
      '--ignore-pattern',
      'dist/**',
    ],
  },
  {
    label: 'worker',
    cwd: path.join(repoRoot, 'worker'),
    bin: path.join(repoRoot, 'worker', 'node_modules', '.bin', 'eslint'),
    args: ['.', '--ignore-pattern', 'coverage/**', '--ignore-pattern', 'dist/**'],
  },
];

function parseArgs(argv) {
  return {
    bootstrap: argv.includes('--bootstrap'),
    frozen: argv.includes('--frozen'),
    update: argv.includes('--update'),
    force: argv.includes('--force'),
  };
}

function normalizeRelPath(target, filePath) {
  const absolutePath = path.isAbsolute(filePath) ? filePath : path.join(target.cwd, filePath);
  return path.relative(repoRoot, absolutePath).split(path.sep).join('/');
}

function findingKey(entry) {
  return `${entry.target}\t${entry.file}\t${entry.ruleId}`;
}

function collectTargetFindings(target, env) {
  const result = spawnSync(target.bin, [...target.args, '--format', 'json'], {
    cwd: target.cwd,
    env,
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    maxBuffer: 128 * 1024 * 1024,
  });

  if (result.error) {
    throw result.error;
  }

  const stdout = result.stdout?.trim() || '[]';
  let parsed;
  try {
    parsed = JSON.parse(stdout);
  } catch (error) {
    throw new Error(
      `Failed to parse ESLint JSON for ${target.label}: ${error?.message || String(error)}\n${result.stderr || ''}`.trim(),
    );
  }

  const findings = [];
  for (const fileResult of parsed) {
    const file = normalizeRelPath(target, fileResult.filePath || '');
    for (const message of fileResult.messages || []) {
      findings.push({
        target: target.label,
        file,
        ruleId: message.ruleId || 'eslint/fatal',
      });
    }
  }

  return findings;
}

function collectFindings(env) {
  return targets.flatMap((target) => collectTargetFindings(target, env));
}

function summarizeFindings(findings) {
  const summary = new Map();
  for (const finding of findings) {
    const key = findingKey(finding);
    summary.set(key, (summary.get(key) || 0) + 1);
  }
  return summary;
}

function readBaseline(filePath) {
  if (!existsSync(filePath)) {
    return new Map();
  }

  const rows = readFileSync(filePath, 'utf8')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !line.startsWith('#'));

  const baseline = new Map();
  for (const row of rows) {
    const [target, file, ruleId, countRaw] = row.split('\t');
    const count = Number(countRaw);
    if (!target || !file || !ruleId || !Number.isFinite(count)) {
      throw new Error(`Invalid ESLint seatbelt row: ${row}`);
    }
    baseline.set(`${target}\t${file}\t${ruleId}`, count);
  }
  return baseline;
}

function writeBaseline(filePath, summary) {
  const lines = [
    '# target\tfile\truleId\tcount',
    ...[...summary.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, count]) => `${key}\t${count}`),
  ];
  writeFileSync(filePath, `${lines.join('\n')}\n`);
}

function printSummary(summary) {
  const total = [...summary.values()].reduce((sum, count) => sum + count, 0);
  console.log(`[seatbelt] ESLint findings measured: ${total} across ${summary.size} file/rule buckets.`);
}

function compareFrozen(current, baseline) {
  const regressions = [];
  for (const [key, currentCount] of current.entries()) {
    const baselineCount = baseline.get(key) || 0;
    if (currentCount > baselineCount) {
      regressions.push({ key, currentCount, baselineCount });
    }
  }
  return regressions;
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  const env = { ...process.env };
  env.SEATBELT_FILE = path.join(repoRoot, '.eslint-seatbelt.tsv');
  env.SEATBELT_ROOT = repoRoot;

  if (!options.bootstrap && !options.frozen && !options.update) {
    throw new Error(
      'Explicit mode required. Use --frozen for CI checks, --update for baseline refreshes, or --bootstrap for first-time setup.',
    );
  }

  if (options.bootstrap) {
    if (!options.force && env.SEATBELT_BOOTSTRAP_FORCE !== '1') {
      throw new Error(
        'Refusing to reset the ESLint seatbelt baseline without explicit confirmation. ' +
          'Re-run with --force or SEATBELT_BOOTSTRAP_FORCE=1.',
      );
    }
    env.SEATBELT_INCREASE = 'ALL';
  }

  if (options.update) {
    if (!options.force && env.SEATBELT_UPDATE_FORCE !== '1') {
      throw new Error(
        'Refusing to refresh the ESLint seatbelt baseline without explicit confirmation. ' +
          'Re-run with --force or SEATBELT_UPDATE_FORCE=1.',
      );
    }
  }

  if (options.frozen) {
    env.SEATBELT_FROZEN = '1';
  }

  const summary = summarizeFindings(collectFindings(env));
  printSummary(summary);

  if (options.bootstrap || options.update) {
    writeBaseline(env.SEATBELT_FILE, summary);
    console.log(`[seatbelt] Baseline written to ${path.relative(repoRoot, env.SEATBELT_FILE)}.`);
    return;
  }

  const baseline = readBaseline(env.SEATBELT_FILE);
  if (baseline.size === 0 && summary.size > 0) {
    throw new Error('ESLint seatbelt baseline missing. Bootstrap .eslint-seatbelt.tsv first.');
  }

  const regressions = compareFrozen(summary, baseline);
  if (regressions.length > 0) {
    console.error('[seatbelt] ESLint regressions detected:');
    for (const regression of regressions.slice(0, 50)) {
      const [target, file, ruleId] = regression.key.split('\t');
      console.error(
        `- ${target} ${file} ${ruleId}: baseline=${regression.baselineCount}, current=${regression.currentCount}`,
      );
    }
    throw new Error(`ESLint seatbelt failed with ${regressions.length} regressed bucket(s).`);
  }

  console.log('[seatbelt] OK — no ESLint bucket regressed.');
}

try {
  main();
} catch (error) {
  console.error(`[seatbelt] ${error?.message || String(error)}`);
  process.exit(1);
}
