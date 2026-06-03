/**
 * Pure helpers extracted from KloelThinkerService for the ABI / handoff-gate
 * branch. Keeping these out of the service class makes the bounded-payload
 * math, env-flag parsing, error-extraction and log-payload shape unit-testable
 * without spinning up the full Nest container.
 *
 * The names mirror the inline blocks in `kloel-thinker.service.ts` so a reader
 * can grep `boundedAbi` / `HANDOFF_CONFIDENCE_GATE` and land on either side.
 */

import type { HandoffConfidenceSnapshot } from './handoff-confidence.helper';
import { AbiBuilderService } from './abi/abi-builder.service';
import { MindCapabilityExecutor } from './mind/coordination';
import { validateAbiPayload } from './abi/abi-validator';
import { computeHandoffConfidence, HANDOFF_THRESHOLD } from './handoff-confidence.helper';
import { emitCognitionAlias } from './event-taxonomy.canonical-aliases';
import { createKloelErrorEvent, type KloelStreamEvent } from './kloel-stream-events';
import { OPERATOR_CAPABILITIES } from './mind/coordination/mind-capabilities.const';
import { CANONICAL_FALLBACK_SYSTEM_PROMPT } from './kloel.prompts';

/**
 * Hard cap on the stringified ABI payload after array-bounding. Sized so the
 * full enriched ABI fits well inside the DeepSeek V4 Pro context budget; the
 * slice path is therefore a never-reached last resort.
 */
export const ABI_MAX_STRING_LENGTH = 24000;

/**
 * Max array length retained while serializing the ABI payload. We keep only
 * the head of any array so a long user prompt cannot be inflated by the state
 * payload (root cause of the long-message hang).
 */
export const ABI_ARRAY_CAP = 8;

/** JSON.stringify replacer that slices every array down to `ABI_ARRAY_CAP`. */
export function capAbiArraysReplacer(_key: string, value: unknown): unknown {
  return Array.isArray(value) ? value.slice(0, ABI_ARRAY_CAP) : value;
}

export interface BoundedAbiPayload {
  /** ABI with arrays capped at `ABI_ARRAY_CAP`. Safe to embed in a prompt. */
  boundedAbi: Record<string, unknown>;
  /** Length of the stringified bounded ABI (post-truncation if it ran). */
  abiStrLen: number;
  /** Whether the slice path actually fired (>= ABI_MAX_STRING_LENGTH). */
  truncated: boolean;
}

/**
 * Bound an arbitrary ABI payload so it fits cleanly inside a system prompt:
 * caps every array to 8 entries, JSON-stringifies, and finally slices the
 * string at {@link ABI_MAX_STRING_LENGTH} as a last resort.
 *
 * The function is intentionally pure — no logger, no env, no IO — so it can
 * be stress-tested without mocks. The service is responsible for deciding
 * whether to call it (flag-gated) and for handling failure modes around it.
 */
export function buildBoundedAbiPayload(abi: Record<string, unknown>): BoundedAbiPayload {
  const boundedAbi = JSON.parse(JSON.stringify(abi, capAbiArraysReplacer)) as Record<
    string,
    unknown
  >;
  let abiStr = JSON.stringify(boundedAbi);
  let truncated = false;
  if (abiStr.length > ABI_MAX_STRING_LENGTH) {
    abiStr = `${abiStr.slice(0, ABI_MAX_STRING_LENGTH)}…(state_truncated)`;
    truncated = true;
  }
  return { boundedAbi, abiStrLen: abiStr.length, truncated };
}

export interface HandoffGateFlags {
  /** Either gate is on → emit the snapshot log. */
  observe: boolean;
  /** Blocking gate is on → may short-circuit the stream with an escalation. */
  blocking: boolean;
}

/**
 * Read the two handoff-confidence env flags. Pure read of `process.env`
 * keeps the service free of env-string literals at call sites.
 */
export function readHandoffGateFlags(env: NodeJS.ProcessEnv = process.env): HandoffGateFlags {
  const enabled = env['HANDOFF_CONFIDENCE_GATE_ENABLED'] === 'true';
  const blocking = env['HANDOFF_CONFIDENCE_GATE_BLOCKING_ENABLED'] === 'true';
  return { observe: enabled || blocking, blocking };
}

/**
 * Decide whether the blocking handoff gate should fire for this snapshot.
 * Stays pure so we can fuzz composite scores against the threshold without
 * touching the streaming code.
 */
export function shouldEscalateForHandoff(
  snapshot: Pick<HandoffConfidenceSnapshot, 'wouldEscalateAtThreshold04'>,
  flags: Pick<HandoffGateFlags, 'blocking'>,
): boolean {
  return flags.blocking && snapshot.wouldEscalateAtThreshold04;
}

