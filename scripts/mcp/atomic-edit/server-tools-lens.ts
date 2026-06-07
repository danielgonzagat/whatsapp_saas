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
import { REPO_ROOT, resolveSafeTarget } from './guard.js';
import { readUtf8, sha256, targetDetails } from './server-helpers-io.js';
import { ok, fail } from './server-helpers-result.js';
import { runLens } from './gates/lens.js';
import { repairScope } from './gates/repair.js';
import { calls } from './gates/perception.js';

const SKIP = new Set(['node_modules', '.git', '.atomic', '.claude', '.mcp-cache', '.next', '.turbo', '.cache', 'build', 'coverage', 'dist', 'vendor']);
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

function enumerateDirectNonSourceFiles(repoRoot: string, scopeRel: string, cap = 1000): string[] {
  const out = new Set<string>();
  const addFile = (abs: string): void => {
    if (out.size >= cap) return;
    const rel = path.relative(repoRoot, abs).replaceAll('\\', '/');
    if (rel.startsWith('..') || path.isAbsolute(rel)) return;
    if (SOURCE_RE.test(abs) && !abs.endsWith('.proof.ts')) return;
    out.add(rel);
  };
  const walk = (absDir: string): void => {
    if (out.size >= cap) return;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(absDir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name));
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.size >= cap) return;
      if (SKIP.has(entry.name)) continue;
      const abs = path.join(absDir, entry.name);
      if (entry.isDirectory()) walk(abs);
      else if (entry.isFile()) addFile(abs);
    }
  };
  for (const part of scopeRel.split(',').map((s) => s.trim()).filter(Boolean)) {
    if (out.size >= cap) break;
    const abs = path.resolve(repoRoot, part);
    const rel = path.relative(repoRoot, abs).replaceAll('\\', '/');
    if (rel.startsWith('..') || path.isAbsolute(rel)) continue;
    let st: fs.Stats | null = null;
    try {
      st = fs.statSync(abs);
    } catch {
      continue;
    }
    if (st.isDirectory()) walk(abs);
    else if (st.isFile()) addFile(abs);
  }
  return [...out];
}

interface AtomicReadLineRange {
  line: number;
  startChar: number;
  endChar: number;
  text: string;
}

interface AtomicReadWindow {
  startLine: number;
  endLine: number;
  startChar: number;
  endChar: number;
  byteStart: number;
  byteEnd: number;
  text: string;
}

interface AtomicReadZone {
  classification: string;
  byteStart: number;
  byteEnd: number;
  byteLength: number;
  reason: string;
  gate?: string;
  locus?: string;
  precision?: string;
  recommendedAction?: string;
}

function byteLength(value: string): number {
  return Buffer.byteLength(value, 'utf8');
}

function atomicReadLineRanges(content: string): AtomicReadLineRange[] {
  const lines = content.split('\n');
  let cursor = 0;
  return lines.map((line, index) => {
    const text = index < lines.length - 1 ? `${line}\n` : line;
    const startChar = cursor;
    const endChar = startChar + text.length;
    cursor = endChar;
    return { line: index + 1, startChar, endChar, text };
  });
}

function atomicReadWindow(content: string, startLineRaw?: number, endLineRaw?: number): AtomicReadWindow {
  const ranges = atomicReadLineRanges(content);
  const startLine = startLineRaw ?? 1;
  const endLine = endLineRaw ?? ranges.length;
  if (startLine < 1) throw new Error('startLine must be >= 1');
  if (endLine < startLine) throw new Error('endLine must be >= startLine');
  if (startLine > ranges.length) throw new Error(`startLine ${startLine} exceeds file line count ${ranges.length}`);
  if (endLine > ranges.length) throw new Error(`endLine ${endLine} exceeds file line count ${ranges.length}`);
  const first = ranges[startLine - 1];
  const last = ranges[endLine - 1];
  const startChar = first.startChar;
  const endChar = last.endChar;
  const text = content.slice(startChar, endChar);
  const byteStart = byteLength(content.slice(0, startChar));
  const byteEnd = byteLength(content.slice(0, endChar));
  return { startLine, endLine, startChar, endChar, byteStart, byteEnd, text };
}

function truncateUtf8(text: string, maxBytes: number): { text: string; truncated: boolean } {
  if (byteLength(text) <= maxBytes) return { text, truncated: false };
  let out = '';
  let used = 0;
  for (const ch of text) {
    const next = byteLength(ch);
    if (used + next > maxBytes) break;
    out += ch;
    used += next;
  }
  return { text: out, truncated: true };
}

