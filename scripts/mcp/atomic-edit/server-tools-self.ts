import * as childProcess from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveSafeTarget, REPO_ROOT } from './guard.js';
import { guardSha, atomicWrite, readUtf8, sha256, targetDetails } from './server-helpers-io.js';
import { withSelfExpansionAdmission, isAtomicSelfExpansionPath } from './server-helpers-self-expansion.js';
import { ok, fail } from './server-helpers-result.js';
import { captureEffectSnapshot, diffEffect, rollbackEffect } from './server-helpers-effect.js';
import { requireNegativeActionProof, requireNegativeProofForRemovedBytes, type NegativeActionProof } from './server-helpers-negative-proof.js';

interface SelfFileOp {
  op: 'create' | 'replace' | 'delete' | 'replace_text';
  file: string;
  content?: string;
  oldText?: string;
  newText?: string;
  occurrence?: number;
  expectedSha256?: string;
  proofOfIncorrectness?: string;
}

interface SelfExpansionValidator {
  phase: string;
  command: string;
}

const MANDATORY_SELF_EXPANSION_VALIDATORS: readonly SelfExpansionValidator[] = [
  { phase: 'build', command: 'node build.mjs' },
  { phase: 'runtime-freshness', command: 'node gates/dist-freshness.proof.mjs --json' },
  { phase: 'type', command: 'node gates/type-soundness-gate.proof.mjs --json' },
  { phase: 'semantic', command: 'node gates/structural-lint-gate.proof.mjs --json' },
  { phase: 'semantic-impact', command: 'node gates/algebra.proof.mjs' },
  { phase: 'semantic-impact', command: 'node gates/closure-universal.proof.mjs' },
  { phase: 'semantic-impact', command: 'node gates/merge.proof.mjs' },
  { phase: 'reachability', command: 'node dist/gates/reachability-gate.proof.js' },
  { phase: 'binding', command: 'node dist/gates/binding-gate.proof.js' },
  { phase: 'convergence', command: 'node gates/converge-operator.proof.mjs' },
  { phase: 'runtime-probe', command: 'node dist/gates/probe-convergence-gate.proof.js' },
  { phase: 'formal', command: 'node dist/gates/formal-gate.proof.js' },
  { phase: 'property', command: 'node dist/gates/property-gate.proof.js' },
  { phase: 'findings-delta', command: 'node dist/gates/findings-delta-gate.proof.js' },
  { phase: 'contract-edge', command: 'node dist/gates/contract-edge-gate.proof.js' },
  { phase: 'public-contract', command: 'node gates/public-contract-gate.proof.mjs --json' },
  { phase: 'behavior', command: 'node gates/behavior-contract-gate.proof.mjs --json' },
  { phase: 'security', command: 'node gates/security-gate.proof.mjs --json' },
  { phase: 'monotonicity', command: 'node gates/security-monotonicity.proof.mjs --json' },
  { phase: 'test', command: 'node gates/test-execution-gate.proof.mjs --json' },
  { phase: 'ledger', command: 'node proof-chain.proof.mjs --json' },
  { phase: 'certificate', command: 'node gates/y-certificate-mandatory-domains.proof.mjs --json' },
  { phase: 'runtime', command: 'node gates/codex-entrypoint-contract.proof.mjs --json' },
  { phase: 'runtime', command: 'node gates/compiled-mcp-y-certificate.proof.mjs --json' },
  { phase: 'usability', command: 'node gates/atomic-exec-readonly-usability.proof.mjs --json' },
  { phase: 'no-bypass', command: 'node codex-atomic-only-hook.proof.mjs --json' },
];

function parseFileOps(raw: unknown[]): SelfFileOp[] {
  return raw.map((entry) => {
    const e = entry as Record<string, unknown>;
    return {
      op: e.op === 'replace' || e.op === 'delete' || e.op === 'replace_text' ? e.op : 'create',
      file: String(e.file ?? ''),
      content: typeof e.content === 'string' ? e.content : undefined,
      oldText: typeof e.oldText === 'string' ? e.oldText : undefined,
      newText: typeof e.newText === 'string' ? e.newText : undefined,
      occurrence: typeof e.occurrence === 'number' && Number.isInteger(e.occurrence) && e.occurrence > 0 ? e.occurrence : undefined,
      expectedSha256: typeof e.expectedSha256 === 'string' ? e.expectedSha256 : undefined,
      proofOfIncorrectness: typeof e.proofOfIncorrectness === 'string' ? e.proofOfIncorrectness : undefined,
    };
  });
}