/**
 * Build the structured log payload for a handoff-confidence escalation. The
 * resulting object is what the service ships into `logger.warn` — having it
 * pure means the test can assert the exact keys/values that downstream
 * dashboards rely on.
 *
 * @deprecated The `context` field returned by this helper is the legacy
 *   `kloel.handoff.confidence.blocking` event name. The canonical name is
 *   `cognition.handoff.confidence.blocking`. During the migration window
 *   both names are dual-emitted via `emitCognitionAlias` — see
 *   `event-taxonomy.canonical-aliases.ts`. Once the grace window closes,
 *   the `context` field here will be flipped to the canonical name and this
 *   deprecation tag will be removed.
 */
export function buildHandoffEscalationLog(params: {
  snapshot: HandoffConfidenceSnapshot;
  workspaceId: string | undefined;
  threshold: number;
}): {
  context: string;
  workspaceId: string | undefined;
  composite: number;
  meanBeliefConfidence: number;
  capabilityHealth: number;
  overclaimRisk: number;
  beliefCount: number;
  threshold: number;
} {
  const { snapshot, workspaceId, threshold } = params;
  return {
    context: 'kloel.handoff.confidence.blocking',
    workspaceId,
    composite: snapshot.composite,
    meanBeliefConfidence: snapshot.meanBeliefConfidence,
    capabilityHealth: snapshot.capabilityHealth,
    overclaimRisk: snapshot.overclaimRisk,
    beliefCount: snapshot.beliefCount,
    threshold,
  };
}

/**
 * Normalize an unknown caught from the ABI build branch into a stable
 * message string. Mirrors the inline ladder that previously lived in the
 * service.
 */
export function extractAbiBuildExceptionMessage(error: unknown): string {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'unknown error';
}

/**
 * Format the initial ABI outcome label, mirroring the inline ternary that
 * decides whether the build was attempted / skipped / disabled. Keeps the
 * single source of truth for the `KLOEL_ABI_PATH` log line readable.
 */
export function initialAbiOutcomeLabel(params: {
  useAbi: boolean;
  hasAbiBuilder: boolean;
}): string {
  if (!params.useAbi) {
    return 'flag_off';
  }
  return params.hasAbiBuilder ? 'attempted' : 'no_abiBuilder';
}

/** Returned by {@link runAbiEnrichmentBranch}. */
export interface AbiEnrichmentResult {
  /** Whether the branch wrote a terminal event and closed the stream. */
  handled: boolean;
  /** Enriched cognitive state (bounded ABI payload), or undefined when not built. */
  prebuiltCognitiveState?: Record<string, unknown>;
  /** Final system prompt to use for the model call. */
  finalSystemPrompt: string;
  /** Final user message to use for the model call. */
  finalUserMessage: string;
}

/**
 * Run the ABI-enrichment branch of the think loop: build cognitive
 * substrate, construct + validate the conversational ABI, bound the
 * payload, run the handoff-confidence gate, and emit the KLOEL_ABI_PATH
 * runtime-truth log.
 *
 * When the blocking handoff gate fires, this function writes a terminal
 * error event and closes the stream, returning `{ handled: true }`.
 * Otherwise it returns the enriched state for the caller to continue.
 *
 * Extracted from `KloelThinkerService.think()` to keep the service under
 * 450 LOC.
 */
