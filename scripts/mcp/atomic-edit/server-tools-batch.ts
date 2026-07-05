import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { applyEdits, computeZones, replaceText, validate, type ApplyResult } from './engine.js';
import { resolveSafeTarget } from './guard.js';
import {
  atomicWrite,
  changedSpanMetrics,
  guardSha,
  log,
  readUtf8,
  sha256,
  targetDetails,
} from './server-helpers-io.js';
import { ok, fail } from './server-helpers-result.js';
import { buildTrace, writeTrace } from './trace.js';
import { characterDiff } from './advanced.js';
import { registerPendingWrites, clearPendingWrites } from './connection-gate.js';
import { requireNegativeProofForRemovedBytes } from './server-helpers-negative-proof.js';

type StagedCreate = {
  relPath: string;
  absPath: string;
  repoRoot: string;
  before: string;
  result: ApplyResult;
  existedBefore: boolean;
};

type ReplacementInput = {
  file: string;
  oldText: string;
  newText: string;
  occurrence?: number;
  expectedSha256?: string;
  proofOfIncorrectness?: string;
};

type StagedBatchReplace = {
  relPath: string;
  absPath: string;
  repoRoot: string;
  before: string;
  after: string;
  replacements: number;
  negativeActionProof?: ReturnType<typeof requireNegativeProofForRemovedBytes>;
  negativeActionProofAuto?: boolean;
  validation: ReturnType<typeof validate>;
  metrics: ReturnType<typeof changedSpanMetrics>;
};

function groupedByFile(replacements: ReplacementInput[]): Map<string, ReplacementInput[]> {
  const grouped = new Map<string, ReplacementInput[]>();
  for (const replacement of replacements) {
    const group = grouped.get(replacement.file) ?? [];
    group.push(replacement);
    grouped.set(replacement.file, group);
  }
  return grouped;
}

function autoProofFromIntent(intent: unknown): string | undefined {
  const normalized = typeof intent === 'string' ? intent.trim().replace(/\s+/g, ' ') : '';
  if (normalized.length < 20) return undefined;
  return (
    'Auto-derived from atomic_batch_replace_text intent: ' +
    normalized +
    '. The replaced old bytes are negative relative to this declared intent and replacement plan; preserving them would fail the requested transformation.'
  );
}

function compactBatchFileResult(file: StagedBatchReplace): Record<string, unknown> {
  return {
    file: file.relPath,
    replacements: file.replacements,
    bytesNet: Buffer.byteLength(file.after, 'utf8') - Buffer.byteLength(file.before, 'utf8'),
    afterSha256: sha256(file.after),
    validation: {
      language: file.validation.language,
      syntaxErrorsBefore: file.validation.before,
      syntaxErrorsAfter: file.validation.after,
    },
    intentionChars: file.metrics.changedChars,
    lineRewriteSurfaceChars: file.metrics.lineSurfaceChars,
    negativeActionProofAuto: file.negativeActionProofAuto === true,
    expansionFactorAvoided: file.metrics.expansionFactor,
    ...targetDetails(file.absPath, file.relPath),
  };
}

function firstInsert(content: string): { start: { line: 1; column: 1 }; end: { line: 1; column: 1 }; newText: string } {
  return {
    start: { line: 1, column: 1 },
    end: { line: 1, column: 1 },
    newText: content,
  };
}

function lineCount(text: string): number {
  return text.length === 0 ? 0 : text.split('\n').length;
}