function allowedProofCommand(command: string): boolean {
  const c = command.trim();
  return (
    c === 'node build.mjs' ||
    c === 'node dist/smoke.js' ||
    /^node [A-Za-z0-9_.-]+\.proof\.mjs(?: --json)?$/.test(c) ||
    /^node gates\/[A-Za-z0-9_.-]+\.proof\.mjs(?: --json)?$/.test(c) ||
    /^node dist\/gates\/[A-Za-z0-9_.-]+\.proof\.js$/.test(c) ||
    /^npx tsx gates\/[A-Za-z0-9_.-]+\.proof\.ts$/.test(c)
  );
}

function normalizeSelfExpansionProofCommands(raw: readonly string[] | undefined): string[] {
  const merged = new Map<string, string>();
  for (const validator of MANDATORY_SELF_EXPANSION_VALIDATORS) merged.set(validator.command, validator.command);
  for (const command of raw ?? []) {
    const trimmed = command.trim();
    if (trimmed.length > 0) merged.set(trimmed, trimmed);
  }
  return [...merged.values()];
}

function proofTimeoutMs(command: string): number {
  if (command === 'node dist/smoke.js') return 240000;
  if (command.includes('compiled-mcp-y-certificate') || command.includes('codex-entrypoint-contract')) return 120000;
  return 60000;
}

function runProofCommands(commands: string[]): { command: string; ok: boolean; stdout: string; stderr: string }[] {
  return commands.map((command) => {
    const res = childProcess.spawnSync('/bin/bash', ['-c', command], {
      cwd: path.join(REPO_ROOT, 'scripts/mcp/atomic-edit'),
      encoding: 'utf8',
      timeout: proofTimeoutMs(command),
      maxBuffer: 32 * 1024 * 1024,
    });
    return {
      command,
      ok: res.status === 0,
      stdout: res.stdout ?? '',
      stderr: res.stderr ?? (res.error instanceof Error ? res.error.message : ''),
    };
  });
}

/**
 * Proof #5 - capability monotonicity, enforced. Runs security-invariants.mjs in
 * --enforce mode: it measures the engine's own security surface (write-gate count,
 * exec FORBIDDEN laws, native-edit bans, sync byte-floor gates, byte-floor guards)
 * and refuses (exit 1) if any fell below its ratcheting high-water baseline.
 * Mandatory and non-skippable - it is both a pre-proof refusal and an explicit
 * validator-lattice phase. A regression throws here and the expand_self catch
 * rolls back byte-exact. With { ratchet: true } it additionally persists the new
 * max() baseline (used only AFTER all proofs pass, so a validated strengthening
 * locks immediately).
 */
function enforceSecurityMonotonicity(options: { ratchet?: boolean } = {}): void {
  const args = options.ratchet ? ['security-invariants.mjs', '--enforce', '--ratchet'] : ['security-invariants.mjs', '--enforce'];
  const res = childProcess.spawnSync(process.execPath, args, {
    cwd: path.join(REPO_ROOT, 'scripts/mcp/atomic-edit'),
    encoding: 'utf8',
    timeout: 30000,
  });
  if (res.status !== 0) {
    throw new Error(
      `security monotonicity refused this expansion: ${(res.stderr || res.stdout || 'unknown').toString().trim()}`,
    );
  }
}

function ensureSelfTarget(absPath: string, relPath: string): void {
  if (!isAtomicSelfExpansionPath(REPO_ROOT, absPath)) {
    throw new Error(
      `atomic_expand_self only admits files inside scripts/mcp/atomic-edit/**; got ${relPath}. ` +
        `Use product-level atomic tools for product code, not self-expansion.`,
    );
  }
}