export async function runAbiEnrichmentBranch(deps: {
  abiBuilder?: AbiBuilderService;
  capabilityExecutor?: MindCapabilityExecutor;
  workspaceId: string | undefined;
  message: string;
  defaultSystemPrompt: string;
  logger: {
    warn: (msg: string, payload?: unknown) => void;
    log: (msg: string, payload?: unknown) => void;
  };
  safeWrite: (event: KloelStreamEvent) => void;
  streamWriter: { close(): void };
}): Promise<AbiEnrichmentResult> {
  const {
    abiBuilder,
    capabilityExecutor,
    workspaceId,
    message,
    defaultSystemPrompt,
    logger,
    safeWrite,
    streamWriter,
  } = deps;

  const useAbi = process.env['KLOEL_THINKER_USE_ABI'] !== 'off';
  let abiOutcome = initialAbiOutcomeLabel({ useAbi, hasAbiBuilder: !!abiBuilder });
  let substrateBuilt = false;

  if (useAbi && abiBuilder) {
    try {
      // Close the read-back loop: feed the REAL persisted cognitive
      // substrate (memory/beliefs/predictions/valence/readinessTruth from
      // the spine via #363) into the CONVERSATIONAL ABI — previously
      // only inspect_self got it, so the chat had no cross-session
      // memory. Safe: whole block is try/caught with legacy fallback.
      const chatSubstrate =
        workspaceId && capabilityExecutor
          ? await capabilityExecutor.buildCognitiveSubstrate(workspaceId)
          : undefined;
      substrateBuilt = !!chatSubstrate;

      const abiResult = await abiBuilder.build({
        audience: 'public',
        currentInput: {
          raw: message,
          channel: 'web',
          arrivalTimestamp: new Date().toISOString(),
        },
        perceptionSnapshot: {
          channel: 'web',
          ...(workspaceId ? { workspaceId } : {}),
        },
        // Real capability registry so the chat ABI is not hollow
        // (was the cause of Kloel reporting "ABI inteiramente vazio").
        capabilityIds: [...OPERATOR_CAPABILITIES],
        ...(chatSubstrate ? { cognitiveSubstrate: chatSubstrate } : {}),
      });

      if (abiResult.status !== 'ok') {
        abiOutcome = `build_failed:${abiResult.reason}`;
        logger.warn(`ABI build failed: ${abiResult.reason}, falling back to legacy thinker prompt`);
      } else {
        const validation = validateAbiPayload(abiResult.abi);

        if (validation.status === 'FAIL') {
          abiOutcome = `validation_failed:${JSON.stringify(validation.issues).slice(0, 240)}`;
          logger.warn(
            `ABI validation failed: ${JSON.stringify(validation.issues)}, falling back to legacy thinker prompt`,
          );
        } else {
          const { boundedAbi, abiStrLen } = buildBoundedAbiPayload(
            abiResult.abi as unknown as Record<string, unknown>,
          );
          abiOutcome = `success(abiLen=${abiStrLen})`;

          // Wave 10 Phase 2: handoff-confidence collection (flag-gated,
          // observe-only). Gate defaults OFF — no escalation, no
          // blocking, just a structured log for telemetry baselining.
          const handoffFlags = readHandoffGateFlags();
          if (handoffFlags.observe) {
            const snapshot = computeHandoffConfidence(
              abiResult.abi.beliefs,
              abiResult.abi.readinessTruth,
            );
            // Dual-emit: `kloel.handoff.confidence` is the legacy event
            // name; `cognition.handoff.confidence` is the canonical name
            // per docs/architecture/EVENT_TAXONOMY_MIGRATION.md. Both fire
            // until the 4-week grace window closes.
            emitCognitionAlias(
              (_eventName, payload) => {
                logger.log('Handoff confidence snapshot', payload);
              },
              'kloel.handoff.confidence',
              { context: 'kloel.handoff.confidence', ...snapshot },
            );

            if (shouldEscalateForHandoff(snapshot, handoffFlags)) {
              const escalationLog = buildHandoffEscalationLog({
                snapshot,
                workspaceId,
                threshold: HANDOFF_THRESHOLD,
              });
              // Dual-emit: legacy `kloel.handoff.confidence.blocking` +
              // canonical `cognition.handoff.confidence.blocking`.
              emitCognitionAlias(
                (_eventName, payload) => {
                  logger.warn('Handoff confidence gate: escalation to human', payload);
                },
                'kloel.handoff.confidence.blocking',
                escalationLog,
              );
              safeWrite(
                createKloelErrorEvent({
                  content:
                    'Estou analisando sua mensagem com mais cuidado. ' +
                    'Um atendente humano vai revisar e responder em breve.',
                  error: 'confidence_gate_escalation',
                  done: true,
                }),
              );
              streamWriter.close();
              logger.log(
                `KLOEL_ABI_PATH useAbi=${useAbi} substrateBuilt=${substrateBuilt} outcome=${abiOutcome}`,
              );
              return {
                handled: true,
                prebuiltCognitiveState: undefined,
                finalSystemPrompt: defaultSystemPrompt,
                finalUserMessage: message,
              };
            }
          }

          logger.log(
            `KLOEL_ABI_PATH useAbi=${useAbi} substrateBuilt=${substrateBuilt} outcome=${abiOutcome}`,
          );
          return {
            handled: false,
            prebuiltCognitiveState: boundedAbi,
            finalSystemPrompt: CANONICAL_FALLBACK_SYSTEM_PROMPT,
            finalUserMessage: message,
          };
        }
      }
    } catch (error: unknown) {
      const msg = extractAbiBuildExceptionMessage(error);
      abiOutcome = `exception:${msg}`;
      logger.warn(`ABI build exception: ${msg}, falling back to legacy thinker prompt`);
    }
  }

  // RUNTIME TRUTH: greppable, severity=log so it is never filtered.
  // Tells us definitively whether the chat actually uses the
  // cognitive substrate or silently falls back to the legacy prompt.
  logger.log(
    `KLOEL_ABI_PATH useAbi=${useAbi} substrateBuilt=${substrateBuilt} outcome=${abiOutcome}`,
  );
  return {
    handled: false,
    prebuiltCognitiveState: undefined,
    finalSystemPrompt: defaultSystemPrompt,
    finalUserMessage: message,
  };
}
