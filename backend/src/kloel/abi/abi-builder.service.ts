import { Injectable, Optional } from '@nestjs/common';
import {
  IdentityAudience,
  IdentityProjectorService,
  isCompromisedProjection,
} from '../lineage/identity-projector.service';
import {
  ABI_VERSION,
  AbiCurrentInput,
  AbiPerceptionSnapshot,
  AbiPulseTruth,
  AbiTruthMode,
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
        genesisEventId:
          'genesisEventId' in projection ? projection.genesisEventId : '',
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
        recentSalientEvents: [],
      },
      beliefs: [],
      predictions: { active: [], recentSurprises: [] },
      attention: { candidates: [] },
      memory: {
        workingMemory: [],
        episodicRefs: [],
        consolidatedRefs: [],
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