function applySelfFileOp(entry: SelfFileOp): { file: string; op: SelfFileOp['op']; beforeSha256: string | null; afterSha256: string | null; negativeActionProof?: NegativeActionProof } {
  const { absPath, relPath } = resolveSafeTarget(entry.file);
  ensureSelfTarget(absPath, relPath);
  const exists = fs.existsSync(absPath);
  const before = exists && fs.statSync(absPath).isFile() ? readUtf8(absPath) : null;
  if (before !== null) guardSha(before, entry.expectedSha256);
  if (entry.op === 'create') {
    if (before !== null && before.length > 0) throw new Error(`refused: ${relPath} already exists; use op=replace with sha proof.`);
    atomicWrite(absPath, entry.content ?? '');
    return { file: relPath, op: entry.op, beforeSha256: before === null ? null : sha256(before), afterSha256: sha256(entry.content ?? '') };
  }
  if (entry.op === 'replace') {
    if (before === null) throw new Error(`refused: ${relPath} does not exist; use op=create.`);
    if (entry.content === undefined) throw new Error(`refused: ${relPath} replace requires content.`);
    const negativeActionProof = requireNegativeProofForRemovedBytes({
      action: 'atomic_expand_self:replace',
      target: relPath,
      targetUnit: 'self-file',
      before,
      after: entry.content,
      proofOfIncorrectness: entry.proofOfIncorrectness,
    });
    atomicWrite(absPath, entry.content);
    return {
      file: relPath,
      op: entry.op,
      beforeSha256: sha256(before),
      afterSha256: sha256(entry.content),
      ...(negativeActionProof ? { negativeActionProof } : {}),
    };
  }
  if (entry.op === 'replace_text') {
    if (before === null) throw new Error(`refused: ${relPath} does not exist; replace_text requires an existing self file.`);
    if (entry.oldText === undefined || entry.oldText.length === 0) {
      throw new Error(`refused: ${relPath} replace_text requires non-empty oldText.`);
    }
    if (entry.newText === undefined) throw new Error(`refused: ${relPath} replace_text requires newText.`);
    const matches: number[] = [];
    let index = before.indexOf(entry.oldText);
    while (index !== -1) {
      matches.push(index);
      index = before.indexOf(entry.oldText, index + entry.oldText.length);
    }
    if (matches.length === 0) throw new Error(`refused: ${relPath} replace_text oldText matched 0 ranges.`);
    if (entry.occurrence === undefined && matches.length !== 1) {
      throw new Error(`refused: ${relPath} replace_text matched ${matches.length} ranges; pass occurrence.`);
    }
    const matchIndex = entry.occurrence === undefined ? 0 : entry.occurrence - 1;
    if (matchIndex < 0 || matchIndex >= matches.length) {
      throw new Error(`refused: ${relPath} replace_text occurrence ${entry.occurrence} outside ${matches.length} match(es).`);
    }
    const start = matches[matchIndex];
    const after = before.slice(0, start) + entry.newText + before.slice(start + entry.oldText.length);
    const negativeActionProof = requireNegativeProofForRemovedBytes({
      action: 'atomic_expand_self:replace_text',
      target: relPath,
      targetUnit: 'self-text-range',
      before,
      after,
      proofOfIncorrectness: entry.proofOfIncorrectness,
    });
    atomicWrite(absPath, after);
    return {
      file: relPath,
      op: entry.op,
      beforeSha256: sha256(before),
      afterSha256: sha256(after),
      ...(negativeActionProof ? { negativeActionProof } : {}),
    };
  }
  if (before === null) return { file: relPath, op: entry.op, beforeSha256: null, afterSha256: null };
  const negativeActionProof = requireNegativeActionProof({
    action: 'atomic_expand_self:delete',
    target: relPath,
    targetUnit: 'self-file',
    removedByteCount: Buffer.byteLength(before, 'utf8'),
    proofOfIncorrectness: entry.proofOfIncorrectness,
  });
  fs.unlinkSync(absPath);
  return { file: relPath, op: entry.op, beforeSha256: sha256(before), afterSha256: null, negativeActionProof };
}

