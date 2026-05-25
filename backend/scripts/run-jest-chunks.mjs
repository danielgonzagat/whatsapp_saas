#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { createRequire } from 'node:module';
import { join, relative } from 'node:path';
import process from 'node:process';

const require = createRequire(import.meta.url);
const backendRoot = process.cwd();
const srcRoot = join(backendRoot, 'src');
const jestBin = join(backendRoot, 'node_modules', 'jest', 'bin', 'jest.js');
const passthroughArgs = process.argv.slice(2);
const defaultChunkSize =
  process.env.CI === 'true' || process.env.GITHUB_ACTIONS === 'true' ? 72 : 48;
const chunkSize = Math.max(1, Number(process.env.JEST_CHUNK_SIZE || defaultChunkSize));
const startChunk = Math.max(1, Number(process.env.JEST_CHUNK_START || 1));
const maxOldSpaceSize = Math.max(2048, Number(process.env.JEST_MAX_OLD_SPACE_SIZE) || 6144);
const workerIdleMemoryLimit = process.env.JEST_WORKER_IDLE_MEMORY_LIMIT || '512MB';
const maxWorkers = process.env.JEST_MAX_WORKERS || '2';
const verboseJestOutput = process.env.JEST_VERBOSE_OUTPUT === '1';
// --maxWorkers conflicts with --runInBand. If the caller already requested
// --runInBand (e.g. check:all backend-test passes it), skip --maxWorkers so
// Jest doesn't error out with "only one is allowed".
const passthroughHasRunInBand = passthroughArgs.includes('--runInBand');
const workerArgs = passthroughHasRunInBand ? [] : [`--maxWorkers=${maxWorkers}`];
const defaultJestArgs = verboseJestOutput
  ? [`--workerIdleMemoryLimit=${workerIdleMemoryLimit}`, ...workerArgs]
  : ['--silent', `--workerIdleMemoryLimit=${workerIdleMemoryLimit}`, ...workerArgs];
const coverageEnabled = passthroughArgs.some(isCoverageArg);
const coverageRoot = join(backendRoot, 'coverage');
const coverageChunksRoot = join(coverageRoot, '.chunks');

function writeBufferedOutput(result) {
  if (result.stdout) {
    process.stdout.write(result.stdout);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
}

function runJest(args) {
  const result = spawnSync(
    process.execPath,
    [`--max-old-space-size=${maxOldSpaceSize}`, jestBin, ...defaultJestArgs, ...args],
    {
      cwd: backendRoot,
      encoding: 'utf8',
      env: process.env,
      maxBuffer: 128 * 1024 * 1024,
      stdio: verboseJestOutput ? 'inherit' : 'pipe',
    },
  );
  if (result.error || result.signal || result.status !== 0) {
    writeBufferedOutput(result);
  }
  if (result.error) {
    console.error(`Jest spawn failed: ${result.error.message}`);
    return 1;
  }
  if (result.signal) {
    console.error(`Jest exited via signal ${result.signal}`);
    return 1;
  }
  return result.status ?? 1;
}

function isCoverageArg(arg) {
  return arg === '--coverage' || arg === '--collectCoverage' || arg.startsWith('--coverage=');
}

function removeCoverageDirectoryArgs(args) {
  const filtered = [];
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--coverageDirectory') {
      index += 1;
      continue;
    }
    if (arg.startsWith('--coverageDirectory=')) {
      continue;
    }
    filtered.push(arg);
  }
  return filtered;
}

function ensureRunInBand(args) {
  return args.includes('--runInBand') ? args : args;
}

function hasPositionalSpec(args) {
  const optionsWithValue = new Set(['--config', '--coverageDirectory', '--testNamePattern', '-t']);
  let consumeNext = false;
  for (const arg of args) {
    if (consumeNext) {
      consumeNext = false;
      continue;
    }
    if (optionsWithValue.has(arg)) {
      consumeNext = true;
      continue;
    }
    if (!arg.startsWith('-')) {
      return true;
    }
  }
  return false;
}

function collectSpecs(dir) {
  const entries = readdirSync(dir).sort();
  const specs = [];
  for (const entry of entries) {
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    if (stat.isDirectory()) {
      specs.push(...collectSpecs(fullPath));
      continue;
    }
    if (entry.endsWith('.spec.ts')) {
      specs.push(relative(backendRoot, fullPath));
    }
  }
  return specs;
}

function readJestConfig() {
  const packageJson = JSON.parse(readFileSync(join(backendRoot, 'package.json'), 'utf8'));
  return packageJson.jest ?? {};
}

function buildChunkCoverageConfig(chunkCoverageDirectory) {
  const config = readJestConfig();
  return {
    ...config,
    coverageDirectory: chunkCoverageDirectory,
    coverageReporters: ['json'],
    coverageThreshold: {},
  };
}

