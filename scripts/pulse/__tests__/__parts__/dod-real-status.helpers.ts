import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';

export const generatedAt = '2026-04-29T00:00:00.000Z';
export const tempRoots: string[] = [];

export function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'pulse-dod-real-status-'));
  tempRoots.push(root);
  return root;
}

export function cleanupTempRoots(): void {
  for (const root of tempRoots.splice(0)) {
    fs.rmSync(root, { recursive: true, force: true });
  }
}
