/**
 * Cognitive-state helpers extracted from kloel-reply-engine.service.ts to keep
 * the service file under the architecture gate's max_touched LOC ceiling.
 *
 * Centralizes:
 *   - buildKloelMindSignalsDeps: conditional mind-signals deps spread (matches
 *     conversational-onboarding.service for parity);
 *   - readAbiSnapshotCache / writeAbiSnapshotCache: 60s TTL kloelMemory cache;
 *   - buildKloelAbiCognitiveState: orchestrates ABI build + validation +
 *     mindSignals + snapshot caching.
 *
 * All cache reads/writes are best-effort — failures are warn-logged and never
 * thrown to the caller.
 */
import type { PrismaService } from '../prisma/prisma.service';
import type { AbiBuilderService } from './abi/abi-builder.service';
import { validateAbiPayload } from './abi/abi-validator';
import { buildMindSignals, type BuildMindSignalsDeps } from './mind/build-mind-signals.helper';
import type { AttentionService } from './mind/attention.service';
import type { ValenceAggregatorService } from './mind/valence-aggregator.service';
import type { MindBeliefService } from './mind/inference/mind-belief.service';
import type { MindConceptService } from './mind/memory/mind-concepts.service';
import type { MindCaseMemoryService } from './mind/memory/mind-case-memory.service';
import type { MindGlobalPriorService } from './mind/memory/mind-global-prior.service';
import type { MindPredictionService } from './mind/mind-prediction.service';
import type { SelfHealthService } from './self-awareness/self-health.service';
import type { SelfGapsService } from './self-awareness/self-gaps.service';
import type { RiskClassService } from './risk-class/risk-class.service';
import type { MindAutonomyCoordinator } from './mind/coordination/mind-autonomy-coordinator.service';

interface CognitiveStateLogger {
  warn: (event: string, ctx?: Record<string, unknown>) => void;
}

interface KloelMindServices {
  attentionService?: AttentionService;
  valenceAggregatorService?: ValenceAggregatorService;
  mindBeliefService?: MindBeliefService;
  mindConceptService?: MindConceptService;
  mindPredictionService?: MindPredictionService;
  selfHealthService?: SelfHealthService;
  selfGapsService?: SelfGapsService;
  riskClassService?: RiskClassService;
  mindVerbalizerService?: { narrate?: (workspaceId: string) => Promise<string> };
  mindAutonomyCoordinator?: MindAutonomyCoordinator;
  mindBanditService?: {
    selectArm?: (
      workspaceId: string,
      decisionType: string,
    ) => Promise<{ arm: string; confidence: number; rationale?: string } | null>;
  };
  mindCaseMemoryService?: MindCaseMemoryService;
  mindGlobalPriorService?: MindGlobalPriorService;
  mindPerceptionService?: {
    perceive?: (ctx: { source: string; channel: string; raw: string; workspaceId: string }) => {
      subject: string;
      intent: string;
      salience: number;
      semanticContext: Record<string, unknown>;
    };
  };
  vectorService?: {
    similaritySearch: (
      workspaceId: string,
      query: string,
      k?: number,
    ) => Promise<Array<{ text: string; score: number }>>;
  };
}

export const ABI_SNAPSHOT_KEY = 'abi_snapshot_cache';
export const ABI_SNAPSHOT_TTL_MS = 60_000;
export const ABI_SNAPSHOT_MAX_BYTES = 16384;

