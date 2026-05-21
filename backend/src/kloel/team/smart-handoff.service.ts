/**
 * UTP-TEAM-005 — Smart Handoff Service
 *
 * Packages full context for human takeover with zero information loss.
 * Composes PreCallContext, NextBestAction suggestions, and optionally
 * trust state and maturity stage into a single HandoffPackage.
 *
 * Injectable so consumers can optionally inject Insight or Maturity
 * services for enriched handoff packages.
 */

import { Injectable } from '@nestjs/common';
import { buildPreCallContext } from './pre-call-context.builder';
import { suggestNextBestActions } from './next-best-action.suggester';
import type {
  HandoffPackage,
  PreCallContextInput,
} from './team.types';

@Injectable()
export class SmartHandoffService {
  public buildPackage(input: {
    readonly leadId: string;
    readonly conversationId: string;
    readonly workspaceId: string;
    readonly events: PreCallContextInput['events'];
    readonly maturityStage?: string;
    readonly trustState?: Readonly<Record<string, unknown>>;
    readonly nowIso?: string;
  }): HandoffPackage {
    const ctxInput: PreCallContextInput = {
      leadId: input.leadId,
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
      events: input.events,
      ...(input.nowIso !== undefined ? { nowIso: input.nowIso } : {}),
    };

    const preCallContext = buildPreCallContext(ctxInput);

    const suggestInput = {
      context: preCallContext,
      ...(input.maturityStage !== undefined
        ? { maturityStage: input.maturityStage }
        : {}),
      ...(input.trustState !== undefined
        ? { trustState: input.trustState }
        : {}),
    };

    const suggestedActions =
      suggestNextBestActions(suggestInput);

    return {
      leadId: input.leadId,
      conversationId: input.conversationId,
      workspaceId: input.workspaceId,
      preCallContext,
      suggestedActions,
      ...(input.maturityStage !== undefined
        ? { maturityStage: input.maturityStage }
        : {}),
      ...(input.trustState !== undefined
        ? { trustState: input.trustState }
        : {}),
      packagedAt: input.nowIso ?? new Date().toISOString(),
    };
  }
}
