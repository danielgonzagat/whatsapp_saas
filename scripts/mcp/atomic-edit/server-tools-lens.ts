/**
 * server-tools-lens.ts — the proven EYE and HAND, made reachable.
 *
 * runLens (gates/lens.ts) and repairScope (gates/repair.ts) were CLI-only: no
 * agent could invoke the whole-repo red-set sweep or the resolve-or-dangle hand.
 * This module registers them VERBATIM as MCP tools — zero new analysis, just a
 * thin envelope around the already-proven functions:
 *   - atomic_lens         → runLens(REPO_ROOT, scope)         (the absolute eye)
 *   - atomic_grep_calls   → perception.calls() per file       (token-correct callee match)
 *   - atomic_repair_scope → repairScope(REPO_ROOT, scope)     (the resolve-or-dangle hand)
 *
 * atomic_grep_calls is the honest grep: it asks the AST for real call
 * expressions (NOT string/comment occurrences) and reports `null` files as
 * unjudged instead of silently dropping them — never green-by-assumption.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { REPO_ROOT } from './guard.js';
import { readUtf8 } from './server-helpers-io.js';
import { ok, fail } from './server-helpers-result.js';
import { runLens } from './gates/lens.js';
import { repairScope } from './gates/repair.js';
import { calls } from './gates/perception.js';

const SKIP = new Set(['node_modules', '.git', 'dist', '.next', 'build', 'coverage', 'vendor', '.atomic']);
const SOURCE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

/**
 * Enumerate the source files of a comma-separated scope (files or directories),
 * exactly mirroring the lens/repair walk: skip vendor/build dirs, skip *.proof.ts,
 * source extensions only. Returns repo-relative paths. Pure enumeration — no
 * analysis lives here; the call extraction is delegated to perception.calls().
 */
function enumerateScope(repoRoot: string, scopeRel: string, cap = 8000): string[] {
  const out = new Set<string>();
  const walk = (absDir: string): void => {
    if (out.size >= cap) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (out.size >= cap) return;
      if (SKIP.has(e.name)) continue;
      const abs = path.join(absDir, e.name);
      if (e.isDirectory()) walk(abs);
      else if (SOURCE_RE.test(e.name) && !e.name.endsWith('.proof.ts')) {
        out.add(path.relative(repoRoot, abs).replaceAll('\\', '/'));
      }
    }
  };
  for (const part of scopeRel.split(',').map((s) => s.trim()).filter(Boolean)) {
    const abs = path.resolve(repoRoot, part);
    let st: fs.Stats | null = null;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(abs);
    else if (SOURCE_RE.test(abs) && !abs.endsWith('.proof.ts')) {
      out.add(path.relative(repoRoot, abs).replaceAll('\\', '/'));
    }
  }
  return [...out];
}