function chunkArgs(baseArgs, chunk, chunkNumber) {
  const args = ensureRunInBand(removeCoverageDirectoryArgs(baseArgs));
  if (!coverageEnabled) {
    return [...args, ...chunk];
  }

  const chunkCoverageDirectory = join(coverageChunksRoot, String(chunkNumber));
  const config = buildChunkCoverageConfig(chunkCoverageDirectory);
  return [...args, '--config', JSON.stringify(config), ...chunk];
}

function summaryForCoveragePattern(coverageMap, pattern) {
  const coverage = require('istanbul-lib-coverage');
  const summary = coverage.createCoverageSummary();
  const normalizedPattern = pattern.replace(/^\.\//, '').replace(/\\/g, '/');
  const isDirectoryPattern = normalizedPattern.endsWith('/');

  for (const file of coverageMap.files()) {
    const relativeFile = relative(backendRoot, file).replace(/\\/g, '/');
    const matches = isDirectoryPattern
      ? relativeFile.startsWith(normalizedPattern)
      : relativeFile === normalizedPattern;
    if (matches) {
      summary.merge(coverageMap.fileCoverageFor(file).toSummary());
    }
  }
  return summary;
}

function enforceCoverageThresholds(coverageMap) {
  const config = readJestConfig();
  const thresholds = config.coverageThreshold ?? {};
  let pass = true;

  for (const [scope, threshold] of Object.entries(thresholds)) {
    const summary =
      scope === 'global'
        ? coverageMap.getCoverageSummary()
        : summaryForCoveragePattern(coverageMap, scope);

    for (const metric of ['branches', 'functions', 'lines', 'statements']) {
      if (threshold[metric] === undefined) {
        continue;
      }
      const actual = summary[metric].pct;
      const expected = Number(threshold[metric]);
      if (actual < expected) {
        console.error(
          `Coverage threshold failed for ${scope} ${metric}: ${actual}% < ${expected}%`,
        );
        pass = false;
      }
    }
  }

  return pass;
}

function mergeCoverageReports(chunkDirectories) {
  const coverage = require('istanbul-lib-coverage');
  const libReport = require('istanbul-lib-report');
  const reports = require('istanbul-reports');
  const coverageMap = coverage.createCoverageMap({});

  for (const directory of chunkDirectories) {
    const coverageFile = join(directory, 'coverage-final.json');
    if (!existsSync(coverageFile)) {
      throw new Error(`Missing chunk coverage file: ${relative(backendRoot, coverageFile)}`);
    }
    coverageMap.merge(JSON.parse(readFileSync(coverageFile, 'utf8')));
  }

  rmSync(coverageRoot, { recursive: true, force: true });
  mkdirSync(coverageRoot, { recursive: true });
  writeFileSync(join(coverageRoot, 'coverage-final.json'), JSON.stringify(coverageMap.toJSON()));

  const context = libReport.createContext({
    dir: coverageRoot,
    coverageMap,
  });
  for (const reporterName of ['clover', 'json', 'lcov', 'text', 'json-summary']) {
    reports.create(reporterName).execute(context);
  }

  console.log(
    `[backend-test] merged coverage from ${chunkDirectories.length} chunks into ${relative(backendRoot, coverageRoot)}`,
  );
  return enforceCoverageThresholds(coverageMap);
}

if (passthroughArgs.length > 0 && hasPositionalSpec(passthroughArgs)) {
  process.exit(runJest(ensureRunInBand(passthroughArgs)));
}

const specs = collectSpecs(srcRoot);
if (specs.length === 0) {
  console.log('No backend Jest specs found.');
  process.exit(0);
}

const totalChunks = Math.ceil(specs.length / chunkSize);
const startIndex = Math.min(specs.length, (startChunk - 1) * chunkSize);

if (coverageEnabled) {
  if (startChunk <= 1) {
    rmSync(coverageRoot, { recursive: true, force: true });
  }
  mkdirSync(coverageChunksRoot, { recursive: true });
}

if (startIndex > 0) {
  console.log(`[backend-test] resuming at chunk ${startChunk}`);
}

const chunkCoverageDirectories = coverageEnabled
  ? Array.from({ length: totalChunks }, (_, index) => join(coverageChunksRoot, String(index + 1)))
  : [];
for (let index = startIndex; index < specs.length; index += chunkSize) {
  const chunk = specs.slice(index, index + chunkSize);
  const chunkNumber = Math.floor(index / chunkSize) + 1;
  console.log(`\n[backend-test] chunk ${chunkNumber}/${totalChunks}: ${chunk.length} specs`);
  const statusCode = runJest(chunkArgs(passthroughArgs, chunk, chunkNumber));
  if (statusCode !== 0) {
    process.exit(statusCode);
  }
  console.log(`[backend-test] chunk ${chunkNumber}/${totalChunks} passed`);
}

if (coverageEnabled && !mergeCoverageReports(chunkCoverageDirectories)) {
  process.exit(1);
}

process.exit(0);
