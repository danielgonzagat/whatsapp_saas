import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';
import { buildFallbackAnalysis, normalizeAnalysis } from './__companions__/neuro-crm-analysis';
import {
  type AnalysisContact,
  type AnalysisResult,
  type RawAnalysis,
} from './__companions__/neuro-crm-analysis.shared';

interface ClusterPoint {
  contact: {
    id: string;
    name: string | null;
    phone: string;
    leadScore: number;
    updatedAt: Date;
  };
  x: number;
  y: number;
}

/** Neuro crm service. */
@Injectable()
export class NeuroCrmService {
  private readonly logger = new Logger(NeuroCrmService.name);
  private readonly openai: OpenAI | null;

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
    private readonly planLimits: PlanLimitsService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  /**
   * Sugere próxima melhor ação com base em score, sentimento e recência.
   */
  async nextBestAction(workspaceId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: {
        leadScore: true,
        sentiment: true,
        purchaseProbability: true,
        updatedAt: true,
        messages: { take: 3, orderBy: { createdAt: 'desc' } },
      },
    });
    if (!contact) {
      throw new NotFoundException('Contato não encontrado');
    }

    const lastMsg = contact.messages[0];
    const hoursSince = lastMsg ? (Date.now() - lastMsg.createdAt.getTime()) / 3600000 : 999;

    let action = 'FOLLOW_UP_SOFT';
    let reason = 'contato sem atividade recente';

    if (
      contact.leadScore > 70 ||
      contact.purchaseProbability === 'HIGH' ||
      contact.purchaseProbability === 'VERY_HIGH'
    ) {
      action = hoursSince > 12 ? 'CLOSE_NOW' : 'CTA_PRECO';
      reason = 'lead quente';
    } else if (contact.sentiment === 'NEGATIVE') {
      action = 'TRATAR_OBJECAO';
      reason = 'sentimento negativo';
    } else if (hoursSince > 48) {
      action = 'REATIVAR';
      reason = 'silêncio longo';
    }

    return { action, reason, lastMessageAtHours: Math.round(hoursSince) };
  }

  /**
   * Clusterização simples (k-means 3 clusters) usando leadScore e recência.
   */
  async clusterLeads(workspaceId: string) {
    const contacts = await this.prisma.contact.findMany({
      take: 500,
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        phone: true,
        leadScore: true,
        updatedAt: true,
      },
    });
    const points: ClusterPoint[] = contacts.map((c) => ({
      contact: {
        ...c,
        leadScore: c.leadScore ?? 0,
      },
      x: c.leadScore ?? 0,
      y: (Date.now() - c.updatedAt.getTime()) / 3600000,
    }));

    const k = Math.min(3, Math.max(1, points.length));
    let centroids = points.slice(0, k).map((p) => ({ x: p.x, y: p.y }));
    for (let iter = 0; iter < 5; iter++) {
      const buckets: ClusterPoint[][] = Array.from({ length: k }, () => []);
      for (const p of points) {
        let best = 0;
        let bestDist = Number.POSITIVE_INFINITY;
        centroids.forEach((c, idx) => {
          const d = Math.hypot(p.x - c.x, p.y - c.y);
          if (d < bestDist) {
            bestDist = d;
            best = idx;
          }
        });
        buckets[best].push(p);
      }
      centroids = buckets.map((bucket, idx) => {
        if (!bucket.length) {
          return centroids[idx];
        }
        return {
          x: bucket.reduce((a: number, b: ClusterPoint) => a + b.x, 0) / bucket.length,
          y: bucket.reduce((a: number, b: ClusterPoint) => a + b.y, 0) / bucket.length,
        };
      });
    }

    const clusters = points.map((p) => {
      let best = 0;
      let bestDist = Number.POSITIVE_INFINITY;
      centroids.forEach((c, idx) => {
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (d < bestDist) {
          bestDist = d;
          best = idx;
        }
      });
      return { cluster: best, contact: p.contact };
    });

    return { centroids, clusters };
  }

  /**
   * Simulador de conversa (treino) usando histórico e objetivo.
   */
  async simulateConversation(input: {
    workspaceId: string;
    persona: string;
    scenario: string;
    goal: string;
  }) {
    if (!this.openai) {
      return { transcript: [], unavailable: true, reason: 'OPENAI_API_KEY_NOT_CONFIGURED' };
    }

    const prompt = `
Persona: ${input.persona}
Cenário: ${input.scenario}
Objetivo: ${input.goal}
Simule um diálogo de 6 turnos Lead/Agente com foco em conversão.`;

    await this.planLimits.ensureTokenBudget(input.workspaceId);
    const completion = await chatCompletionWithRetry(
      this.openai,
      {
        model: resolveBackendOpenAIModel('writer', this.config),
        messages: [{ role: 'user', content: prompt }],
      },
      { maxRetries: 3 },
    );
    await this.planLimits
      .trackAiUsage(input.workspaceId, completion?.usage?.total_tokens ?? 500)
      .catch(() => {});
    const transcript = completion.choices[0]?.message?.content || '';
    return { transcript };
  }

  /** Analyze contact. */
  async analyzeContact(workspaceId: string, contactId: string): Promise<AnalysisResult> {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      include: {
        messages: {
          take: 20,
          orderBy: { createdAt: 'desc' },
          select: {
            direction: true,
            content: true,
            createdAt: true,
          },
        },
        deals: true,
      },
    });

    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    const analysisContact: AnalysisContact = {
      name: contact.name,
      phone: contact.phone,
      leadScore: contact.leadScore,
      sentiment: contact.sentiment,
      messages: contact.messages.map((m) => ({
        direction: m.direction,
        content: m.content,
        createdAt: m.createdAt,
      })),
    };
    const history = analysisContact.messages
      .slice()
      .reverse()
      .map((message) => `[${message.direction}] ${message.content}`)
      .join('\n');

    const result = await this.runAiAnalysis(
      contactId,
      analysisContact,
      workspaceId,
      history,
      contact.customFields,
    );
    await this.createInsightIfSignificant(contactId, workspaceId, analysisContact, result);
    return result;
  }

  private async runAiAnalysis(
    contactId: string,
    contact: AnalysisContact,
    workspaceId: string,
    history: string,
    currentCustomFields: Prisma.JsonValue | null | undefined,
  ): Promise<AnalysisResult> {
    if (!this.openai) {
      const fallback = buildFallbackAnalysis(contact, history);
      await this.persistAnalysis(workspaceId, contactId, currentCustomFields, fallback);
      return fallback;
    }

    const prompt = `Analyze this WhatsApp conversation for a CRM system.

Workspace: ${workspaceId}
Contact: ${contact.name || contact.phone}
History:
${history || '[no_message_history]'}

Return strictly JSON with:
- leadScore: integer 0-100
- purchaseProbability: "LOW" | "MEDIUM" | "HIGH" | "VERY_HIGH"
- purchaseProbabilityScore: number 0-1
- intent: "BUY" | "SUPPORT" | "COMPLAINT" | "INFO" | "COLD"
- sentiment: "POSITIVE" | "NEUTRAL" | "NEGATIVE"
- summary: short CRM summary
- nextBestAction: what the seller should do next
- cluster: "VIP" | "Warm" | "Cold" | "Lost"
- reasons: array of short reasons supporting the score`;

    try {
      await this.planLimits.ensureTokenBudget(workspaceId);
      const completion = await chatCompletionWithRetry(
        this.openai,
        {
          model: resolveBackendOpenAIModel('brain', this.config),
          messages: [
            {
              role: 'system',
              content: 'You are a NeuroCRM engine. Output strictly JSON.',
            },
            { role: 'user', content: prompt },
          ],
          response_format: { type: 'json_object' },
        },
        { maxRetries: 3 },
      );
      await this.planLimits
        .trackAiUsage(workspaceId, completion?.usage?.total_tokens ?? 500)
        .catch(() => {});

      const rawResult = JSON.parse(completion.choices[0]?.message?.content || '{}') as RawAnalysis;
      const result = normalizeAnalysis(rawResult, contact, history);

      await this.persistAnalysis(workspaceId, contactId, currentCustomFields, result);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      this.logger.error(`NeuroCRM analysis failed: ${message}`);
      const fallback = buildFallbackAnalysis(contact, history);
      await this.persistAnalysis(workspaceId, contactId, currentCustomFields, fallback);
      return fallback;
    }
  }

  // PULSE_OK: workspaceId validated by caller guard; updateMany scoped to workspaceId + contactId
  private async persistAnalysis(
    workspaceId: string,
    contactId: string,
    currentCustomFields: Prisma.JsonValue | null | undefined,
    result: {
      leadScore: number;
      purchaseProbability: string;
      purchaseProbabilityScore: number;
      sentiment: string;
      intent: string;
      summary: string;
      nextBestAction: string;
      cluster?: string | null;
      reasons?: string[];
    },
  ) {
    const customFields: Prisma.JsonObject =
      currentCustomFields &&
      typeof currentCustomFields === 'object' &&
      !Array.isArray(currentCustomFields)
        ? currentCustomFields
        : {};

    await this.prisma.contact.updateMany({
      where: { id: contactId, workspaceId },
      data: {
        leadScore: result.leadScore,
        sentiment: result.sentiment,
        purchaseProbability: result.purchaseProbability,
        aiSummary: result.summary,
        nextBestAction: result.nextBestAction,
        customFields: {
          ...customFields,
          purchaseProbabilityScore: result.purchaseProbabilityScore,
          probabilityReasons: result.reasons || [],
          intent: result.intent,
          cluster: result.cluster || null,
          lastNeuroCrmAnalysisAt: new Date().toISOString(),
        } satisfies Prisma.InputJsonObject,
      },
    });
  }

  // ── Contact Insights ──

  async listInsights(contactId: string, workspaceId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true },
    });
    if (!contact) {
      return [];
    }

    return this.prisma.contactInsight.findMany({
      where: { contactId },
      select: {
        id: true,
        contactId: true,
        type: true,
        description: true,
        scoreChange: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 50,
    });
  }

  /** Create insight.
   * PULSE:OK — ContactInsight inherits workspace ownership transitively
   * through Contact.workspaceId. Ownership is verified by the contact
   * lookup below before the insight is created.
   */
  async createInsight(
    contactId: string,
    workspaceId: string,
    type: string,
    description: string,
    scoreChange = 0,
  ) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      select: { id: true },
    });
    if (!contact) {
      throw new NotFoundException('Contact not found');
    }

    const contactInsight = this.prisma.contactInsight;
    if (!contactInsight || typeof contactInsight.create !== 'function') {
      return null;
    }

    return contactInsight.create({
      data: { contactId, type, description, scoreChange },
    });
  }

  private async createInsightIfSignificant(
    contactId: string,
    workspaceId: string,
    contact: AnalysisContact,
    result: AnalysisResult,
  ) {
    const oldSentiment = contact.sentiment || 'NEUTRAL';
    if (oldSentiment !== result.sentiment) {
      const description =
        result.sentiment === 'POSITIVE'
          ? `Sentimento melhorou de ${oldSentiment} para POSITIVE`
          : result.sentiment === 'NEGATIVE'
            ? `Sentimento piorou de ${oldSentiment} para NEGATIVE`
            : `Sentimento neutralizou para ${result.sentiment}`;
      await this.createInsight(
        contactId,
        workspaceId,
        'SENTIMENT_CHANGE',
        description,
        result.sentiment === 'POSITIVE' ? 5 : result.sentiment === 'NEGATIVE' ? -5 : 0,
      );
    }
  }
}
