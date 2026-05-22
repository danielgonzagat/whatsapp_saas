import { Injectable } from '@nestjs/common';
import {
  GENESIS_EVENT,
  ORGANISM_CANONICAL_NAME,
} from './genesis-event';
import { LineageGuardService, LineageStatus } from './lineage-guard.service';

/**
 * UTP-LINEAGE-004 — Identity Projector with 4 audiences.
 *
 * Implements PCI.3 §6 (docs/contracts/pci/03-genesis-lineage.md).
 *
 * Audiences:
 *   - `public`     — only canonicalName + operational age. Default for any
 *                    commercial channel. NEVER carries etymology or origin.
 *   - `technical`  — canonicalName, genesisEventId, lineageStatus,
 *                    operationalAge, capabilities. NO Genesis payload.
 *   - `origin`     — full Genesis payload (etymology, origin, steward) on
 *                    explicit auditable request only.
 *   - `internal`   — everything `origin` has + ledger summary, for
 *                    debug/audit.
 *
 * When `lineageStatus` is `compromised`, projection is REFUSED (returns a
 * `compromised` projection that consumers must not use as identity).
 */

export type IdentityAudience = 'public' | 'technical' | 'origin' | 'internal';

export interface OperationalAge {
  readonly sinceGenesisDays: number;
  readonly sinceFirstWorkspaceDays: number;
}

export interface PublicProjection {
  readonly audience: 'public';
  readonly canonicalName: typeof ORGANISM_CANONICAL_NAME;
  readonly operationalAge: OperationalAge;
  readonly lineageStatus: LineageStatus;
  readonly truthMode: 'observed';
}

export interface TechnicalProjection {
  readonly audience: 'technical';
  readonly canonicalName: typeof ORGANISM_CANONICAL_NAME;
  readonly operationalAge: OperationalAge;
  readonly lineageStatus: LineageStatus;
  readonly genesisEventId: string;
  readonly tailSequenceNumber: number;
  readonly tailHash: string;
  readonly capabilityIds: readonly string[];
  readonly truthMode: 'observed';
}

export interface OriginProjection {
  readonly audience: 'origin';
  readonly canonicalName: typeof ORGANISM_CANONICAL_NAME;
  readonly operationalAge: OperationalAge;
  readonly lineageStatus: LineageStatus;
  readonly genesisEventId: string;
  readonly tailSequenceNumber: number;
  readonly tailHash: string;
  readonly capabilityIds: readonly string[];
  readonly etymology: typeof GENESIS_EVENT.payload.etymology;
  readonly origin: typeof GENESIS_EVENT.payload.origin;
  readonly steward: typeof GENESIS_EVENT.payload.steward;
  readonly truthMode: 'observed';
  readonly authorization: {
    readonly grantedAt: string;
    readonly grantedBy: string;
  };
}

export interface InternalProjection {
  readonly audience: 'internal';
  readonly canonicalName: typeof ORGANISM_CANONICAL_NAME;
  readonly operationalAge: OperationalAge;
  readonly lineageStatus: LineageStatus;
  readonly genesisEventId: string;
  readonly tailSequenceNumber: number;
  readonly tailHash: string;
  readonly capabilityIds: readonly string[];
  readonly etymology: typeof GENESIS_EVENT.payload.etymology;
  readonly origin: typeof GENESIS_EVENT.payload.origin;
  readonly steward: typeof GENESIS_EVENT.payload.steward;
  readonly entryCount: number;
  readonly truthMode: 'observed';
}

export interface CompromisedProjection {
  readonly audience: IdentityAudience;
  readonly status: 'compromised';
  readonly canonicalName: typeof ORGANISM_CANONICAL_NAME;
  readonly reason: string;
  readonly checkedAt: string;
}

export type IdentityProjection =
  | PublicProjection
  | TechnicalProjection
  | OriginProjection
  | InternalProjection
  | CompromisedProjection;

export interface ProjectOptions {
  readonly audience: IdentityAudience;
  /**
   * Required when audience === 'origin'. Records who explicitly requested
   * origin disclosure and when. The projection refuses without it.
   */
  readonly originAuthorization?: {
    readonly grantedAt: string;
    readonly grantedBy: string;
  };
  /**
   * Optional. When provided, used for `sinceFirstWorkspaceDays`. When
   * absent, defaults to 0 — interpreted as "no workspace activated yet".
   */
  readonly firstWorkspaceActivatedAt?: string;
  /**
   * Optional. Capability IDs in operational/productionReady. The projector
   * does not infer these — the consumer (capability-registry) provides.
   */
  readonly capabilityIds?: readonly string[];
  /**
   * Optional. Default = current Date. Used to compute operational age.
   */
  readonly now?: Date;
}

