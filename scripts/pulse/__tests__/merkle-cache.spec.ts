import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildMerkleDag, recomputeNode, verifyDagIntegrity } from '../merkle-cache';

function makeRoot(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-merkle-cache-'));
}

function writeFile(rootDir: string, relPath: string, content: string): void {
  const fullPath = path.join(rootDir, relPath);
  fs.mkdirSync(path.dirname(fullPath), { recursive: true });
  fs.writeFileSync(fullPath, content);
}

describe('merkle-cache incremental recomputation', () => {
  it('reuses unchanged file hashes while preserving the single Merkle artifact', () => {
    const rootDir = makeRoot();
    writeFile(rootDir, 'src/alpha.ts', 'export const alpha = 1;\n');
    writeFile(rootDir, 'src/beta.ts', 'export const beta = 1;\n');

    const first = buildMerkleDag(rootDir);
    const betaComputedAt = first.nodes['src/beta.ts']?.lastComputed;

    writeFile(rootDir, 'src/alpha.ts', 'export const alpha = 2;\n');
    const second = buildMerkleDag(rootDir, undefined, {
      changedFilePaths: ['src/alpha.ts'],
    });

    expect(second.nodes['src/alpha.ts']?.changed).toBe(true);
    expect(second.nodes['src/beta.ts']?.changed).toBe(false);
    expect(second.nodes['src/beta.ts']?.lastComputed).toBe(betaComputedAt);
    expect(second.changedNodes).toBe(2);
    expect(verifyDagIntegrity(second).valid).toBe(true);

    const artifactPath = path.join(rootDir, '.pulse', 'current', 'PULSE_MERKLE_CACHE.json');
    const cachePath = path.join(rootDir, '.pulse', 'cache', 'merkle-dag.json');
    expect(fs.existsSync(artifactPath)).toBe(true);
    expect(fs.existsSync(cachePath)).toBe(true);
  });

  it('recomputes a leaf from the repo root and cascades the derived hash', () => {
    const rootDir = makeRoot();
    writeFile(rootDir, 'src/alpha.ts', 'export const alpha = 1;\n');

    const first = buildMerkleDag(rootDir);
    const initialRootHash = first.rootHash;

    writeFile(rootDir, 'src/alpha.ts', 'export const alpha = 3;\n');
    const recomputed = recomputeNode(first, 'src/alpha.ts', rootDir);

    expect(recomputed.rootHash).not.toBe(initialRootHash);
    expect(recomputed.changedNodes).toBe(2);
    expect(verifyDagIntegrity(recomputed).valid).toBe(true);
  });
});
