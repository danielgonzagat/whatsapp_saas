/**
 * server-helpers-converge.ts — the Atomic Convergence engine.
 *
 * Principle (correct-by-construction): construction and validation are ONE act.
 * A candidate mutation is the smallest change that is SIMULTANEOUSLY GREEN across
 * every applicable gate. A mutation any gate would redden is not "a change that
 * fails validation" — it never commits at all. The action space is pre-restricted
 * to green.
 *
 * This module runs the STATIC gates against an in-memory overlay (no disk write),
 * so a red mutation is refused BEFORE it ever touches the tree. The dynamic
 * (byte-effect) gate is applied as apply→run→revert in the tool layer (reusing
 * server-helpers-effect). Gates are exoneration-free: a fact, not a heuristic —
 * syntax parses or it doesn't; a relative import resolves or it dangles.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import { validate as treeValidate } from './native-bridge.js';
import { extractImportSpecifiers } from './connection-gate.js';
import { runGates, WRITE_GATES } from './gates/registry.js';

export interface Mutation {
  /** repo-relative path */
  file: string;
  /** full new content of the file (the candidate) */
  newText: string;
}
export interface GateResult {
  gate: string;
  green: boolean;
  reds: string[];
  note?: string;
}
export interface ConvergeResult {
  converged: boolean;
  gates: GateResult[];
  firstRed: GateResult | null;
}

type Overlay = Map<string, string>; // relPath -> candidate content

const EXT_LANG: Record<string, string> = {
  '.ts': 'typescript', '.tsx': 'tsx', '.js': 'javascript', '.jsx': 'javascript',
  '.mjs': 'javascript', '.cjs': 'javascript', '.py': 'python', '.go': 'go',
  '.rb': 'ruby', '.rs': 'rust', '.java': 'java', '.c': 'c', '.cc': 'cpp',
  '.cpp': 'cpp', '.json': 'json',
};

/** GATE 1 — syntax: every changed file parses (web-tree-sitter, language-agnostic). */
async function gateSyntax(overlay: Overlay): Promise<GateResult> {
  const reds: string[] = [];
  for (const [rel, content] of overlay) {
    const lang = EXT_LANG[path.extname(rel).toLowerCase()];
    if (!lang) continue; // unknown language → cannot judge → do not block (honest)
    try {
      const v = (await treeValidate(content, lang)) as { realParser?: boolean; errorCount?: number };
      if (v.realParser && (v.errorCount ?? 0) > 0) reds.push(rel);
    } catch {
      /* parser unavailable → skip this file's syntax gate */
    }
  }
  return { gate: 'syntax', green: reds.length === 0, reds };
}

function existsInTree(repoRoot: string, overlay: Overlay, rel: string): boolean {
  if (overlay.has(rel)) return true;
  return fs.existsSync(path.join(repoRoot, rel));
}

/** Resolve a RELATIVE import against the overlay+disk. Packages/builtins are out of scope (not a dangling-wire fact we can assert). */
function relativeImportResolves(repoRoot: string, overlay: Overlay, fromRel: string, spec: string): boolean {
  if (!spec.startsWith('.')) return true; // bare specifier → package/builtin → not judged
  const base = path.posix.normalize(path.posix.join(path.posix.dirname(fromRel.replaceAll('\\', '/')), spec));
  const cands = [
    base, `${base}.ts`, `${base}.tsx`, `${base}.js`, `${base}.jsx`, `${base}.mjs`, `${base}.cjs`,
    `${base}.json`, `${base}/index.ts`, `${base}/index.tsx`, `${base}/index.js`,
  ];
  if (base.endsWith('.js')) cands.push(`${base.slice(0, -3)}.ts`, `${base.slice(0, -3)}.tsx`);
  return cands.some((c) => existsInTree(repoRoot, overlay, c));
}

/** GATE 2 — connection: every NEW relative import resolves to a real file. A dangling wire is a fact, not a guess (no exoneration). */
function gateConnection(repoRoot: string, overlay: Overlay): GateResult {
  const reds: string[] = [];
  for (const [rel, content] of overlay) {
    if (!/\.(ts|tsx|js|jsx|mjs|cjs)$/.test(rel)) continue;
    for (const spec of extractImportSpecifiers(content)) {
      if (!relativeImportResolves(repoRoot, overlay, rel, spec)) reds.push(`${rel} → ${spec}`);
    }
  }
  return { gate: 'connection', green: reds.length === 0, reds, note: 'every relative import resolves to a real file' };
}

/** Run the STATIC convergence gates against the candidate overlay (no disk write). */
export async function convergeStatic(repoRoot: string, mutations: Mutation[]): Promise<ConvergeResult> {
  const overlay: Overlay = new Map(mutations.map((m) => [m.file.replaceAll('\\', '/'), m.newText]));
  const gates: GateResult[] = [await gateSyntax(overlay), gateConnection(repoRoot, overlay)];
  // The dissolved-protocol gates (registry) run in the WRITE direction: each refuses a
  // mutation that INTRODUCES a dangling wire — a dependency, contract call/event, name
  // binding, UI handler/route, telemetry handle, IaC reference, or lint finding. Under
  // Y admission, an applicable gate must prove GREEN; unjudged is honest but not approval.
  const registry = await runGates(WRITE_GATES, repoRoot, overlay, [...overlay.keys()], false, 'strict');
  for (const name of [...new Set(registry.reds.map((r) => r.gate))]) {
    gates.push({
      gate: name,
      green: false,
      reds: registry.reds
        .filter((r) => r.gate === name)
        .map((r) => `${r.file}${r.locus ? `:${r.locus}` : ''} — ${r.fact}`),
    });
  }
  for (const name of registry.unjudged) {
    gates.push({
      gate: name,
      green: false,
      reds: [`UNJUDGED: ${name} could not prove GREEN; strict admission blocks this mutation.`],
      note: 'unjudged is not approval under Y admission',
    });
  }
  const firstRed = gates.find((g) => !g.green) ?? null;
  return { converged: !firstRed, gates, firstRed };
}
