#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import process from 'node:process';

const backendRoot = process.cwd();
const srcRoot = join(backendRoot, 'src');
const jestBin = join(backendRoot, 'node_modules', 'jest', 'bin', 'jest.js');
const passthroughArgs = process.argv.slice(2);
const chunkSize = Math.max(1, Number(process.env.JEST_CHUNK_SIZE || 48));
const startChunk = Math.max(1, Number(process.env.JEST_CHUNK_START || 1));
const maxOldSpaceSize = Math.max(3072, Number(process.env.JEST_MAX_OLD_SPACE_SIZE) || 4096);
const defaultJestArgs = process.env.JEST_VERBOSE_OUTPUT === '1' ? [] : ['--silent'];

function runJest(args) {
  const result = spawnSync(
    process.execPath,
    [`--max-old-space-size=${maxOldSpaceSize}`, jestBin, ...defaultJestArgs, ...args],
    {
      cwd: backendRoot,
      env: process.env,
      stdio: 'inherit',
    },
  );
  if (result.signal) {
    console.error(`Jest exited via signal ${result.signal}`);
    return 1;
  }
  return result.status ?? 1;
}

function hasPositionalSpec(args) {
  return args.some((arg) => !arg.startsWith('-'));
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

if (passthroughArgs.length > 0 && hasPositionalSpec(passthroughArgs)) {
  process.exit(runJest(['--runInBand', ...passthroughArgs]));
}

const specs = collectSpecs(srcRoot);
if (specs.length === 0) {
  console.log('No backend Jest specs found.');
  process.exit(0);
}

const startIndex = Math.min(specs.length, (startChunk - 1) * chunkSize);
if (startIndex > 0) {
  console.log(`[backend-test] resuming at chunk ${startChunk}`);
}

for (let index = startIndex; index < specs.length; index += chunkSize) {
  const chunk = specs.slice(index, index + chunkSize);
  const chunkNumber = Math.floor(index / chunkSize) + 1;
  const totalChunks = Math.ceil(specs.length / chunkSize);
  console.log(`\n[backend-test] chunk ${chunkNumber}/${totalChunks}: ${chunk.length} specs`);
  const status = runJest(['--runInBand', ...chunk]);
  if (status !== 0) {
    process.exit(status);
  }
}

process.exit(0);
