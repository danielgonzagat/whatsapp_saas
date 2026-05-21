import { Injectable } from '@nestjs/common';
import type {
  ConflictDetection,
  DeliveryChannel,
  OpportunityRanking,
  Role,
  SuggestionDelivery,
} from './ecosys.types';
import { EcosystemPrivacyGuardService } from './ecosystem-privacy.guard';

/**
 * UTP-ECOSYS-009 — Delivers a single ranked opportunity as a structured
 * suggestion to the appropriate role + channel. ALWAYS attaches a
 * disclosure when there is any commercial link Kloel↔party. ALWAYS
 * runs the privacy guard before composing the payload.
 */

export interface DeliveryRequest {
  readonly opportunity: OpportunityRanking;
  readonly recipientFingerprint: string;
  readonly recipientRole: Role;
  readonly channel: DeliveryChannel;
  readonly explanation: string;
  readonly disclosure?: string;
  readonly conflicts?: readonly ConflictDetection[];
}

export type DeliveryResult =
  | { readonly status: 'delivered'; readonly suggestion: SuggestionDelivery }
  | { readonly status: 'silenced'; readonly reason: string }
  | { readonly status: 'privacy_blocked'; readonly leaks: readonly string[] };

@Injectable()
export class SuggestionDeliveryService {
  public constructor(private readonly privacy: EcosystemPrivacyGuardService) {}

  public deliver(req: DeliveryRequest): DeliveryResult {
    const silencingConflict = (req.conflicts ?? []).find((c) => c.silenceRecommended);
    if (silencingConflict) {
      return {
        status: 'silenced',
        reason: silencingConflict.description,
      };
    }
    const draft: SuggestionDelivery = {
      suggestionId: `sug_${req.opportunity.opportunityId}_${req.recipientFingerprint}`,
      recipientFingerprint: req.recipientFingerprint,
      recipientRole: req.recipientRole,
      channel: req.channel,
      summary: req.opportunity.description,
      explanation: req.explanation,
      ...(req.disclosure ? { disclosure: req.disclosure } : {}),
      createdAt: new Date().toISOString(),
    };
    const verdict = this.privacy.scan(draft);
    if (verdict.verdict === 'FAIL') {
      return { status: 'privacy_blocked', leaks: verdict.leaksDetected };
    }
    return { status: 'delivered', suggestion: draft };
  }
}
