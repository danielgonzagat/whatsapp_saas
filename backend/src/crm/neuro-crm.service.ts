import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { PrismaService } from '../prisma/prisma.service';

const PRECO_PRE_O_VALOR_QUANT_RE = /(preco|preço|valor|quanto|pix|boleto|comprar|fechar|pagar)/i;
const RECLAMA_RUIM_PROBLEMA_C_RE = /(reclama|ruim|problema|cancel|demora|erro)/i;

type PurchaseProbabilityBucket = 'LOW' | 'MEDIUM' | 'HIGH' | 'VERY_HIGH';
type SentimentBucket = 'POSITIVE' | 'NEUTRAL' | 'NEGATIVE';
type IntentBucket = 'BUY' | 'SUPPORT' | 'COMPLAINT' | 'INFO' | 'COLD';

interface RawAnalysis {
  leadScore?: unknown;
  score?: unknown;
  purchaseProbability?: unknown;
  urgency?: unknown;
  purchaseProbabilityScore?: unknown;
  sentiment?: unknown;
  intent?: unknown;
  summary?: unknown;
  nextBestAction?: unknown;
  cluster?: unknown;
  reasons?: unknown;
}

interface AnalysisContact {
  name?: string | null;
  phone: string;
  leadScore?: number | null;
  sentiment?: string | null;
  messages: Array<{ direction: string; content: string | null; createdAt: Date }>;
}

/** Analysis result shape. */
export interface AnalysisResult {
  /** Lead score property. */
  leadScore: number;
  /** Purchase probability property. */
  purchaseProbability: PurchaseProbabilityBucket;
  /** Purchase probability score property. */
  purchaseProbabilityScore: number;
  /** Sentiment property. */
  sentiment: SentimentBucket;
  /** Intent property. */
  intent: IntentBucket;
  /** Summary property. */
  summary: string;
  /** Next best action property. */
  nextBestAction: string;
  /** Cluster property. */
  cluster: string | null;
  /** Reasons property. */
  reasons: string[];
}

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