function positiveReadZone(start: number, end: number, ran: string[]): AtomicReadZone {
  return {
    classification: 'positive-within-declared-battery',
    byteStart: start,
    byteEnd: end,
    byteLength: end - start,
    reason:
      `No lens red overlapped this byte range under declared gates: ${ran.join(', ') || 'none'}. ` +
      'This is not a universal correctness claim.',
  };
}

function atomicReadZones(
  report: Awaited<ReturnType<typeof runLens>>,
  relPath: string,
  byteStart: number,
  byteEnd: number,
): AtomicReadZone[] {
  if (report.scanned === 0) {
    return [
      {
        classification: 'unjudged',
        byteStart,
        byteEnd,
        byteLength: byteEnd - byteStart,
        reason: 'No source-language lens battery applied to this file; bytes are readable but not proven positive.',
      },
    ];
  }

  const evidence = report.negativeByteEvidence
    .filter((entry) => entry.file === relPath && entry.byteEnd > byteStart && entry.byteStart < byteEnd)
    .sort((a, b) => a.byteStart - b.byteStart || a.byteEnd - b.byteEnd);
  const zones: AtomicReadZone[] = [];
  let cursor = byteStart;
  for (const entry of evidence) {
    const start = Math.max(byteStart, entry.byteStart);
    const end = Math.min(byteEnd, entry.byteEnd);
    if (start > cursor) zones.push(positiveReadZone(cursor, start, report.ran));
    zones.push({
      classification: entry.classification,
      byteStart: start,
      byteEnd: end,
      byteLength: end - start,
      reason: entry.reason,
      gate: entry.gate,
      locus: entry.locus,
      precision: entry.precision,
      recommendedAction: entry.recommendedAction,
    });
    cursor = Math.max(cursor, end);
  }
  if (cursor < byteEnd || zones.length === 0) zones.push(positiveReadZone(cursor, byteEnd, report.ran));
  return zones;
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
    'atomic_read_file',
    {
      title: 'Atomic file read with lens-backed byte classification',
      description:
        'Read a repo file or line range through Atomic and attach byte-level classification from the declared ' +
        'lens battery. Regions with gate evidence are negative/contained; gaps are positive only within the ' +
        'declared battery; files outside the source battery are explicitly unjudged. Read-only: no mutation, no disk write.',
      inputSchema: {
        file: z.string().describe('repo-relative file path, or absolute path inside an allowed worktree'),
        startLine: z.number().int().min(1).optional().describe('1-based first line to read'),
        endLine: z.number().int().min(1).optional().describe('1-based final line to read'),
        includeContent: z.boolean().optional().describe('default true; false returns only hashes/ranges/classification'),
        maxBytes: z.number().int().min(1).max(200000).optional().describe('max UTF-8 bytes of content to echo; default 50000'),
      },
    },
    async (a) => {
      try {
        const { absPath, relPath, repoRoot } = resolveSafeTarget(a.file);
        const content = readUtf8(absPath);
        const window = atomicReadWindow(content, a.startLine, a.endLine);
        const report = await runLens(repoRoot, relPath);
        const zones = atomicReadZones(report, relPath, window.byteStart, window.byteEnd);
        const negativeEvidence = report.negativeByteEvidence.filter(
          (entry) =>
            entry.file === relPath &&
            entry.classification === 'negative' &&
            entry.byteEnd > window.byteStart &&
            entry.byteStart < window.byteEnd,
        );
        const verdict =
          report.scanned === 0
            ? 'UNJUDGED'
            : negativeEvidence.length > 0
              ? 'HAS_NEGATIVE_BYTES'
              : 'POSITIVE_WITHIN_DECLARED_BATTERY';
        const maxBytes = a.maxBytes ?? 50000;
        const emitted = truncateUtf8(window.text, maxBytes);
        const includeContent = a.includeContent ?? true;
        return ok({
          ok: true,
          file: relPath,
          ...targetDetails(absPath, relPath),
          sha256: sha256(content),
          bytes: byteLength(content),
          lineCount: atomicReadLineRanges(content).length,
          range: {
            startLine: window.startLine,
            endLine: window.endLine,
            byteStart: window.byteStart,
            byteEnd: window.byteEnd,
            byteLength: window.byteEnd - window.byteStart,
          },
          ...(includeContent ? { content: emitted.text } : {}),
          contentIncluded: includeContent,
          contentTruncated: includeContent ? emitted.truncated : false,
          verdict,
          sourceLensApplied: report.scanned > 0,
          ran: report.ran,
          unjudgedCount: report.unjudged.length + (report.scanned === 0 ? 1 : 0),
          unjudgedDomains: report.scanned === 0 ? ['source-language-lens:not-applicable'] : report.unjudged.slice(0, 50),
          zones,
          negativeByteEvidenceCount: negativeEvidence.length,
          negativeByteEvidence: negativeEvidence,
          proofDebt:
            report.scanned === 0
              ? ['file readable, but no declared source-language battery could classify these bytes as positive']
              : report.unjudged.slice(0, 50),
          summaryForHuman:
            `Atomic read ${relPath} L${window.startLine}-L${window.endLine}: ${verdict}; ` +
            `${zones.length} classified byte zone(s), ${negativeEvidence.length} negative evidence record(s).`,
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'atomic_scan_bytes',
    {
      title: 'Atomic byte scanner — source file map of positive/negative/proof-debt regions',
      description:
        'Scan a source scope through Atomic and return a per-file byte map: verdict, hashes, byte/line totals, ' +
        'negative evidence, contained evidence, proof debt, and classified zones. Positive means only ' +
        'positive within the declared lens battery; unjudged domains are surfaced as debt, not green. Read-only.',
      inputSchema: {
        scope: z
          .string()
          .optional()
          .describe('comma-separated repo-relative source files/dirs (default "." = whole repo, cap 8000 files)'),
        maxFiles: z.number().int().min(1).max(1000).optional().describe('max per-file summaries to return; default 200'),
        maxEvidencePerFile: z
          .number()
          .int()
          .min(1)
          .max(25)
          .optional()
          .describe('max zones/evidence/proof-debt items per file; default 5'),
        includePositiveFiles: z
          .boolean()
          .optional()
          .describe('default true; false returns only negative/proof-debt files and omits clean positives'),
      },
    },
    async (a) => {
      try {
        const scope = a.scope && a.scope.trim().length > 0 ? a.scope : '.';
        const maxFiles = a.maxFiles ?? 200;
        const maxEvidence = a.maxEvidencePerFile ?? 5;
        const includePositiveFiles = a.includePositiveFiles ?? true;
        const files = enumerateScope(REPO_ROOT, scope);
        const unjudgedDirectFiles = enumerateDirectNonSourceFiles(REPO_ROOT, scope).filter((file) => !files.includes(file));
        const report = await runLens(REPO_ROOT, scope);
        type ScanVerdict = 'HAS_NEGATIVE_BYTES' | 'POSITIVE_WITHIN_DECLARED_BATTERY' | 'UNJUDGED';
        type ScanAction = 'repair-negative-byte' | 'extend-declared-battery' | 'preserve-positive-byte';
        const summaries: Array<{
          file: string;
          sha256: string;
          bytes: number;
          lineCount: number;
          verdict: ScanVerdict;
          sourceLensApplied: boolean;
          zoneCount: number;
          zones: AtomicReadZone[];
          negativeByteEvidenceCount: number;
          negativeByteEvidence: typeof report.actionableNegativeByteEvidence;
          containedEvidenceCount: number;
          containedEvidence: typeof report.negativeByteEvidence;
          proofDebt: string[];
          recommendedAction: ScanAction;
        }> = [];
        let sourceFilesRead = 0;
        let totalBytes = 0;
        let totalLines = 0;
        let positiveFiles = 0;
        let negativeFiles = 0;
        let proofDebtFiles = 0;
        let unjudgedFilesRead = 0;
        let omittedPositiveFiles = 0;

        for (const rel of files) {
          let content: string;
          try {
            content = readUtf8(path.resolve(REPO_ROOT, rel));
          } catch {
            continue;
          }
          sourceFilesRead += 1;
          const bytes = byteLength(content);
          const lineCount = atomicReadLineRanges(content).length;
          const zones = atomicReadZones(report, rel, 0, bytes);
          const negativeEvidence = report.actionableNegativeByteEvidence.filter((entry) => entry.file === rel);
          const containedEvidence = report.negativeByteEvidence.filter(
            (entry) => entry.file === rel && entry.classification !== 'negative',
          );
          const proofDebt = report.unjudged.slice(0, maxEvidence);
          const verdict: ScanVerdict =
            negativeEvidence.length > 0 ? 'HAS_NEGATIVE_BYTES' : 'POSITIVE_WITHIN_DECLARED_BATTERY';
          const recommendedAction: ScanAction =
            negativeEvidence.length > 0
              ? 'repair-negative-byte'
              : proofDebt.length > 0
                ? 'extend-declared-battery'
                : 'preserve-positive-byte';
          totalBytes += bytes;
          totalLines += lineCount;
          if (verdict === 'HAS_NEGATIVE_BYTES') negativeFiles += 1;
          else positiveFiles += 1;
          if (proofDebt.length > 0) proofDebtFiles += 1;
          const summary = {
            file: rel,
            sha256: sha256(content),
            bytes,
            lineCount,
            verdict,
            sourceLensApplied: true as const,
            zoneCount: zones.length,
            zones: zones.slice(0, maxEvidence),
            negativeByteEvidenceCount: negativeEvidence.length,
            negativeByteEvidence: negativeEvidence.slice(0, maxEvidence),
            containedEvidenceCount: containedEvidence.length,
            containedEvidence: containedEvidence.slice(0, maxEvidence),
            proofDebt,
            recommendedAction,
          };
          if (includePositiveFiles || verdict !== 'POSITIVE_WITHIN_DECLARED_BATTERY' || proofDebt.length > 0) {
            summaries.push(summary);
          } else {
            omittedPositiveFiles += 1;
          }
        }

        for (const rel of unjudgedDirectFiles) {
          let content: string;
          try {
            content = readUtf8(path.resolve(REPO_ROOT, rel));
          } catch {
            continue;
          }
          unjudgedFilesRead += 1;
          const bytes = byteLength(content);
          const lineCount = atomicReadLineRanges(content).length;
          const proofDebt = ['file readable, but no declared source-language battery could classify these bytes as positive'];
          totalBytes += bytes;
          totalLines += lineCount;
          proofDebtFiles += 1;
          summaries.push({
            file: rel,
            sha256: sha256(content),
            bytes,
            lineCount,
            verdict: 'UNJUDGED',
            sourceLensApplied: false,
            zoneCount: 1,
            zones: [
              {
                classification: 'unjudged',
                byteStart: 0,
                byteEnd: bytes,
                byteLength: bytes,
                reason: 'No source-language lens battery applied to this file; bytes are readable but not proven positive.',
              },
            ],
            negativeByteEvidenceCount: 0,
            negativeByteEvidence: [],
            containedEvidenceCount: 0,
            containedEvidence: [],
            proofDebt,
            recommendedAction: 'extend-declared-battery',
          });
        }

        summaries.sort((a, b) => {
          const ap = a.verdict === 'HAS_NEGATIVE_BYTES' ? 0 : a.proofDebt.length > 0 ? 1 : 2;
          const bp = b.verdict === 'HAS_NEGATIVE_BYTES' ? 0 : b.proofDebt.length > 0 ? 1 : 2;
          if (ap !== bp) return ap - bp;
          return a.file.localeCompare(b.file);
        });
        const listedFiles = summaries.slice(0, maxFiles);
        return ok({
          ok: true,
          scope,
          scanned: report.scanned,
          enumeratedSourceFiles: files.length,
          sourceFilesRead,
          unjudgedFilesRead,
          returnedFiles: listedFiles.length,
          omittedAfterLimit: Math.max(0, summaries.length - listedFiles.length),
          omittedPositiveFiles,
          ran: report.ran,
          totals: {
            bytes: totalBytes,
            lines: totalLines,
            positiveFiles,
            negativeFiles,
            proofDebtFiles,
            unjudgedFiles: unjudgedFilesRead,
            negativeByteEvidence: report.actionableNegativeByteEvidence.length,
            containedEvidence:
              report.containedNegativeFixtureEvidence.length +
              report.containedGeneratedCodeEvidence.length +
              report.containedRegExpSourceEvidence.length,
            unjudgedDomains: report.unjudged.length,
          },
          unjudgedDomains: report.unjudged.slice(0, 50),
          unjudgedEvidence: (report.unjudgedEvidence ?? []).slice(0, 50),
          files: listedFiles,
          summaryForHuman:
            `Atomic byte scan "${scope}": ${sourceFilesRead} source file(s), ${unjudgedFilesRead} unjudged direct file(s), ` +
            `${positiveFiles} positive within declared battery, ${negativeFiles} with negative bytes, ` +
            `${proofDebtFiles} with proof debt, ${omittedPositiveFiles} positive omitted by filter.`,
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
