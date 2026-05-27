import { Injectable } from '@nestjs/common';
import { StructuredLogger } from '../../../logging/structured-logger';
import type { Prisma } from '@prisma/client';
import { createHash, randomUUID } from 'crypto';
import { PrismaService } from '../../../prisma/prisma.service';
import { BrainEventSpineService } from '../../brain-event-spine.service';

type ConceptRule = { concept: string; patterns: RegExp[] };

const RULES: ConceptRule[] = [
  { concept: 'price_objection', patterns: [/car[oa]\b/i, /pre[cç]o/i, /desconto/i] },
  { concept: 'trust_objection', patterns: [/confi/i, /garantia/i, /seguro/i, /golpe/i] },
  { concept: 'deadline_objection', patterns: [/prazo/i, /entrega/i, /demora/i, /quando chega/i] },
  { concept: 'competitor_comparison', patterns: [/concorrent/i, /vi no/i, /mais barato/i] },
  { concept: 'hot_lead', patterns: [/comprar/i, /fechar/i, /pix/i, /cart[aã]o/i] },
  { concept: 'reheatable_cold_lead', patterns: [/ainda tenho interesse/i, /voltei/i] },
  { concept: 'dead_lead', patterns: [/pare/i, /n[ãa]o quero/i, /remove/i, /cancelar mensagens/i] },
  { concept: 'imminent_purchase', patterns: [/manda o link/i, /como pago/i, /finalizar/i] },
  { concept: 'fatigue_risk', patterns: [/muita mensagem/i, /j[aá] falei/i, /de novo/i] },
  { concept: 'audio_preference', patterns: [/manda audio/i, /[áa]udio/i, /voz/i] },
  { concept: 'night_preference', patterns: [/noite/i, /20h/i, /21h/i, /depois do trabalho/i] },
  { concept: 'high_ticket_product', patterns: [/premium/i, /alto valor/i, /mentoria/i] },
  { concept: 'tight_margin_product', patterns: [/menor valor/i, /sem margem/i] },
];

function stableConceptKey(input: {
  concept: string;
  subject: string;
  text: string;
  workspaceId: string;
}): string {
  return createHash('sha256')
    .update(input.workspaceId)
    .update('\0')
    .update(input.subject)
    .update('\0')
    .update(input.concept)
    .update('\0')
    .update(input.text)
    .digest('hex')
    .slice(0, 24);
}

@Injectable()
export class MindConceptService {
  private readonly logger = StructuredLogger.from(MindConceptService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly events: BrainEventSpineService,
  ) {
    this.logger.debug?.(`MindConceptService initialized`);
  }

  async detect(input: {
    features?: Record<string, unknown>;
    occurredAt?: Date;
    subject: string;
    text: string;
    workspaceId: string;
  }) {
    const detections = RULES.flatMap((rule) => {
      const matched = rule.patterns.filter((pattern) => pattern.test(input.text));
      if (matched.length === 0) return [];
      return [
        {
          concept: rule.concept,
          confidence: Math.min(0.95, 0.55 + matched.length * 0.12),
          evidence: input.text.slice(0, 500),
        },
      ];
    });

    const rows = [];
    for (const detection of detections) {
      const row = await this.prisma.mindConceptDetection.create({
        data: {
          id: randomUUID(),
          workspaceId: input.workspaceId,
          subject: input.subject,
          concept: detection.concept,
          confidence: detection.confidence,
          evidence: detection.evidence,
          features: (input.features ?? {}) as Prisma.InputJsonValue,
          occurredAt: input.occurredAt ?? new Date(),
        },
      });
      rows.push(row);

      const conceptEventKey = [
        'concept',
        input.workspaceId,
        input.subject,
        detection.concept,
        stableConceptKey({
          workspaceId: input.workspaceId,
          subject: input.subject,
          concept: detection.concept,
          text: input.text,
        }),
      ].join(':');

      await this.events.recordCommercial({
        workspaceId: input.workspaceId,
        subject: input.subject,
        eventType: 'concept.detected',
        occurredAt: input.occurredAt ?? new Date(),
        idempotencyKey: conceptEventKey,
        payload: {
          concept: detection.concept,
          confidence: detection.confidence,
        },
      });
    }
    return rows;
  }

  async recent(workspaceId: string, hours = 24) {
    const since = new Date(Date.now() - hours * 3600 * 1000);
    return this.prisma.mindConceptDetection.findMany({
      where: { workspaceId, occurredAt: { gte: since } },
      orderBy: { occurredAt: 'desc' },
      take: 200,
    });
  }
}
