import * as fs from 'node:fs';
import * as path from 'node:path';

let selfExpansionAdmissionDepth = 0;

export function withSelfExpansionAdmission<T>(fn: () => T): T {
  selfExpansionAdmissionDepth += 1;
  try {
    return fn();
  } finally {
    selfExpansionAdmissionDepth -= 1;
  }
}

function normalizeRel(rel: string): string {
  return rel.split(path.sep).join('/').replace(/^\.\//, '');
}

function isEphemeralAtomicFixture(rel: string): boolean {
  const base = path.basename(rel);
  return (
    base.startsWith('.smoke-') ||
    base.startsWith('.audit-') ||
    base.startsWith('.atomic-edit.') ||
    rel.includes('/.smoke-') ||
    rel.includes('/.audit-') ||
    rel.includes('/.positive-byte-sessions/') ||
    rel.includes('/dist/')
  );
}

export function isAtomicSelfExpansionPath(repoRoot: string, absPath: string): boolean {
  const rel = normalizeRel(path.relative(repoRoot, absPath));
  return rel.startsWith('scripts/mcp/atomic-edit/') && !isEphemeralAtomicFixture(rel);
}

export function assertSelfExpansionAdmission(repoRoot: string, absPath: string, nextContent: string): void {
  if (!isAtomicSelfExpansionPath(repoRoot, absPath)) return;
  let before: string | null = null;
  try {
    before = fs.existsSync(absPath) && fs.statSync(absPath).isFile() ? fs.readFileSync(absPath, 'utf8') : null;
  } catch {
    before = null;
  }
  if (before === nextContent) return;
  if (selfExpansionAdmissionDepth > 0) return;
  const rel = normalizeRel(path.relative(repoRoot, absPath));
  throw new Error(
    `refused (self-expansion admission): ${rel} is part of atomic-edit itself. ` +
      `Expanding the atomic MCP is allowed only through atomic_expand_self, which wraps the write in ` +
      `self-expansion admission and requires proof commands before the expansion can stand. ` +
      `Use atomic_expand_self to execute the closed loop: atomic executes the computation, or atomic first ` +
      `implements the missing computation inside atomic under proof.`,
  );
}