// Coerce an unknown value to a string without triggering
// @typescript-eslint/no-base-to-string. Returns '' for objects/arrays/null
// rather than the misleading "[object Object]" default.
function coerceToString(value: unknown): string {
  if (typeof value === 'string') {
    return value;
  }
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
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
      const fallback = this.buildFallbackAnalysis(contact, history);
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
      const result = this.normalizeAnalysis(rawResult, contact, history);

      await this.persistAnalysis(workspaceId, contactId, currentCustomFields, result);

      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : coerceToString(error);
      this.logger.error(`NeuroCRM analysis failed: ${message}`);
      const fallback = this.buildFallbackAnalysis(contact, history);
      await this.persistAnalysis(workspaceId, contactId, currentCustomFields, fallback);
      return fallback;
    }
  }

  private normalizeAnalysis(
    raw: RawAnalysis,
    contact: AnalysisContact,
    history: string,
  ): AnalysisResult {
    const leadScore = Math.max(
      0,
      Math.min(100, Number(raw?.leadScore ?? raw?.score ?? contact?.leadScore ?? 50) || 0),
    );
    const purchaseProbability = this.normalizeProbabilityBucket(
      raw?.purchaseProbability ?? raw?.urgency,
    );
    const purchaseProbabilityScore = this.normalizeProbabilityScore(
      raw?.purchaseProbabilityScore,
      leadScore,
      purchaseProbability,
    );
    const sentiment = this.normalizeSentiment(raw?.sentiment ?? contact?.sentiment);
    const intent = this.normalizeIntent(raw?.intent);
    const summary =
      coerceToString(raw?.summary).trim() || this.buildFallbackSummary(contact, history, leadScore);
    const nextBestAction = coerceToString(raw?.nextBestAction).trim() || 'FOLLOW_UP_SOFT';
    const cluster = coerceToString(raw?.cluster).trim() || null;
    const reasons = Array.isArray(raw?.reasons)
      ? raw.reasons.map((reason) => coerceToString(reason).trim()).filter(Boolean)
      : [];

    return {
      leadScore,
      purchaseProbability,
      purchaseProbabilityScore,
      sentiment,
      intent,
      summary,
      nextBestAction,
      cluster,
      reasons,
    };
  }

  private normalizeProbabilityBucket(value: unknown): PurchaseProbabilityBucket {
    const normalized = coerceToString(value).trim().toUpperCase();
    if (
      normalized === 'LOW' ||
      normalized === 'MEDIUM' ||
      normalized === 'HIGH' ||
      normalized === 'VERY_HIGH'
    ) {
      return normalized;
    }
    if (normalized.includes('ALTA') || normalized.includes('HIGH')) {
      return 'HIGH';
    }
    if (normalized.includes('BAIXA') || normalized.includes('LOW')) {
      return 'LOW';
    }
    return 'LOW';
  }

  private normalizeProbabilityScore(value: unknown, leadScore: number, bucket: string): number {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      const normalized = numeric > 1 ? numeric / 100 : numeric;
      return Math.max(0, Math.min(1, Number(normalized.toFixed(3))));
    }

    if (bucket === 'VERY_HIGH') {
      return 0.95;
    }
    if (bucket === 'HIGH') {
      return Math.max(0.75, Number((leadScore / 100).toFixed(3)));
    }
    if (bucket === 'MEDIUM') {
      return Math.max(0.35, Number((leadScore / 100).toFixed(3)));
    }
    return Math.min(0.2, Number((leadScore / 100).toFixed(3)));
  }

  private normalizeSentiment(value: unknown): SentimentBucket {
    const normalized = coerceToString(value).trim().toUpperCase();
    if (normalized === 'POSITIVE' || normalized === 'NEUTRAL' || normalized === 'NEGATIVE') {
      return normalized;
    }
    if (normalized.includes('POSITIV')) {
      return 'POSITIVE';
    }
    if (normalized.includes('NEGATIV')) {
      return 'NEGATIVE';
    }
    return 'NEUTRAL';
  }

  private normalizeIntent(value: unknown): IntentBucket {
    const normalized = coerceToString(value).trim().toUpperCase();
    if (
      normalized === 'BUY' ||
      normalized === 'SUPPORT' ||
      normalized === 'COMPLAINT' ||
      normalized === 'INFO' ||
      normalized === 'COLD'
    ) {
      return normalized;
    }
    if (normalized.includes('COMPRA') || normalized.includes('BUY')) {
      return 'BUY';
    }
    if (normalized.includes('SUPORTE') || normalized.includes('SUPPORT')) {
      return 'SUPPORT';
    }
    if (normalized.includes('RECLAM')) {
      return 'COMPLAINT';
    }
    return 'INFO';
  }

  private buildFallbackSummary(
    contact: AnalysisContact,
    history: string,
    leadScore: number,
  ): string {
    if (history) {
      return `${contact.name || contact.phone} tem histórico recente e score ${leadScore}/100.`;
    }
    return `${contact.name || contact.phone} ainda tem pouco histórico e score ${leadScore}/100.`;
  }

  private buildFallbackAnalysis(contact: AnalysisContact, history: string): AnalysisResult {
    const normalizedHistory = String(history || '').toLowerCase();
    const leadScore = normalizedHistory
      ? Math.max(20, Math.min(95, 30 + contact.messages.length * 6))
      : Math.max(10, contact.leadScore || 10);
    const buyingSignal = PRECO_PRE_O_VALOR_QUANT_RE.test(normalizedHistory);
    const complaintSignal = RECLAMA_RUIM_PROBLEMA_C_RE.test(normalizedHistory);
    const intent = complaintSignal ? 'COMPLAINT' : buyingSignal ? 'BUY' : history ? 'INFO' : 'COLD';
    const sentiment = complaintSignal ? 'NEGATIVE' : buyingSignal ? 'POSITIVE' : 'NEUTRAL';
    const purchaseProbability =
      buyingSignal && leadScore >= 80
        ? 'VERY_HIGH'
        : buyingSignal
          ? 'HIGH'
          : leadScore >= 45
            ? 'MEDIUM'
            : 'LOW';

    return {
      leadScore,
      purchaseProbability,
      purchaseProbabilityScore: this.normalizeProbabilityScore(
        null,
        leadScore,
        purchaseProbability,
      ),
      sentiment,
      intent,
      summary: this.buildFallbackSummary(contact, history, leadScore),
      nextBestAction:
        intent === 'BUY'
          ? 'SEND_OFFER'
          : intent === 'COMPLAINT'
            ? 'TRATAR_OBJECAO'
            : 'FOLLOW_UP_SOFT',
      cluster:
        purchaseProbability === 'VERY_HIGH' || purchaseProbability === 'HIGH'
          ? 'Warm'
          : purchaseProbability === 'MEDIUM'
            ? 'Warm'
            : 'Cold',
      reasons: buyingSignal
        ? ['buying_signal_detected']
        : complaintSignal
          ? ['complaint_signal_detected']
          : ['insufficient_signal'],
    };
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
