import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';

@Injectable()
export class CopilotService {
  constructor(private prisma: PrismaService) {}

  private buildPrompt(history: string, kbSnippet?: string) {
    let prompt = `Você é um copilot de vendas no WhatsApp. Gere uma resposta concisa, humana e útil. Foque em avançar a conversa com CTA claro.`;
    if (kbSnippet) {
      prompt += `\nContexto da base de conhecimento:\n${kbSnippet}`;
    }
    prompt += `\nHistórico recente:\n${history}\n\nResponda em uma única mensagem.`;
    return prompt;
  }

  async suggest(opts: {
    workspaceId: string;
    contactId?: string;
    phone?: string;
    kbSnippet?: string;
  }) {
    const { workspaceId, contactId, phone, kbSnippet } = opts;

    const contact = contactId
      ? await this.prisma.contact.findUnique({ where: { id: contactId } })
      : await this.prisma.contact.findUnique({
          where: { workspaceId_phone: { workspaceId, phone: phone || '' } },
        });

    if (!contact) {
      return {
        suggestion:
          'Posso ajudar com algo? Conte-me mais para eu responder melhor.',
      };
    }

    const msgs = await this.prisma.message.findMany({
      where: { workspaceId, contactId: contact.id },
      orderBy: { createdAt: 'desc' },
      take: 8,
    });

    const history = msgs
      .reverse()
      .map(
        (m) => `[${m.direction === 'INBOUND' ? 'Lead' : 'Você'}] ${m.content}`,
      )
      .join('\n');

    // pegar API key do workspace se houver
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    const settings: any = ws?.providerSettings || {};
    const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        suggestion:
          'Vi sua mensagem! Posso te ajudar a decidir e já te enviar os próximos passos agora.',
      };
    }

    const client = new OpenAI({ apiKey });

    try {
      const prompt = this.buildPrompt(history, kbSnippet);
      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content:
              'Você é um assistente de vendas no WhatsApp. Responda curto e direto.',
          },
          { role: 'user', content: prompt },
        ],
      });
      const suggestion = completion.choices[0]?.message?.content || '';
      return { suggestion };
    } catch {
      return {
        suggestion:
          'Estou aqui para ajudar! Quer que eu envie um resumo da oferta, um preço ou marque um horário rápido?',
      };
    }
  }
}
