import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import { MindCaseMemoryService } from '../memory/mind-case-memory.service';
import { MindConceptService } from '../memory/mind-concepts.service';
import { toStableString } from '../policy/mind-decision-baselines';
import { MindPolicyService } from '../policy/mind-policy.service';
import { MindPredictorService } from '../inference/mind-predictor.service';
import { MindSurpriseService } from '../inference/mind-surprise.service';
import { PrismaService } from '../../../prisma/prisma.service';
import { randomUUID } from 'crypto';
import type { MindPerceptEvent } from '../../mind.types';
import {
  applySurprise,
  autopilotSuccessOutcome,
  buildCheckoutStartFeatures,
  buildMessageSentFeatures,
  classifyToolCategory,
  createEmptyResult,
  extractMessageReceivedText,
  isCheckoutClosedFailure,
  outcomeFromPayload,
  type MindEventProcessAccumulator,
  type MindEventProcessResult,
} from './mind-event-processor.service.helpers';

@Injectable()
export class MindEventProcessorService {
  private readonly logger = StructuredLogger.from(MindEventProcessorService.name);

  constructor(
    private readonly predictor: MindPredictorService,
    private readonly surprise: MindSurpriseService,
    private readonly policy: MindPolicyService,
    private readonly cases: MindCaseMemoryService,
    private readonly concepts: MindConceptService,
    private readonly prisma: PrismaService,
  ) {
    this.logger.debug?.(`MindEventProcessorService initialized`);
  }

  async process(event: MindPerceptEvent): Promise<MindEventProcessResult> {
    const result: MindEventProcessAccumulator = createEmptyResult();

    await this.processMessageSent(event, result);
    await this.processMessageReceived(event, result);
    await this.processCheckoutStarted(event, result);
    await this.processCheckoutClosed(event, result);
    await this.processExplicitCommercialOutcome(event, result);
    await this.processAutopilotOutcome(event, result);

    return result;
  }

  private async processMessageSent(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
  ): Promise<void> {
    if (event.kind === 'message.sent' && event.subject.startsWith('contact:')) {
      await this.predictor.predictReply(
        {
          workspaceId: event.workspaceId,
          subject: event.subject,
          features: buildMessageSentFeatures(event),
        },
        24 * 3600,
      );
      result.predicted += 1;
    }
  }

  private async processMessageReceived(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
  ): Promise<void> {
    if (
      (event.kind === 'message.received' || event.kind === 'message.replied') &&
      event.subject.startsWith('contact:')
    ) {
      const text = extractMessageReceivedText(event);
      if (text) {
        const features = { channel: event.payload.channel ?? 'unknown' };
        await this.concepts.detect({
          workspaceId: event.workspaceId,
          subject: event.subject,
          text,
          occurredAt: event.occurredAt,
          features,
        });
        await this.cases.recordCase({
          workspaceId: event.workspaceId,
          subject: event.subject,
          caseType: 'message.received',
          text,
          action: 'inbound',
          occurredAt: event.occurredAt,
          features,
        });
      }
      await this.addResolvedSurprise(
        result,
        this.surprise.resolveBinary(
          event.workspaceId,
          event.subject,
          'P(reply|template,hour,channel)',
          1,
        ),
      );
      result.resolved += await this.policy.resolveOpenForSubject({
        workspaceId: event.workspaceId,
        subject: event.subject,
        decisionType: 'followup_timing',
        outcome: 1,
      });
      await this.resolveWorkspacePolicies(
        event,
        result,
        ['audio_vs_text', 'message_format', 'tom', 'channel_choice'],
        1,
      );

      // CIA Gap 4 Phase 2 — delayed outcome confidence from message.received
      const contactId = event.subject.slice('contact:'.length);
      const confResult = await this.policy.confirmAutopilotOutcome({
        workspaceId: event.workspaceId,
        contactId,
      });
      result.resolved += confResult.confirmed + confResult.unanswered;
    }
  }

  private async processCheckoutStarted(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
  ): Promise<void> {
    if (event.kind === 'checkout.start' || event.kind === 'checkout.pending') {
      await this.predictor.predictConversion(
        {
          workspaceId: event.workspaceId,
          subject: event.subject,
          features: buildCheckoutStartFeatures(event),
        },
        48 * 3600,
      );
      result.predicted += 1;
    }
  }

  private async processCheckoutClosed(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
  ): Promise<void> {
    if (event.kind === 'checkout.paid' || event.kind === 'sale.completed') {
      await this.addResolvedSurprise(result, this.resolveConversion(event, 1));
      await this.resolveSubjectPolicies(event, result, ['cart_recovery'], 1);
      await this.resolveWorkspacePolicies(
        event,
        result,
        ['coupon_offer', 'product_offer', 'objection_response'],
        1,
      );
      return;
    }

    if (isCheckoutClosedFailure(event)) {
      await this.addResolvedSurprise(result, this.resolveConversion(event, 0));
      await this.resolveSubjectPolicies(event, result, ['cart_recovery'], 0);
      await this.resolveWorkspacePolicies(
        event,
        result,
        ['coupon_offer', 'product_offer', 'objection_response'],
        0,
      );
    }
  }