export function registerToolsSelf(server: McpServer): void {
  server.registerTool(
    'atomic_expand_self',
    {
      title: 'Expand atomic-edit itself under self-expansion admission + proof',
      description:
        'The only legal way to modify scripts/mcp/atomic-edit/** after the self-expansion guard is active. ' +
        'It applies atomic byte writes/deletes inside a scoped admission window, enforces capability monotonicity, ' +
        'runs a mandatory multi-domain validator lattice (build, runtime-freshness, type, semantic, semantic-impact, reachability, ' +
        'binding, convergence, runtime-probe, formal, property, findings-delta, contract-edge, public-contract, behavior, security, monotonicity, test, ledger, ' +
        'certificate, runtime, usability, no-bypass), then runs any additional allowed caller proof commands. If ' +
        'application, monotonicity, mandatory validation, or proof fails, the filesystem effect is rolled back ' +
        'byte-exact from the pre-expansion snapshot. On success, the receipt includes the full byte-effect diff.',
      inputSchema: {
        files: z
          .array(
            z.object({
              op: z.enum(['create', 'replace', 'delete', 'replace_text']),
              file: z.string(),
              content: z.string().optional(),
              oldText: z.string().optional(),
              newText: z.string().optional(),
              occurrence: z.number().int().positive().optional(),
              expectedSha256: z.string().optional(),
              proofOfIncorrectness: z.string().optional(),
            }),
          )
          .min(1),
        proofCommands: z
          .array(z.string())
          .min(1)
          .optional()
          .describe('additional allowed proof commands; mandatory validator lattice always runs first'),
        intent: z.string().optional(),
      },
    },
    async (a) => {
      const proofCommands = normalizeSelfExpansionProofCommands(a.proofCommands);
      try {
        const rejected = proofCommands.find((command) => !allowedProofCommand(command));
        if (rejected) {
          return fail(
            `refused: proof command is outside the self-expansion proof allowlist: ${rejected}. ` +
              `Allowed examples: node build.mjs, node dist/smoke.js, node *.proof.mjs --json, node dist/gates/*.proof.js, npx tsx gates/*.proof.ts.`,
          );
        }
        const ops = parseFileOps(a.files as unknown[]);
        const selfRoot = path.join(REPO_ROOT, 'scripts/mcp/atomic-edit');
        const snap = captureEffectSnapshot(selfRoot);
        try {
          const applied = withSelfExpansionAdmission(() => ops.map(applySelfFileOp));
          // Proof #5 - capability monotonicity: AFTER the bytes land, BEFORE proofs,
          // refuse (and roll back) any expansion that reduced the engine's own
          // security surface. Mandatory and non-skippable (not a caller proofCommand).
          enforceSecurityMonotonicity();
          const proofs = runProofCommands(proofCommands);
          const failed = proofs.filter((p) => !p.ok);
          if (failed.length > 0) {
            const effects = diffEffect(snap);
            const restored = rollbackEffect(snap, effects);
            return fail(
              `atomic_expand_self rolled back ${restored} file effect(s): proof failed: ` +
                failed.map((p) => p.command).join(', '),
            );
          }
          // All proofs passed - the expansion is fully validated. RATCHET the
          // security baseline so any strengthening of the engine's own surface
          // immediately becomes the locked minimum (closes the persistence window
          // where a raised surface was not yet the baseline). Best-effort: a ratchet
          // failure never fails an already-proven-green expansion.
          try {
            enforceSecurityMonotonicity({ ratchet: true });
          } catch {
            /* baseline persistence is best-effort; the check already passed */
          }
          const effects = diffEffect(snap);
          return ok({
            ok: true,
            changed: true,
            intent: a.intent ?? null,
            files: applied,
            validatorLattice: MANDATORY_SELF_EXPANSION_VALIDATORS.map((validator) => ({
              phase: validator.phase,
              command: validator.command,
            })),
            proofs: proofs.map((p) => ({ command: p.command, ok: p.ok })),
            effect: {
              changedFiles: effects.length,
              limitReached: snap.limitReached,
              files: effects,
            },
            target: targetDetails(path.join(REPO_ROOT, 'scripts/mcp/atomic-edit'), 'scripts/mcp/atomic-edit'),
            admission: 'self-expansion-validator-lattice-green',
          });
        } catch (e) {
          const effects = diffEffect(snap);
          const restored = rollbackEffect(snap, effects);
          const message = e instanceof Error ? e.message : String(e);
          return fail(`atomic_expand_self rolled back ${restored} file effect(s): ${message}`);
        }
      } catch (e) {
        return fail(e instanceof Error ? e.message : String(e));
      }
    },
  );
}
