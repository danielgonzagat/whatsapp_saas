import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

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
    if (!contact) throw new Error('Contato não encontrado');

    const lastMsg = contact.messages[0];
    const hoursSince = lastMsg
      ? (Date.now() - lastMsg.createdAt.getTime()) / 3600000
      : 999;

    let action = 'FOLLOW_UP_SOFT';
    let reason = 'contato sem atividade recente';

    if (contact.leadScore > 70 || contact.purchaseProbability === 'HIGH') {
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
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });
    const transcript = completion.choices[0]?.message?.content || '';
    return { transcript };
  }

  async analyzeContact(workspaceId: string, contactId: string) {
    if (!this.openai) return;

    // 1. Fetch Context
    const contact = await this.prisma.contact.findUnique({
      where: { id: contactId },
      include: {
        messages: { take: 20, orderBy: { createdAt: 'desc' } },
        deals: true,
      },
    });

    if (!contact) return;

    // 2. Prepare Prompt
    const history = contact.messages
      .reverse()
      .map((m) => `[${m.direction}] ${m.content}`)
      .join('\n');

    const prompt = `
    Analyze this conversation history for a CRM system.
    
    History:
    ${history}
    
    Return a JSON with:
    - score: 0-100 (Lead scoring based on interest)
    - intent: "BUY", "SUPPORT", "COMPLAINT", "INFO"
    - urgency: "LOW", "MEDIUM", "HIGH"
    - summary: 2 sentence summary of the lead's status
    - nextBestAction: What should the agent do next?
    - cluster: "VIP", "Warm", "Cold", "Lost"
    `;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a NeuroCRM engine. Output strictly JSON.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      });

      const result = JSON.parse(
        completion.choices[0]?.message?.content || '{}',
      );

      // 3. Update Contact
      await this.prisma.contact.update({
        where: { id: contactId },
        data: {
          leadScore: result.score || 50,
          sentiment: result.intent || 'NEUTRAL',
          purchaseProbability: result.urgency || 'LOW',
          aiSummary: result.summary,
          nextBestAction: result.nextBestAction,
        },
      });

      this.logger.log(`NeuroCRM analysis completed for ${contact.phone}`);
      return result;
    } catch (error) {
      this.logger.error(`NeuroCRM analysis failed: ${error.message}`);
    }
  }
}