  private async processExplicitCommercialOutcome(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
  ): Promise<void> {
    if (event.kind === 'conversation.transferred') {
      await this.resolveWorkspacePolicies(
        event,
        result,
        ['human_transfer'],
        outcomeFromPayload(event),
      );
    }
    if (event.kind === 'campaign.converted') {
      await this.resolveWorkspacePolicies(
        event,
        result,
        ['broadcast_window'],
        outcomeFromPayload(event),
      );
    }
    if (event.kind === 'ad.metric.improved' || event.kind === 'ad.metric.worsened') {
      await this.resolveWorkspacePolicies(
        event,
        result,
        ['ad_alert_action'],
        event.kind === 'ad.metric.improved' ? 1 : 0,
      );
    }
  }

  private async processAutopilotOutcome(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
  ): Promise<void> {
    if (event.kind.startsWith('autopilot.')) {
      const intent = toStableString(event.payload.intent) || 'unknown';
      const action = toStableString(event.payload.action);

      // ── COGNITIVE BRIDGE: feed every tool execution into belief formation ──
      const toolCategory = classifyToolCategory(intent);
      if (toolCategory) {
        try {
          await this.prisma.mindBelief.upsert({
            where: {
              workspaceId_subject_predicate_context: {
                workspaceId: event.workspaceId,
                subject: 'workspace',
                predicate: `tool.${toolCategory}.used`,
                context: {},
              },
            },
            update: { samples: { increment: 1 }, mean: 1, updatedAt: new Date() },
            create: {
              id: randomUUID(),
              workspaceId: event.workspaceId,
              subject: 'workspace',
              predicate: `tool.${toolCategory}.used`,
              context: {},
              mean: 0.5,
              variance: 0.25,
              samples: 1,
              alpha: 1,
              beta: 1,
            },
          });
          result.beliefsUpdated += 1;
        } catch (err: unknown) {
          this.logger.warn(
            `belief upsert failed for ${toolCategory}: ${err instanceof Error ? err.message : String(err)}`,
          );
        }
      }

      const autopilotSuccess = autopilotSuccessOutcome(intent);
      if (autopilotSuccess) {
        const { outcome, predicate } = autopilotSuccess;
        const surprise = await this.surprise.resolveBinary(
          event.workspaceId,
          event.subject,
          predicate,
          outcome,
        );
        applySurprise(result, surprise);
        await this.resolvePolicies(event, result, event.subject, ['autopilot_action'], outcome);
        if (intent === 'lead_qualified') {
          await this.resolveWorkspacePolicies(event, result, ['human_transfer'], 1);
        }
      }
      if (intent === 'lead_lifecycle' && action === 'lead.qualified') {
        await this.resolveWorkspacePolicies(event, result, ['human_transfer'], 1);
      }
      if (intent === 'campaign_lifecycle' && action === 'campaign.converted') {
        await this.resolveWorkspacePolicies(
          event,
          result,
          ['broadcast_window', 'ad_alert_action'],
          1,
        );
      }
    }
  }

  private async resolveSubjectPolicies(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
    decisionTypes: string[],
    outcome: 0 | 1,
  ): Promise<void> {
    await this.resolvePolicies(event, result, event.subject, decisionTypes, outcome);
  }

  private async resolveWorkspacePolicies(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
    decisionTypes: string[],
    outcome: 0 | 1,
  ): Promise<void> {
    await this.resolvePolicies(
      event,
      result,
      `workspace:${event.workspaceId}`,
      decisionTypes,
      outcome,
    );
  }

  private async resolvePolicies(
    event: MindPerceptEvent,
    result: MindEventProcessAccumulator,
    subject: string,
    decisionTypes: string[],
    outcome: 0 | 1,
  ): Promise<void> {
    for (const decisionType of decisionTypes) {
      result.resolved += await this.policy.resolveOpenForSubject({
        workspaceId: event.workspaceId,
        subject,
        decisionType,
        outcome,
      });
    }
  }

  private async addResolvedSurprise(
    result: MindEventProcessAccumulator,
    surprisePromise: Promise<number>,
  ): Promise<void> {
    applySurprise(result, await surprisePromise);
  }

  private resolveConversion(event: MindPerceptEvent, outcome: 0 | 1): Promise<number> {
    return this.surprise.resolveBinary(
      event.workspaceId,
      event.subject,
      'P(conversion|segment,price_band,channel,hour)',
      outcome,
    );
  }
}