/** Build a BuildMindSignalsDeps spread that includes only services that are defined. */
export function buildKloelMindSignalsDeps(
  prisma: PrismaService,
  logger: { warn: (...args: unknown[]) => void },
  services: KloelMindServices,
): BuildMindSignalsDeps {
  return {
    prisma,
    logger,
    ...(services.attentionService !== undefined
      ? { attentionService: services.attentionService }
      : {}),
    ...(services.valenceAggregatorService !== undefined
      ? { valenceAggregatorService: services.valenceAggregatorService }
      : {}),
    ...(services.mindBeliefService !== undefined
      ? { mindBeliefService: services.mindBeliefService }
      : {}),
    ...(services.mindConceptService !== undefined
      ? { mindConceptService: services.mindConceptService }
      : {}),
    ...(services.selfHealthService !== undefined
      ? { selfHealthService: services.selfHealthService }
      : {}),
    ...(services.selfGapsService !== undefined
      ? { selfGapsService: services.selfGapsService }
      : {}),
    ...(services.riskClassService !== undefined
      ? { riskClassService: services.riskClassService }
      : {}),
    ...(services.mindPredictionService !== undefined
      ? { mindPredictionService: services.mindPredictionService }
      : {}),
    ...(services.mindVerbalizerService !== undefined
      ? { mindVerbalizerService: services.mindVerbalizerService }
      : {}),
    ...(services.mindBanditService !== undefined
      ? { mindBanditService: services.mindBanditService }
      : {}),
    ...(services.mindCaseMemoryService !== undefined
      ? { mindCaseMemoryService: services.mindCaseMemoryService }
      : {}),
    ...(services.mindGlobalPriorService !== undefined
      ? { mindGlobalPriorService: services.mindGlobalPriorService }
      : {}),
    ...(services.mindPerceptionService !== undefined
      ? { mindPerceptionService: services.mindPerceptionService }
      : {}),
    ...(services.vectorService !== undefined
      ? { vectorService: services.vectorService }
      : {}),
  };
}

/** Return cached cognitiveState if found within ABI_SNAPSHOT_TTL_MS, else null. */
export async function readAbiSnapshotCache(
  prisma: PrismaService,
  logger: CognitiveStateLogger,
  workspaceId: string,
): Promise<Record<string, unknown> | null> {
  try {
    const cached = await prisma.kloelMemory.findUnique({
      where: { workspaceId_key: { workspaceId, key: ABI_SNAPSHOT_KEY } },
    });
    if (cached?.content && cached.updatedAt) {
      const ageMs = Date.now() - cached.updatedAt.getTime();
      if (ageMs < ABI_SNAPSHOT_TTL_MS) {
        return JSON.parse(cached.content) as Record<string, unknown>;
      }
    }
  } catch (error: unknown) {
    logger.warn('kloel_abi_snapshot_cache_skipped', {
      reason: error instanceof Error ? error.message : 'unknown error',
    });
  }
  return null;
}

/** Persist cognitiveState as a fresh 60s TTL snapshot. Oversized payloads are skipped. */
export async function writeAbiSnapshotCache(
  prisma: PrismaService,
  logger: CognitiveStateLogger,
  workspaceId: string,
  cognitiveState: Record<string, unknown>,
): Promise<void> {
  try {
    const serialized = JSON.stringify(cognitiveState);
    if (serialized.length > ABI_SNAPSHOT_MAX_BYTES) {
      logger.warn('kloel_abi_snapshot_oversized', {
        size: serialized.length,
        workspaceId,
      });
      return;
    }
    await prisma.kloelMemory.upsert({
      where: {
        workspaceId_key: { workspaceId, key: ABI_SNAPSHOT_KEY },
      },
      update: {
        content: serialized,
        category: 'abi_snapshot',
        value: {},
        updatedAt: new Date(),
      },
      create: {
        workspaceId,
        key: ABI_SNAPSHOT_KEY,
        content: serialized,
        category: 'abi_snapshot',
        value: {},
      },
    });
  } catch (error: unknown) {
    logger.warn('kloel_abi_snapshot_cache_skipped', {
      reason: error instanceof Error ? error.message : 'unknown error',
    });
  }
}

/**
 * Build the cognitiveState block used in buildChatModelMessages.
 *
 * Pipeline:
 *   1. Check the 60s ABI snapshot cache. If fresh, return it as-is.
 *   2. Otherwise, attach mindSignals (attention/valence/beliefs/concepts/selfModel/riskClass).
 *   3. Build ABI via AbiBuilderService when present + validate; fall back to structured reply.
 *   4. Persist the new cognitiveState as a snapshot for the next call.
 */