@Injectable()
export class IdentityProjectorService {
  public constructor(private readonly guard: LineageGuardService) {}

  public async project(opts: ProjectOptions): Promise<IdentityProjection> {
    const verdict = await this.guard.verify();

    if (verdict.status === 'compromised') {
      return {
        audience: opts.audience,
        status: 'compromised',
        canonicalName: ORGANISM_CANONICAL_NAME,
        reason: verdict.reason ?? 'lineage compromise',
        checkedAt: verdict.checkedAt,
      };
    }

    const now = opts.now ?? new Date();
    const operationalAge = this.computeOperationalAge(now, opts.firstWorkspaceActivatedAt);

    if (opts.audience === 'public') {
      return {
        audience: 'public',
        canonicalName: ORGANISM_CANONICAL_NAME,
        operationalAge,
        lineageStatus: 'intact',
        truthMode: 'observed',
      };
    }

    const tailHash = verdict.tailHash ?? '';
    const tailSequenceNumber = verdict.tailSequenceNumber;
    const capabilityIds = opts.capabilityIds ?? [];

    if (opts.audience === 'technical') {
      return {
        audience: 'technical',
        canonicalName: ORGANISM_CANONICAL_NAME,
        operationalAge,
        lineageStatus: 'intact',
        genesisEventId: GENESIS_EVENT.eventId,
        tailSequenceNumber,
        tailHash,
        capabilityIds,
        truthMode: 'observed',
      };
    }

    if (opts.audience === 'origin') {
      if (!opts.originAuthorization) {
        return {
          audience: 'origin',
          status: 'compromised',
          canonicalName: ORGANISM_CANONICAL_NAME,
          reason:
            'origin audience requires explicit auditable authorization (originAuthorization missing)',
          checkedAt: new Date().toISOString(),
        };
      }
      return {
        audience: 'origin',
        canonicalName: ORGANISM_CANONICAL_NAME,
        operationalAge,
        lineageStatus: 'intact',
        genesisEventId: GENESIS_EVENT.eventId,
        tailSequenceNumber,
        tailHash,
        capabilityIds,
        etymology: GENESIS_EVENT.payload.etymology,
        origin: GENESIS_EVENT.payload.origin,
        steward: GENESIS_EVENT.payload.steward,
        truthMode: 'observed',
        authorization: opts.originAuthorization,
      };
    }

    // internal
    return {
      audience: 'internal',
      canonicalName: ORGANISM_CANONICAL_NAME,
      operationalAge,
      lineageStatus: 'intact',
      genesisEventId: GENESIS_EVENT.eventId,
      tailSequenceNumber,
      tailHash,
      capabilityIds,
      etymology: GENESIS_EVENT.payload.etymology,
      origin: GENESIS_EVENT.payload.origin,
      steward: GENESIS_EVENT.payload.steward,
      entryCount: verdict.entryCount,
      truthMode: 'observed',
    };
  }

  private computeOperationalAge(now: Date, firstWorkspaceActivatedAt?: string): OperationalAge {
    const genesis = new Date(GENESIS_EVENT.timestamp);
    const sinceGenesisDays = Math.max(
      0,
      Math.floor((now.getTime() - genesis.getTime()) / (1000 * 60 * 60 * 24)),
    );
    let sinceFirstWorkspaceDays = 0;
    if (firstWorkspaceActivatedAt) {
      const firstWk = new Date(firstWorkspaceActivatedAt);
      sinceFirstWorkspaceDays = Math.max(
        0,
        Math.floor((now.getTime() - firstWk.getTime()) / (1000 * 60 * 60 * 24)),
      );
    }
    return { sinceGenesisDays, sinceFirstWorkspaceDays };
  }
}

/**
 * Type-guard helpers — useful for consumers that need to check the audience
 * shape without resorting to manual property tests.
 */
export function isPublicProjection(p: IdentityProjection): p is PublicProjection {
  return p.audience === 'public' && !('status' in p);
}

export function isTechnicalProjection(p: IdentityProjection): p is TechnicalProjection {
  return p.audience === 'technical' && !('status' in p);
}

export function isOriginProjection(p: IdentityProjection): p is OriginProjection {
  return p.audience === 'origin' && !('status' in p);
}

export function isInternalProjection(p: IdentityProjection): p is InternalProjection {
  return p.audience === 'internal' && !('status' in p);
}

export function isCompromisedProjection(
  p: IdentityProjection,
): p is CompromisedProjection {
  return 'status' in p && p.status === 'compromised';
}
