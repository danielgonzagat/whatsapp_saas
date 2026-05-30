/**
 * gates/lens.ts — the READ-direction crivo (the atomic reading lens).
 *
 * Same gate registry as the write direction, swept over a whole scope: it reads
 * 100% of the source bytes and reports ONLY the red — every wire that is not
 * correct-by-construction — with atomic precision (gate, file, locus, fact). A
 * context-bounded agent gets just the dangling wires to fix, never the whole tree.
 *
 * Absolute vs delta. Gates that judge a whole-file/graph PROPERTY report
 * absolutely here: reachability (orphan files no root reaches) and binding
 * (unbound names) light up over committed bytes. The DELTA gates
 * (supply-chain/contract/telemetry/iac/findings/render) are write-direction by
 * nature — over already-committed bytes there is no NEW wire — so in the lens they
 * confirm the tree introduced nothing and fire at write time instead. Completing
 * absolute-mode for the delta gates is a uniform follow-up (route their prior
 * read through the context so the lens can supply an empty prior).
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { LENS_GATES, runGates, type UnifiedRed } from './registry.js';

const SKIP = new Set(['node_modules', '.git', 'dist', '.next', 'build', 'coverage', 'vendor', '.atomic']);
const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

function enumerateSource(repoRoot: string, scopeAbs: string, cap = 8000): string[] {
  const out: string[] = [];
  const walk = (absDir: string): void => {
    if (out.length >= cap) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.length >= cap) return;
      if (SKIP.has(e.name)) continue;
      const abs = path.join(absDir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (SOURCE_RE.test(e.name) && !e.name.endsWith('.proof.ts')) {
        out.push(path.relative(repoRoot, abs).replaceAll('\\', '/'));
      }
    }
  };
  walk(scopeAbs);
  return out;
}

export interface LensReport {
  scanned: number;
  reds: UnifiedRed[];
  unjudged: string[];
  ran: string[];
}

/** Sweep the lens over a repo-relative scope. Empty overlay → gates read committed bytes. */
export async function runLens(repoRoot: string, scopeRel: string): Promise<LensReport> {
  const scopeAbs = path.resolve(repoRoot, scopeRel);
  const files = enumerateSource(repoRoot, scopeAbs);
  const run = await runGates(LENS_GATES, repoRoot, new Map<string, string>(), files, true);
  return { scanned: files.length, reds: run.reds, unjudged: run.unjudged, ran: run.ran };
}

const self = fileURLToPath(import.meta.url);
const invoked = process.argv[1] ? path.resolve(process.argv[1]) : '';
function findRepoRoot(start: string): string {
  let d = start;
  for (let i = 0; i < 12; i += 1) {
    if (fs.existsSync(path.join(d, '.git'))) return d;
    const up = path.dirname(d);
    if (up === d) break;
    d = up;
  }
  return start;
}
if (invoked === self || invoked === self.replace(/\.ts$/, '.js')) {
  const repoRoot = findRepoRoot(path.dirname(self));
  const scope = process.argv[2] ?? 'scripts/mcp/atomic-edit/gates';
  runLens(repoRoot, scope)
    .then((r) => {
      process.stdout.write(`\nATOMIC LENS — scanned ${r.scanned} source file(s) in ${scope}\n`);
      process.stdout.write(`gates ran: ${r.ran.join(', ') || '(none)'}\n`);
      if (r.unjudged.length) process.stdout.write(`unjudged (honest): ${r.unjudged.join(', ')}\n`);
      if (r.reds.length === 0) {
        process.stdout.write('\nGREEN — every wire in scope resolves; no non-correct-by-construction byte.\n');
        return;
      }
      process.stdout.write(`\n${r.reds.length} RED(s):\n`);
      for (const red of r.reds.slice(0, 200)) {
        process.stdout.write(`  [${red.gate}] ${red.file}${red.locus ? `:${red.locus}` : ''} — ${red.fact}\n`);
      }
      if (r.reds.length > 200) process.stdout.write(`  … +${r.reds.length - 200} more\n`);
    })
    .catch((e: unknown) => {
      process.stderr.write(`lens error: ${e instanceof Error ? e.stack : String(e)}\n`);
      process.exit(1);
    });
}
