/**
 * ADDITIVE, best-effort dual-write helpers that mirror a `RAC_DecisionOutcome`
 * decision into the parallel `RAC_MindPolicy` ledger.
 *
 * These are pure mapping + thin Prisma helpers used by
 * {@link DecisionOutcomeService} when `KLOEL_DECISION_LEDGER_DUALWRITE` is on.
 * They NEVER touch the canonical `RAC_DecisionOutcome` write and NEVER read any
 * path that production relies on. Every Prisma call here is invoked from a
 * try/catch + warn-log boundary in the service, so a failure can never break
 * the user-facing decision path.
 *
 * Why a direct `prisma.mindPolicy` write (not `MindPolicyService`): the
 * MindPolicy ledger row has additional NOT-NULL columns that the
 * `DecisionOutcome` data does not carry (`subject`, `candidates`, `calcSteps`,
 * `epsilon`, `utilitySuccess`, `utilityFail`, `fallbackActive`). They are
 * synthesized here with inert defaults that mark the row as ledger-mirror
 * provenance, mapping cleanly WITHOUT a schema migration. Going through
 * `MindPolicyService.choose`/`resolveOutcome` would additionally fire the
 * belief / global-prior / kloelMemory side effects, which is out of scope and
 * not byte-equivalent — so we deliberately call the table directly.
 *
 * `RAC_MindPolicy` has no unique constraint on `(workspaceId, outcomeKey)`
 * (only `id` is unique), so we mirror `MindPolicyService.persist`'s
 * find-then-create dedup instead of a Prisma `upsert`.
 *
 * @see backend/src/kloel/decision-outcome.service.ts
 * @see backend/src/kloel/mind/policy/mind-policy.helpers.ts (createPolicyRow)
 */
import { randomUUID } from 'node:crypto';
import type { Prisma } from '@prisma/client';
import type { PrismaService } from '../prisma/prisma.service';

/** Narrow Prisma surface this helper needs — only the mindPolicy delegate. */
export type MindPolicyDualWriteClient = Pick<PrismaService, 'mindPolicy'>;

/** Provenance tag stamped into the mirrored MindPolicy row's context/calcSteps. */
export const DECISION_LEDGER_MIRROR_SOURCE = 'decision_outcome_dualwrite' as const;

function inputJson(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

/** Minimal decision shape needed to mirror a recordDecision into MindPolicy. */
export interface DecisionLedgerMirrorInput {
  workspaceId: string;
  decisionType: string;
  chosenAction: string;
  baselineAction?: string | null;
  outcomeKey: string;
  contextSnapshot: Record<string, unknown>;
}

/**
 * Build the `data` payload for the mirrored `RAC_MindPolicy` create.
 *
 * Pure. Synthesizes the MindPolicy-only NOT-NULL columns with inert defaults:
 *   - `subject`        → `outcomeKey` (stable, deterministic; MindPolicy needs
 *                        a non-null subject and the outcomeKey is the natural
 *                        join key between the two ledgers);
 *   - `candidates`     → the [chosen, baseline] action set;
 *   - `calcSteps`      → provenance marker (no policy calc happened here);
 *   - `epsilon` / `utilitySuccess` / `utilityFail` → 0 (no policy math);
 *   - `fallbackActive` → false.
 * The mirror's `context` carries the original snapshot plus a source tag so the
 * row is auditably distinguishable from a real `MindPolicyService` decision.
 */
export function buildMirroredPolicyData(
  input: DecisionLedgerMirrorInput,
): Prisma.MindPolicyUncheckedCreateInput {
  const baseline = input.baselineAction ?? input.chosenAction;
  return {
    id: randomUUID(),
    workspaceId: input.workspaceId,
    subject: input.outcomeKey,
    decisionType: input.decisionType,
    context: inputJson({ ...input.contextSnapshot, source: DECISION_LEDGER_MIRROR_SOURCE }),
    candidates: inputJson(
      Array.from(new Set([input.chosenAction, baseline])).map((action) => ({ action })),
    ),
    chosen: input.chosenAction,
    baseline,
    outcomeKey: input.outcomeKey,
    calcSteps: inputJson({ source: DECISION_LEDGER_MIRROR_SOURCE }),
    epsilon: 0,
    utilitySuccess: 0,
    utilityFail: 0,
    fallbackActive: false,
  };
}

/**
 * Mirror a recorded decision into `RAC_MindPolicy`, deduping on
 * `(workspaceId, outcomeKey)` (find-then-create, matching
 * `MindPolicyService.persist`). No-op when a mirror row already exists.
 *
 * Best-effort: any rejection propagates to the caller, which swallows + warns.
 */
export async function mirrorDecisionToMindPolicy(
  prisma: MindPolicyDualWriteClient,
  input: DecisionLedgerMirrorInput,
): Promise<void> {
  const existing = await prisma.mindPolicy.findFirst({
    where: { workspaceId: input.workspaceId, outcomeKey: input.outcomeKey },
    select: { id: true },
  });
  if (existing) {
    return;
  }
  await prisma.mindPolicy.create({ data: buildMirroredPolicyData(input) });
}

/** Inputs for closing/resolving the mirrored MindPolicy row. */
export interface DecisionLedgerCloseMirrorInput {
  workspaceId: string;
  outcomeKey: string;
  outcome: number;
  baselineOutcome?: number;
}

/**
 * Resolve the mirrored open `RAC_MindPolicy` row(s) for an outcomeKey: stamp
 * `outcome`, `baselineOutcome`, and `resolvedAt`. Only touches still-open rows
 * (`resolvedAt: null`) so a re-close is idempotent.
 *
 * Best-effort: any rejection propagates to the caller, which swallows + warns.
 */
export async function resolveMirroredMindPolicy(
  prisma: MindPolicyDualWriteClient,
  input: DecisionLedgerCloseMirrorInput,
): Promise<void> {
  await prisma.mindPolicy.updateMany({
    where: {
      workspaceId: input.workspaceId,
      outcomeKey: input.outcomeKey,
      resolvedAt: null,
    },
    data: {
      outcome: input.outcome,
      baselineOutcome: input.baselineOutcome ?? null,
      resolvedAt: new Date(),
    },
  });
}