export async function buildKloelAbiCognitiveState(
  deps: {
    prisma: PrismaService;
    logger: CognitiveStateLogger;
    abiBuilder?: AbiBuilderService;
    services: KloelMindServices;
  },
  params: {
    workspaceId?: string | null;
    userMessage: string;
    prebuiltCognitiveState?: Record<string, unknown>;
  },
  currentInput: { raw: string; channel: string; arrivalTimestamp: string },
): Promise<Record<string, unknown>> {
  let cognitiveState: Record<string, unknown> = {
    abiStatus: deps.abiBuilder ? 'unavailable_or_invalid' : 'builder_not_injected',
    audience: 'public',
    perceptionSnapshot: { channel: 'web' },
  };

  if (params.workspaceId) {
    const cached = await readAbiSnapshotCache(deps.prisma, deps.logger, params.workspaceId);
    if (cached) {
      return cached;
    }
  }

  // Mind signals — wire attention, valence, beliefs, concepts via shared helper (PI-k4/K5-A).
  const mindDeps = buildKloelMindSignalsDeps(
    deps.prisma,
    deps.logger as { warn: (...args: unknown[]) => void },
    deps.services,
  );
  cognitiveState.mindSignals = await buildMindSignals(
    mindDeps,
    params.workspaceId ?? '',
    params.userMessage,
  );

  // Autonomy proposals — fire-and-forget; never block reply (PI-K13-D).
  if (deps.services.mindAutonomyCoordinator && params.workspaceId) {
    try {
      const proposals = await deps.services.mindAutonomyCoordinator.listPendingProposals(
        params.workspaceId,
        3,
      );
      cognitiveState.autonomyProposals = proposals;
    } catch (error: unknown) {
      deps.logger.warn('kloel_autonomy_proposals_skipped', {
        reason: error instanceof Error ? error.message : 'unknown error',
        workspaceId: params.workspaceId,
      });
    }
  }

  if (deps.abiBuilder) {
    if (params.prebuiltCognitiveState) {
      cognitiveState = params.prebuiltCognitiveState;
    } else {
      try {
        const abiResult = await deps.abiBuilder.build({
          audience: 'public',
          currentInput,
          perceptionSnapshot: { channel: 'web' },
        });

        if (abiResult.status !== 'ok') {
          deps.logger.warn(
            `ABI build failed: ${abiResult.reason}, using structured reply fallback`,
            {
              tag: 'kloel_abi_degraded',
              builder_present: true,
              build_status: abiResult.status,
              validation_issues: [] as string[],
              exception_message: null,
              workspaceId: params.workspaceId ?? null,
            },
          );
        } else {
          const validation = validateAbiPayload(abiResult.abi);

          if (validation.status === 'FAIL') {
            deps.logger.warn(
              `ABI validation failed: ${JSON.stringify(validation.issues)}, using structured reply fallback`,
              {
                tag: 'kloel_abi_degraded',
                builder_present: true,
                build_status: 'ok',
                validation_issues: validation.issues
                  .slice(0, 3)
                  .map((i) => `${i.code}: ${i.message}`),
                exception_message: null,
                workspaceId: params.workspaceId ?? null,
              },
            );
          } else {
            cognitiveState = { ...abiResult.abi };
          }
        }
      } catch (error: unknown) {
        const msg =
          error instanceof Error
            ? error.message
            : typeof error === 'string'
              ? error
              : 'unknown error';
        deps.logger.warn(`ABI build exception: ${msg}, using structured reply fallback`, {
          tag: 'kloel_abi_degraded',
          builder_present: true,
          build_status: null,
          validation_issues: [] as string[],
          exception_message: msg,
          workspaceId: params.workspaceId ?? null,
        });
      }
    }
  }

  if (params.workspaceId) {
    await writeAbiSnapshotCache(deps.prisma, deps.logger, params.workspaceId, cognitiveState);
  }

  return cognitiveState;
}
