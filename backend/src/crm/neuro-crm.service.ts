import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { resolveBackendOpenAIModel } from '../lib/openai-models';

@Injectable()
export class NeuroCrmService {
  private readonly logger = new Logger(NeuroCrmService.name);
  private openai: OpenAI | null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const apiKey = this.config.get('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  /**
   * Sugere próxima melhor ação com base em score, sentimento e recência.
   */
  async nextBestAction(workspaceId: string, contactId: string) {
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
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
    const hoursSince = lastMsg
      ? (Date.now() - lastMsg.createdAt.getTime()) / 3600000
      : 999;

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
      where: { workspaceId },
      select: {
        id: true,
        name: true,
        phone: true,
        leadScore: true,
        updatedAt: true,
      },
      take: 500,
    });
    const points = contacts.map((c) => ({
      contact: c,
      x: c.leadScore ?? 0,
      y: (Date.now() - c.updatedAt.getTime()) / 3600000,
    }));

    const k = 3;
    let centroids = points.slice(0, k).map((p) => ({ x: p.x, y: p.y }));
    for (let iter = 0; iter < 5; iter++) {
      const buckets: any[] = Array.from({ length: k }, () => []);
      for (const p of points) {
        let best = 0;
        let bestDist = Infinity;
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
          x: bucket.reduce((a: number, b: any) => a + b.x, 0) / bucket.length,
          y: bucket.reduce((a: number, b: any) => a + b.y, 0) / bucket.length,
        };
      });
    }

    const clusters = points.map((p) => {
      let best = 0;
      let bestDist = Infinity;
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

    const completion = await this.openai.chat.completions.create({
      model: resolveBackendOpenAIModel('writer'),
      messages: [{ role: 'user', content: prompt }],
    });
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
      await this.persistAnalysis(contactId, contact.customFields, fallback);
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
      const completion = await this.openai.chat.completions.create({
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

      const rawResult = JSON.parse(
        completion.choices[0]?.message?.content || '{}',
      );
      const result = this.normalizeAnalysis(rawResult, contact, history);

      await this.persistAnalysis(contactId, contact.customFields, result);

      this.logger.log(`NeuroCRM analysis completed for ${contact.phone}`);
      return result;
    } catch (error: any) {
      this.logger.error(`NeuroCRM analysis failed: ${error.message}`);
      const fallback = this.buildFallbackAnalysis(contact, history);
      await this.persistAnalysis(contactId, contact.customFields, fallback);
      return fallback;
    }
  }

  private normalizeAnalysis(raw: any, contact: any, history: string) {
    const leadScore = Math.max(
      0,
      Math.min(
        100,
        Number(
          raw?.leadScore ?? raw?.score ?? contact?.leadScore ?? 50,
        ) || 0,
      ),
    );
    const purchaseProbability = this.normalizeProbabilityBucket(
      raw?.purchaseProbability ?? raw?.urgency,
    );
    const purchaseProbabilityScore = this.normalizeProbabilityScore(
      raw?.purchaseProbabilityScore,
      leadScore,
      purchaseProbability,
    );
    const sentiment = this.normalizeSentiment(
      raw?.sentiment ?? contact?.sentiment,
    );
    const intent = this.normalizeIntent(raw?.intent);
    const summary =
      String(raw?.summary || '').trim() ||
      this.buildFallbackSummary(contact, history, leadScore);
    const nextBestAction =
      String(raw?.nextBestAction || '').trim() || 'FOLLOW_UP_SOFT';
    const cluster = String(raw?.cluster || '').trim() || null;
    const reasons = Array.isArray(raw?.reasons)
      ? raw.reasons
          .map((reason: any) => String(reason || '').trim())
          .filter(Boolean)
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

  private normalizeProbabilityBucket(value: any) {
    const normalized = String(value || '').trim().toUpperCase();
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

  private normalizeProbabilityScore(
    value: any,
    leadScore: number,
    bucket: string,
  ) {
    const numeric = Number(value);
    if (Number.isFinite(numeric)) {
      return Math.max(0, Math.min(1, Number(numeric.toFixed(3))));
    }

    if (bucket === 'VERY_HIGH') return 0.95;
    if (bucket === 'HIGH') return Math.max(0.75, Number((leadScore / 100).toFixed(3)));
    if (bucket === 'MEDIUM') return Math.max(0.35, Number((leadScore / 100).toFixed(3)));
    return Math.min(0.2, Number((leadScore / 100).toFixed(3)));
  }

  private normalizeSentiment(value: any) {
    const normalized = String(value || '').trim().toUpperCase();
    if (
      normalized === 'POSITIVE' ||
      normalized === 'NEUTRAL' ||
      normalized === 'NEGATIVE'
    ) {
      return normalized;
    }
    return 'NEUTRAL';
  }

  private normalizeIntent(value: any) {
    const normalized = String(value || '').trim().toUpperCase();
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

  private buildFallbackSummary(contact: any, history: string, leadScore: number) {
    if (history) {
      return `${contact.name || contact.phone} tem histórico recente e score ${leadScore}/100.`;
    }
    return `${contact.name || contact.phone} ainda tem pouco histórico e score ${leadScore}/100.`;
  }

  private buildFallbackAnalysis(contact: any, history: string) {
    const normalizedHistory = String(history || '').toLowerCase();
    const leadScore = normalizedHistory
      ? Math.max(20, Math.min(95, 30 + contact.messages.length * 6))
      : Math.max(10, contact.leadScore || 10);
    const buyingSignal =
      /(preco|preço|valor|quanto|pix|boleto|comprar|fechar|pagar)/i.test(
        normalizedHistory,
      );
    const complaintSignal = /(reclama|ruim|problema|cancel|demora|erro)/i.test(
      normalizedHistory,
    );
    const intent = complaintSignal
      ? 'COMPLAINT'
      : buyingSignal
        ? 'BUY'
        : history
          ? 'INFO'
          : 'COLD';
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
    contactId: string,
    currentCustomFields: any,
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
    const customFields =
      currentCustomFields &&
      typeof currentCustomFields === 'object' &&
      !Array.isArray(currentCustomFields)
        ? currentCustomFields
        : {};

    await this.prisma.contact.update({
      where: { id: contactId },
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
        } as Record<string, any>,
      },
    });
  }
}
