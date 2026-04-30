import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { afterEach, describe, expect, it } from 'vitest';

import { buildScopeEngineState, discoverWatchableDirectories } from '../scope-engine';

const tempRoots: string[] = [];

function makeRoot(): string {
  const rootDir = mkdtempSync(join(tmpdir(), 'pulse-scope-engine-'));
  tempRoots.push(rootDir);
  return rootDir;
}

afterEach(() => {
  for (const rootDir of tempRoots.splice(0)) {
    rmSync(rootDir, { recursive: true, force: true });
  }
});

describe('scope engine watch roots', () => {
  it('derives fallback watch roots from discovered scannable files', () => {
    const rootDir = makeRoot();
    const machineDir = join(rootDir, 'pulse-machine');
    const evidenceDir = join(rootDir, 'runtime-evidence');
    const notesDir = join(rootDir, 'notes-only');
    mkdirSync(machineDir, { recursive: true });
    mkdirSync(evidenceDir, { recursive: true });
    mkdirSync(notesDir, { recursive: true });
    writeFileSync(join(machineDir, 'scope.ts'), 'export const scope = true;');
    writeFileSync(join(evidenceDir, 'snapshot.json'), '{"status":"observed"}');
    writeFileSync(join(notesDir, 'scratch.txt'), 'not a scanned signal');

    expect(discoverWatchableDirectories(rootDir).sort()).toEqual([machineDir, evidenceDir].sort());
  });
});

describe('scope engine governance boundary', () => {
  it('derives protected execution decisions from the governance manifest', () => {
    const rootDir = makeRoot();
    const generatedDir = join(rootDir, 'generated-ops');
    const appDir = join(rootDir, 'machine');
    mkdirSync(join(rootDir, 'ops'), { recursive: true });
    mkdirSync(generatedDir, { recursive: true });
    mkdirSync(appDir, { recursive: true });
    writeFileSync(
      join(rootDir, 'ops/protected-governance-files.json'),
      JSON.stringify({
        protectedExact: [],
        protectedPrefixes: ['generated-ops/'],
      }),
    );
    writeFileSync(join(generatedDir, 'contract.ts'), 'export const guarded = true;');
    writeFileSync(join(appDir, 'flow.ts'), 'export const open = true;');

    const state = buildScopeEngineState(rootDir);
    const entriesByRelativePath = new Map(state.files.map((entry) => [entry.relativePath, entry]));

    expect(entriesByRelativePath.get('generated-ops/contract.ts')).toEqual(
      expect.objectContaining({
        isProtected: true,
        executionMode: 'human_required',
      }),
    );
    expect(entriesByRelativePath.get('machine/flow.ts')).toEqual(
      expect.objectContaining({
        isProtected: false,
        executionMode: 'ai_safe',
      }),
    );
  });
});
