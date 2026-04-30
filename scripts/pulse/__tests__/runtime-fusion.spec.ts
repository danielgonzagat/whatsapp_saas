import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import * as path from 'path';
import { afterEach, describe, expect, it } from 'vitest';
import { buildRuntimeFusionState } from '../runtime-fusion';
import type { RuntimeFusionState } from '../types.runtime-fusion';

let tempRoots: string[] = [];

function createPulseRoot(): { rootDir: string; currentDir: string } {
  const rootDir = mkdtempSync(path.join(tmpdir(), 'pulse-runtime-fusion-'));
  const currentDir = path.join(rootDir, '.pulse', 'current');
  mkdirSync(currentDir, { recursive: true });
  tempRoots.push(rootDir);
  return { rootDir, currentDir };
}

function writeJson(filePath: string, value: unknown): void {
  writeFileSync(filePath, JSON.stringify(value, null, 2));
}

function readFusion(currentDir: string): RuntimeFusionState {
  return JSON.parse(readFileSync(path.join(currentDir, 'PULSE_RUNTIME_FUSION.json'), 'utf8'));
}

afterEach(() => {
  for (const rootDir of tempRoots) {
    rmSync(rootDir, { recursive: true, force: true });
  }
  tempRoots = [];
});