export function registerBatchTools(server: McpServer): void {
  server.registerTool(
    'atomic_multi_create',
    {
      title: 'Create multiple files in one atomic transaction',
      description:
        'Create 1-N new files in a SINGLE macro-atomic transaction. Every file is resolved through ' +
        'the governance guard, checked for duplicate/existing targets, syntax-validated in memory, ' +
        'then committed as one pending write set with one trace per file. If any preflight fails, ' +
        'nothing is written. If any write throws mid-flight, already-created files are cleaned up ' +
        'before the tool returns failure. This is the macro equivalent of N atomic_create_file calls ' +
        'with the same mutation firewall and receipt discipline, but one tool call for multi-file ' +
        'materialization.',
      inputSchema: {
        files: z.array(z.object({
          file: z.string().describe('repo-relative path of the file to create'),
          content: z.string().describe('full file content'),
        })).min(1).max(20).describe('Files to create as one all-or-nothing set'),
        preview: z.boolean().optional().describe('dry-run: resolve and validate every file, write nothing'),
      },
    },
    async (a) => {
      try {
        const staged: StagedCreate[] = [];
        const seen = new Set<string>();

        for (const f of a.files) {
          const { absPath, relPath, repoRoot } = resolveSafeTarget(f.file);
          if (seen.has(relPath)) {
            return fail(`atomic_multi_create refused: duplicate target ${relPath} - NOTHING written.`);
          }
          seen.add(relPath);

          const existedBefore = fs.existsSync(absPath);
          const before = existedBefore ? fs.readFileSync(absPath, 'utf8') : '';
          if (before.length > 0) {
            return fail(
              `atomic_multi_create refused: ${relPath} already exists and has bytes. ` +
                'Use a surgical edit/transaction operator for existing files; multi-create only materializes new byte-positive files.',
            );
          }

          const result = applyEdits(relPath, before, [firstInsert(f.content)]);
          if (!result.validation.ok) {
            return fail(
              `atomic_multi_create refused: ${relPath} would regress ` +
                `${result.validation.language} syntax ` +
                `(${result.validation.before}->${result.validation.after}). ` +
                `${result.validation.introduced ?? ''} - NOTHING written.`,
            );
          }
          staged.push({ relPath, absPath, repoRoot, before, result, existedBefore });
        }

        const files = staged.map((s) => ({
          file: s.relPath,
          lines: lineCount(s.result.newText),
          bytes: Buffer.byteLength(s.result.newText, 'utf8'),
          afterSha256: sha256(s.result.newText),
          syntax: {
            language: s.result.validation.language,
            before: s.result.validation.before,
            after: s.result.validation.after,
          },
        }));

        if (a.preview) {
          return ok({
            ok: true,
            preview: true,
            transaction: true,
            changed: false,
            operator: 'atomic_multi_create',
            files,
            summaryForHuman:
              `atomic_multi_create preview: ${staged.length} file(s) resolved and validated; NOTHING written.`,
          });
        }

        const written: StagedCreate[] = [];
        registerPendingWrites(staged.map((s) => s.absPath));
        try {
          for (const s of staged) {
            fs.mkdirSync(path.dirname(s.absPath), { recursive: true });
            atomicWrite(s.absPath, s.result.newText);
            written.push(s);
          }
        } catch (writeErr) {
          for (const s of written.reverse()) {
            try {
              if (s.existedBefore) atomicWrite(s.absPath, s.before);
              else fs.rmSync(s.absPath, { force: true });
            } catch {
              /* best-effort cleanup; preserve the original write error below */
            }
          }
          return fail(
            `atomic_multi_create write failed; cleaned up ${written.length} created file(s): ` +
              (writeErr instanceof Error ? writeErr.message : String(writeErr)),
          );
        } finally {
          clearPendingWrites();
        }

        const traceRefs: string[] = [];
        const filesWithTrace = files.map((file) => ({ ...file }));
        for (const s of staged) {
          try {
            const trace = buildTrace({
              file: s.relPath,
              repoRoot: s.repoRoot,
              operator: 'atomic_multi_create',
              targetUnit: 'file_creation_set_member',
              intention: 'Materialize one member of a multi-file creation transaction.',
              before: s.before,
              newText: s.result.newText,
              inlinePreview: characterDiff(s.before, s.result.newText, s.relPath),
              validation: {
                language: s.result.validation.language,
                before: s.result.validation.before,
                after: s.result.validation.after,
              },
              metrics: {
                changedChars: s.result.changedChars,
                lineRewriteSurfaceChars: s.result.lineSurfaceChars,
                expansionFactorAvoided: s.result.expansionFactor,
                bytesNet: Buffer.byteLength(s.result.newText, 'utf8') - Buffer.byteLength(s.before, 'utf8'),
              },
              preservedZones: s.result.zones.preservedZones,
              modifiedZones: s.result.zones.modifiedZones,
              movementZones: s.result.zones.movementZones,
              semanticImpact: 'macro_file_creation',
              changed: true,
            });
            const persisted = writeTrace(trace, { before: s.before, after: s.result.newText });
            const matched = filesWithTrace.find((f) => f.file === s.relPath);
            if (matched) Object.assign(matched, persisted, { operationId: trace.operationId });
            if (persisted.tracePath) traceRefs.push(persisted.tracePath);
          } catch (traceErr) {
            const matched = filesWithTrace.find((f) => f.file === s.relPath);
            if (matched) {
              Object.assign(matched, {
                traceWriteError: traceErr instanceof Error ? traceErr.message : String(traceErr),
              });
            }
          }
        }

        log(`atomic_multi_create wrote ${written.length}/${staged.length} file(s)`);
        return ok({
          ok: true,
          transaction: true,
          changed: true,
          operator: 'atomic_multi_create',
          created: written.length,
          files: filesWithTrace,
          traceRefs,
          summaryForHuman:
            `atomic_multi_create applied: ${written.length} file(s) created as one transaction. ` +
            'Content was supplied by the caller; char-level proof is persisted to trace files, not echoed back.',
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );

  server.registerTool(
    'atomic_batch_replace_text',
    {
      title: 'Batch exact-text replacements in one atomic transaction',
      description:
        'Apply 1-N exact oldText->newText replacements across one or more files as one macro-atomic transaction. ' +
        'Use this before serial micro-edits whenever one coherent intent has multiple known spans, including ' +
        'insertions expressible as exact contextual replacements. This is the fast path for clustered edits that ' +
        'would otherwise require many atomic_replace_text/insert calls and repeated validation/receipt cycles. ' +
        'Every target is resolved through the active workspace guard, every file is sha-guarded when requested, ' +
        'all replacements are validated in memory before any write, and commit returns one compact receipt while ' +
        'persisting full per-file traces. If replacements remove bytes and no explicit proof is supplied, ' +
        'a sufficiently specific intent auto-derives the negative-byte proof and marks the receipt; ' +
        'missing/short intent still refuses.',
      inputSchema: {
        intent: z.string().optional().describe('human/product intent this replacement batch realizes; if specific enough, it can auto-derive negative-byte proof for removed oldText bytes'),
        replacements: z.array(z.object({
          file: z.string().describe('repo-relative path or absolute path inside the active workspace'),
          oldText: z.string().describe('exact verbatim text to replace, including whitespace'),
          newText: z.string().describe('replacement text'),
          occurrence: z.number().int().min(1).optional(),
          expectedSha256: z.string().optional().describe('optional original-file sha256 guard'),
          proofOfIncorrectness: z.string().optional().describe('proof required if this replacement removes bytes'),
        })).min(1).max(80),
        proofOfIncorrectness: z.string().optional().describe('explicit transaction-level proof used when a file-level diff removes bytes; optional only when intent is specific enough to auto-derive proof'),
        preview: z.boolean().optional().describe('dry-run: validate and return the compact plan, write nothing'),
        compactReceipt: z.boolean().optional().describe('reserved for receipt-shaping policy; full proof persists to trace'),
      },
    },
    async (a) => {
      try {
        const replacements = a.replacements as ReplacementInput[];
        const staged: StagedBatchReplace[] = [];

        for (const [requestedFile, group] of groupedByFile(replacements)) {
          const { absPath, relPath, repoRoot } = resolveSafeTarget(requestedFile);
          const before = readUtf8(absPath);
          for (const replacement of group) {
            guardSha(before, replacement.expectedSha256);
          }

          let after = before;
          for (const replacement of group) {
            after = replaceText(
              relPath,
              after,
              replacement.oldText,
              replacement.newText,
              replacement.occurrence,
            ).newText;
          }

          const validation = validate(relPath, before, after);
          if (!validation.ok) {
            return fail(
              'atomic_batch_replace_text refused: ' +
                relPath +
                ' would regress ' +
                validation.language +
                ' syntax (' +
                validation.before +
                '->' +
                validation.after +
                '). ' +
                (validation.introduced ?? '') +
                ' - NOTHING written.',
            );
          }

          const perReplacementProof = group
            .map((replacement) => replacement.proofOfIncorrectness)
            .filter((value): value is string => Boolean(value))
            .join('\n');
          const explicitProof = perReplacementProof || a.proofOfIncorrectness;
          const autoProof = explicitProof ? undefined : autoProofFromIntent(a.intent);
          const negativeActionProof = requireNegativeProofForRemovedBytes({
            action: 'atomic_batch_replace_text',
            target: relPath,
            targetUnit: 'file-replacement-batch',
            before,
            after,
            proofOfIncorrectness: explicitProof || autoProof,
            preview: a.preview ?? false,
          });

          staged.push({
            relPath,
            absPath,
            repoRoot,
            before,
            after,
            replacements: group.length,
            negativeActionProof,
            negativeActionProofAuto: Boolean(autoProof),
            validation,
            metrics: changedSpanMetrics(before, after),
          });
        }

        const files = staged.map(compactBatchFileResult);
        if (a.preview) {
          return ok({
            ok: true,
            operator: 'atomic_batch_replace_text',
            preview: true,
            transaction: true,
            changed: false,
            files,
            replacements: replacements.length,
            summaryForHuman:
              'atomic_batch_replace_text preview: ' +
              staged.length +
              ' file(s), ' +
              replacements.length +
              ' replacement(s), all validated; NOTHING written.',
          });
        }

        const written: StagedBatchReplace[] = [];
        registerPendingWrites(staged.map((s) => s.absPath));
        try {
          for (const file of staged) {
            atomicWrite(file.absPath, file.after);
            written.push(file);
          }
        } catch (writeErr) {
          for (const file of written.reverse()) {
            try {
              atomicWrite(file.absPath, file.before);
            } catch {
              /* best-effort containment for unexpected disk/broker failure */
            }
          }
          return fail(
            'atomic_batch_replace_text write failed; restored ' +
              written.length +
              ' file(s): ' +
              (writeErr instanceof Error ? writeErr.message : String(writeErr)),
          );
        } finally {
          clearPendingWrites();
        }

        const traceRefs: string[] = [];
        const filesWithTrace = files.map((file) => ({ ...file }));
        for (const file of staged) {
          const zones = computeZones(file.before, file.after);
          const trace = buildTrace({
            file: file.relPath,
            repoRoot: file.repoRoot,
            operator: 'atomic_batch_replace_text',
            targetUnit: 'file-replacement-batch',
            intention: a.intent ?? 'Apply a clustered exact-text replacement transaction.',
            before: file.before,
            newText: file.after,
            inlinePreview: characterDiff(file.before, file.after, file.relPath),
            validation: {
              language: file.validation.language,
              before: file.validation.before,
              after: file.validation.after,
            },
            metrics: {
              changedChars: file.metrics.changedChars,
              lineRewriteSurfaceChars: file.metrics.lineSurfaceChars,
              expansionFactorAvoided: file.metrics.expansionFactor,
              bytesNet: Buffer.byteLength(file.after, 'utf8') - Buffer.byteLength(file.before, 'utf8'),
            },
            preservedZones: zones.preservedZones,
            modifiedZones: zones.modifiedZones,
            movementZones: zones.movementZones,
            semanticImpact: 'macro_exact_text_transaction',
            changed: true,
            negativeActionProof: file.negativeActionProof,
          });
          const persisted = writeTrace(trace, { before: file.before, after: file.after });
          const matched = filesWithTrace.find((entry) => entry.file === file.relPath);
          if (matched) Object.assign(matched, persisted, { operationId: trace.operationId });
          if (persisted.tracePath) traceRefs.push(persisted.tracePath);
        }

        log(
          'atomic_batch_replace_text wrote ' +
            written.length +
            '/' +
            staged.length +
            ' file(s), replacements=' +
            replacements.length,
        );
        return ok({
          ok: true,
          operator: 'atomic_batch_replace_text',
          transaction: true,
          changed: true,
          compactReceipt: a.compactReceipt ?? true,
          files: filesWithTrace,
          traceRefs,
          replacements: replacements.length,
          summaryForHuman:
            'atomic_batch_replace_text applied: ' +
            written.length +
            ' file(s), ' +
            replacements.length +
            ' replacement(s), one transaction. Full byte proof persisted to trace files.',
        });
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
