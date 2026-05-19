import { Injectable, Optional } from '@nestjs/common';
import {
  IdentityAudience,
  IdentityProjectorService,
  isCompromisedProjection,
} from '../lineage/identity-projector.service';
import {
  ABI_VERSION,
  AbiBelief,
  AbiConsolidatedRef,
  AbiCurrentInput,
  AbiEpisodicRef,
  AbiPredictions,
  AbiPerceptionSnapshot,
  AbiPulseTruth,
  AbiSalientEvent,
  AbiTruthMode,
  AbiWorkingMemoryItem,
  CognitiveStateAbi,
} from './abi-schema';
import type { PulseTruthSnapshot } from './pulse-truth-snapshot.service';

/**
 * UTP-ABI-002 — Cognitive State ABI builder (shadow mode).
 *
 * Implements PCI.2 §5 (docs/contracts/pci/02-abi-schema.md).
 *
 * Composes the ABI payload from real cognitive substrate when available
 * (lineage today; PULSE/mind/wisdom/role come online in subsequent UTPs)
 * and provides honest empty/default sections for substrate not yet wired.
 *
 * "Shadow mode" means the builder runs alongside the legacy system-prompt
 * path without replacing it. UTPs ABI-005..009 own the actual cutover.
 *
 * The builder is PURE: same input -> same output. Side effects (logs,
 * metrics) happen elsewhere.
 */

export interface AbiBuildInput {
  readonly audience: IdentityAudience;
  readonly currentInput: AbiCurrentInput;
  readonly perceptionSnapshot: AbiPerceptionSnapshot;
  readonly truthModeOverride?: AbiTruthMode;
  readonly originAuthorization?: {
    readonly grantedAt: string;
    readonly grantedBy: string;
  };
  readonly firstWorkspaceActivatedAt?: string;
  readonly capabilityIds?: readonly string[];
  readonly now?: Date;
  /**
   * ABI 1.1.0 (additive, PCI §4 minor bump). OPTIONAL real cognitive
   * substrate hydrated by the caller from the live event/memory stores.
   * The builder stays PURE (pure function of input): when absent it
   * falls back to the historical empty defaults, so every existing
   * caller is forward-compatible and unchanged. This is the seam that
   * closes the perception→memory loop without breaking the frozen
   * schema or the UTP-ABI-002 purity invariant.
   */
  readonly cognitiveSubstrate?: {
    readonly recentSalientEvents?: readonly AbiSalientEvent[];
    readonly workingMemory?: readonly AbiWorkingMemoryItem[];
    readonly episodicRefs?: readonly AbiEpisodicRef[];
    readonly consolidatedRefs?: readonly AbiConsolidatedRef[];
    readonly beliefs?: readonly AbiBelief[];
    readonly predictions?: AbiPredictions;
  };
}

export type AbiBuildResult =
  | { readonly status: 'ok'; readonly abi: CognitiveStateAbi }
  | { readonly status: 'lineage_compromised'; readonly reason: string };

@Injectable()
export class AbiBuilderService {
  public constructor(
    private readonly projector: IdentityProjectorService,
    @Optional() private readonly pulseTruthSnapshot?: PulseTruthSnapshot,
  ) {}

  public async build(input: AbiBuildInput): Promise<AbiBuildResult> {
    const projectOpts: Parameters<IdentityProjectorService['project']>[0] = {
      audience: input.audience,
    };
    if (input.originAuthorization) {
      Object.assign(projectOpts, { originAuthorization: input.originAuthorization });
    }
    if (input.firstWorkspaceActivatedAt) {
      Object.assign(projectOpts, {
        firstWorkspaceActivatedAt: input.firstWorkspaceActivatedAt,
      });
    }
    if (input.capabilityIds) {
      Object.assign(projectOpts, { capabilityIds: input.capabilityIds });
    }
    if (input.now) {
      Object.assign(projectOpts, { now: input.now });
    }
    const projection = await this.projector.project(projectOpts);

    if (isCompromisedProjection(projection)) {
      return { status: 'lineage_compromised', reason: projection.reason };
    }

    const truthMode = input.truthModeOverride ?? 'observed';
    const measuredAt = (input.now ?? new Date()).toISOString();
    // Audience controls what humans see. lineage.capabilities and the ABI's
    // capability-registry section describe what the organism can actually
    // execute — independent of audience. Always derive from the input.
    const capabilityIds = input.capabilityIds ?? [];

    const abi: CognitiveStateAbi = {
      abiVersion: ABI_VERSION,
      lineage: {
        canonicalName: 'Kloel',
        genesisEventId: 'genesisEventId' in projection ? projection.genesisEventId : '',
        lineageStatus: 'intact',
        operationalAge: projection.operationalAge,
        capabilities: capabilityIds,
      },
      identityProjection: {
        audience: projection.audience,
        currentMaturity: 'developing',
        truthMode,
      },
      perception: {
        currentSnapshot: input.perceptionSnapshot,
        recentSalientEvents: input.cognitiveSubstrate?.recentSalientEvents ?? [],
      },
      beliefs: input.cognitiveSubstrate?.beliefs ?? [],
      predictions: input.cognitiveSubstrate?.predictions ?? { active: [], recentSurprises: [] },
      attention: { candidates: [] },
      memory: {
        workingMemory: input.cognitiveSubstrate?.workingMemory ?? [],
        episodicRefs: input.cognitiveSubstrate?.episodicRefs ?? [],
        consolidatedRefs: input.cognitiveSubstrate?.consolidatedRefs ?? [],
      },
      capabilities: {
        available: capabilityIds.map((capabilityId) => ({
          capabilityId,
          maturity: 'developing' as const,
          runtimeEvidencePct: 1,
        })),
        restricted: [],
      },
      valence: {
        recentTrace: [],
        aggregatedMood: {
          positive: 0,
          negative: 0,
          neutral: 1,
          ambiguous: 0,
          windowHours: 24,
        },
      },
      pulseTruth: this.buildPulseTruth(measuredAt),
      currentInput: input.currentInput,
    };

    return { status: 'ok', abi };
  }

  private buildPulseTruth(measuredAt: string): AbiPulseTruth {
    if (this.pulseTruthSnapshot) {
      return this.pulseTruthSnapshot.snapshot();
    }

    return {
      noOverclaimStatus: 'PASS',
      capabilityHealthScore: 0,
      gates: [],
      certificationVerdict: {
        verdict: 'INSUFFICIENT_EVIDENCE',
        score: 0,
        measuredAt,
      },
      overclaimRisk: 0,
    };
  }
}
