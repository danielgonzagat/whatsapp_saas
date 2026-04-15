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

export interface AnalysisResult {
  leadScore: number;
  purchaseProbability: PurchaseProbabilityBucket;
  purchaseProbabilityScore: number;
  sentiment: SentimentBucket;
  intent: IntentBucket;
  summary: string;
  nextBestAction: string;
  cluster: string | null;
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
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'bigint') {
    return String(value);
  }
  return '';
}

@Injectable()
export class NeuroCrmService {
  private readonly logger = new Logger(NeuroCrmService.name);
  private openai: OpenAI | null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private readonly planLimits: PlanLimitsService,
  ) {
    const apiKey = this.config.get('OPENAI_API_KEY');
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
    if (!contact) throw new NotFoundException('Contato não encontrado');

    const lastMsg = contact.messages[0];
    const hoursSince = lastMsg ? (Date.now() - lastMsg.createdAt.getTime()) / 3600000 : 999;

    let action = 'FOLLOW_UP_SOFT';
    let reason = 'contato sem atividade recente';

    if (
      contact.leadScore > 70 ||
      contact.purchaseProbability === 'HIGH' ||
      contact.purchaseProbability === 'VERY_HIGH'
    ) {
      action = hoursSince > 12 ? 'CLOSE_NOW' : 'CTA_PREÇO';
      reason = 'lead quente';
    } else if (contact.sentiment === 'NEGATIVE') {
      action = 'TRATAR_OBJECAO';
      reason = 'sentimento negativo';
    } else if (hoursSince > 48) {
      action = 'REAKTIVAR';
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
    const points = contacts.map((c) => ({
      contact: c,
      x: c.leadScore ?? 0,
      y: (Date.now() - c.updatedAt.getTime()) / 3600000,
    }));

    const k = 3;
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
        if (!bucket.length) return centroids[idx];
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
      return {
        transcript: [
          'Lead: Olá, tenho interesse mas tenho dúvidas.',
          'Agente: Claro! Posso te ajudar com preço ou implementação?',
        ],
      };
    }

    const prompt = `
Persona: ${input.persona}
Cenário: ${input.scenario}
Objetivo: ${input.goal}
Simule um diálogo de 6 turnos Lead/Agente com foco em conversão.`;

    if (input.workspaceId) await this.planLimits.ensureTokenBudget(input.workspaceId);
    const completion = await chatCompletionWithRetry(this.openai, {
      model: resolveBackendOpenAIModel('writer'),
      messages: [{ role: 'user', content: prompt }],
    });
    if (input.workspaceId)
      await this.planLimits
        .trackAiUsage(input.workspaceId, completion?.usage?.total_tokens ?? 500)
        .catch(() => {});
    const transcript = completion.choices[0]?.message?.content || '';
    return { transcript };
  }

  async analyzeContact(workspaceId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, workspaceId },
      include: {
        messages: { take: 20, orderBy: { createdAt: 'desc' } },
        deals: true,
      },
    });

    if (!contact) return;

    const history = contact.messages
      .reverse()
      .map((m) => `[${m.direction}] ${m.content}`)
      .join('\n');

    if (!this.openai) {
      const fallback = this.buildFallbackAnalysis(contact, history);
      await this.persistAnalysis(workspaceId, contactId, contact.customFields, fallback);
      return fallback;
    }

    const prompt = `
    Analyze this WhatsApp conversation for a CRM system.

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
    - reasons: array of short reasons supporting the score
    `;

    try {
      await this.planLimits.ensureTokenBudget(workspaceId);
      const completion = await chatCompletionWithRetry(this.openai, {
        model: resolveBackendOpenAIModel('brain'),
        messages: [
          {
            role: 'system',
            content: 'You are a NeuroCRM engine. Output strictly JSON.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      });

      await this.planLimits
        .trackAiUsage(workspaceId, completion?.usage?.total_tokens ?? 500)
        .catch(() => {});
      const rawResult = JSON.parse(completion.choices[0]?.message?.content || '{}');
      const result = this.normalizeAnalysis(rawResult, contact, history);

      await this.persistAnalysis(workspaceId, contactId, contact.customFields, result);

      this.logger.log(`NeuroCRM analysis completed for ${contact.phone}`);
      return result;
    } catch (error) {
      const message = error instanceof Error ? error.message : coerceToString(error);
      this.logger.error(`NeuroCRM analysis failed: ${message}`);
      const fallback = this.buildFallbackAnalysis(contact, history);
      await this.persistAnalysis(workspaceId, contactId, contact.customFields, fallback);
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
    return 'LOW';
  }

  private normalizeProbabilityScore(value: unknown, leadScore: number, bucket: string): number {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return Math.max(0, Math.min(1, Number(numeric.toFixed(3))));
    }

    if (bucket === 'VERY_HIGH') return 0.95;
    if (bucket === 'HIGH') return Math.max(0.75, Number((leadScore / 100).toFixed(3)));
    if (bucket === 'MEDIUM') return Math.max(0.35, Number((leadScore / 100).toFixed(3)));
    return Math.min(0.2, Number((leadScore / 100).toFixed(3)));
  }

  private normalizeSentiment(value: unknown): SentimentBucket {
    const normalized = coerceToString(value).trim().toUpperCase();
    if (normalized === 'POSITIVE' || normalized === 'NEUTRAL' || normalized === 'NEGATIVE') {
      return normalized;
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

  async listInsights(contactId: string) {
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

  async createInsight(contactId: string, type: string, description: string, scoreChange = 0) {
    return this.prisma.contactInsight.create({
      data: { contactId, type, description, scoreChange },
    });
  }
}