export function registerToolsLens(server: McpServer): void {
  server.registerTool(
    'atomic_lens',
    {
      title: 'The absolute eye — whole-scope red-set of every applicable gate',
      description:
        'Sweep a scope (comma-separated files/dirs, default the whole repo) and return the exact red-set the ' +
        'gates SEE: { gate, file, locus, fact } per violation, byte-level evidence per red split into actionable ' +
        'negative bytes, contained adversarial proof fixtures, generated-code templates, and regexp sources, plus ' +
        'gate domains left unjudged (honestly cannot judge, not green). This is runLens VERBATIM — the same eye ' +
        'the convergence crivo uses, now reachable by any agent. Read-only: no mutation, no disk write.',
      inputSchema: {
        scope: z
          .string()
          .optional()
          .describe('comma-separated repo-relative files/dirs (default "." = whole repo, cap 8000 files)'),
      },
    },
    async (a) => {
      try {
        const scope = a.scope && a.scope.trim().length > 0 ? a.scope : '.';
        const report = await runLens(REPO_ROOT, scope);
        return ok({
          ok: true,
          scope,
          scanned: report.scanned,
          ran: report.ran,
          unjudgedCount: report.unjudged.length,
          unjudgedDomains: report.unjudged.slice(0, 50),
          unjudgedEvidence: (report.unjudgedEvidence ?? []).slice(0, 50),
          reds: report.reds,
          byteEvidenceCount: report.negativeByteEvidence.length,
          byteEvidence: report.negativeByteEvidence,
          negativeByteEvidenceCount: report.actionableNegativeByteEvidence.length,
          negativeByteEvidence: report.actionableNegativeByteEvidence,
          containedNegativeFixtureEvidenceCount: report.containedNegativeFixtureEvidence.length,
          containedNegativeFixtureEvidence: report.containedNegativeFixtureEvidence,
          containedGeneratedCodeEvidenceCount: report.containedGeneratedCodeEvidence.length,
          containedGeneratedCodeEvidence: report.containedGeneratedCodeEvidence,
          containedRegExpSourceEvidenceCount: report.containedRegExpSourceEvidence.length,
          containedRegExpSourceEvidence: report.containedRegExpSourceEvidence,
          summaryForHuman:
            `👁️  lens over "${scope}": scanned ${report.scanned} file(s) with ${report.ran.length} gate(s) ` +
            `[${report.ran.join(', ')}] → ${report.reds.length} red-like finding(s), ` +
            `${report.actionableNegativeByteEvidence.length} actionable negative byte evidence record(s), ` +
            `${report.containedNegativeFixtureEvidence.length} contained fixture record(s), ` +
            `${report.containedGeneratedCodeEvidence.length} contained generated-code record(s), ` +
            `${report.containedRegExpSourceEvidence.length} contained regexp-source record(s), ` +
            `${report.unjudged.length} unjudged domain(s).`,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'atomic_grep_calls',
    {
      title: 'Token-correct call grep — every REAL call of a name (not strings/comments)',
      description:
        'Find every actual call expression whose callee === <name> across a scope, using the AST (perception.calls) ' +
        'so a name appearing only inside a string literal or a comment is NEVER matched. Files whose language ' +
        'accessor returns null are reported as `unjudged` (honest: cannot parse ⇒ cannot claim zero), never ' +
        'silently dropped. Returns { file, line, column, callee, arg0 } per match. Read-only.',
      inputSchema: {
        name: z.string().min(1).describe('exact callee text to match (e.g. "apiFetch", "runLens")'),
        scope: z
          .string()
          .optional()
          .describe('comma-separated repo-relative files/dirs (default "." = whole repo)'),
      },
    },
    async (a) => {
      try {
        const scope = a.scope && a.scope.trim().length > 0 ? a.scope : '.';
        const files = enumerateScope(REPO_ROOT, scope);
        const matches: { file: string; line: number; column: number; callee: string; arg0: string | null }[] = [];
        const judgedFiles: string[] = [];
        const unjudged: string[] = [];
        for (const rel of files) {
          let content: string;
          try {
            content = readUtf8(path.resolve(REPO_ROOT, rel));
          } catch {
            unjudged.push(rel);
            continue;
          }
          const found = await calls(content, rel);
          if (found === null) {
            // accessor cannot parse this language ⇒ honestly unjudged, not zero.
            unjudged.push(rel);
            continue;
          }
          judgedFiles.push(rel);
          for (const c of found) {
            if (c.callee === a.name) {
              matches.push({ file: rel, line: c.line, column: c.column, callee: c.callee, arg0: c.arg0 });
            }
          }
        }
        return ok({
          ok: true,
          name: a.name,
          scope,
          scanned: files.length,
          judged: judgedFiles.length,
          unjudgedCount: unjudged.length,
          unjudged: unjudged.slice(0, 50),
          matchCount: matches.length,
          matches,
          summaryForHuman:
            `🔎 "${a.name}" called ${matches.length} time(s) across ${judgedFiles.length} judged file(s) ` +
            `(${unjudged.length} unjudged). Token-correct: string/comment occurrences excluded.`,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'atomic_repair_scope',
    {
      title: 'The resolve-or-dangle hand — auto-repair every gate-red it can prove, surface the rest',
      description:
        'Run repairScope VERBATIM over a scope: for each gate-red it can resolve deterministically it applies the ' +
        'fix through the firewall; every red it cannot prove a fix for is returned in `needsIntent` (file, name, ' +
        'reason) for a human/agent decision — it NEVER guesses. Returns { scanned, applied, files, needsIntent }.',
      inputSchema: {
        scope: z
          .string()
          .optional()
          .describe('comma-separated repo-relative files/dirs (default "." = whole repo, cap 6000 files)'),
      },
    },
    async (a) => {
      try {
        const scope = a.scope && a.scope.trim().length > 0 ? a.scope : '.';
        const res = await repairScope(REPO_ROOT, scope);
        return ok({
          ok: true,
          scope,
          scanned: res.scanned,
          applied: res.applied,
          files: res.files,
          needsIntent: res.needsIntent,
          summaryForHuman:
            `🛠️  repair over "${scope}": scanned ${res.scanned}, applied ${res.applied} fix(es), ` +
            `${res.needsIntent.length} red(s) need intent (resolve-or-dangle: no guessing).`,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
