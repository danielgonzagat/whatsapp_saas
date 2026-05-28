import { Injectable } from '@nestjs/common';
import type { AbiWorkspaceLocalProfile } from '../abi/abi-schema';
import type { SpineEventRef } from '../mind/mind.types';
import {
  deriveCustomer,
  deriveDecisionPatterns,
  deriveLanguage,
  deriveOperational,
  deriveProduct,
  deriveTemporal,
} from './local-identity.service.helpers';
import { VOLUME_THRESHOLD } from './local-identity.types';

@Injectable()
export class LocalIdentityService {
  private deriveStableAt(events: readonly SpineEventRef[]): string {
    let maxMs = 0;
    for (const e of events) {
      const t = Date.parse(e.occurredAt);
      if (Number.isFinite(t) && t > maxMs) {
        maxMs = t;
      }
    }
    if (maxMs === 0) {
      return new Date().toISOString();
    }
    return new Date(maxMs).toISOString();
  }

  public deriveProfile(
    workspaceId: string,
    allEvents: readonly SpineEventRef[],
    opts: { readonly nowIso?: string } = {},
  ): AbiWorkspaceLocalProfile | undefined {
    const events = allEvents.filter((e) => e.workspaceId === workspaceId);

    if (events.length < VOLUME_THRESHOLD) {
      return undefined;
    }

    const operational = deriveOperational(events);
    const language = deriveLanguage(events);
    const product = deriveProduct(events);
    const customer = deriveCustomer(events);
    const temporal = deriveTemporal(events);
    const decisionPatterns = deriveDecisionPatterns(events);

    return {
      workspaceId,
      operational: {
        typicalHours: operational.typicalHours,
        typicalEntityTypes: operational.typicalEntityTypes,
        eventCount: operational.eventCount,
      },
      language: {
        tone: language.tone,
        vocabulary: language.vocabulary,
      },
      product: {
        catalog: product.catalog,
      },
      customer: {
        typicalProfile: {
          leadCount: customer.leadCount,
          conversionCount: customer.conversionCount,
          conversionRatio: customer.conversionRatio,
          commonStages: customer.commonStages,
        },
      },
      temporal: {
        peakHours: temporal.peakHours,
        typicalCycleHours: temporal.typicalCycleHours,
      },
      decisionPatterns: {
        typicalNextSteps: decisionPatterns.typicalNextSteps,
        typicalEscalations: decisionPatterns.typicalEscalations,
      },
      derivedFromEventsCount: events.length,
      derivedAt: opts.nowIso ?? this.deriveStableAt(events),
    };
  }
}
