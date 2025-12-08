import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';

@Injectable()
export class CopilotService {
  private readonly logger = new Logger(CopilotService.name);
  
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
    } catch (error: any) {
      this.logger.warn(`Copilot suggest error: ${error.message}`);
      return {
        suggestion:
          'Estou aqui para ajudar! Quer que eu envie um resumo da oferta, um preço ou marque um horário rápido?',
      };
    }
  }

  /**
   * Gera múltiplas sugestões de resposta para o operador escolher
   */
  async suggestMultiple(opts: {
    workspaceId: string;
    contactId?: string;
    phone?: string;
    kbSnippet?: string;
    count?: number;
  }): Promise<{ suggestions: string[]; context?: string }> {
    const { workspaceId, contactId, phone, kbSnippet, count = 3 } = opts;

    const contact = contactId
      ? await this.prisma.contact.findUnique({ where: { id: contactId } })
      : await this.prisma.contact.findUnique({
          where: { workspaceId_phone: { workspaceId, phone: phone || '' } },
        });

    if (!contact) {
      return {
        suggestions: [
          'Olá! Como posso ajudar você hoje?',
          'Oi! Estou aqui para qualquer dúvida.',
          'Em que posso te ajudar agora?',
        ],
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

    // Pegar API key do workspace se houver
    const ws = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });
    const settings: any = ws?.providerSettings || {};
    const apiKey = settings?.openai?.apiKey || process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return {
        suggestions: [
          'Posso te ajudar a escolher a melhor opção!',
          'Quer que eu envie mais detalhes?',
          'Que tal agendarmos uma conversa rápida?',
        ],
      };
    }

    const client = new OpenAI({ apiKey });

    try {
      const prompt = `Você é um copilot de vendas no WhatsApp.
Baseado no histórico abaixo, gere ${count} sugestões de resposta diferentes.
${kbSnippet ? `Contexto da base de conhecimento:\n${kbSnippet}\n` : ''}
Histórico recente:
${history}

Retorne APENAS um JSON com o formato: { "suggestions": ["resposta1", "resposta2", "resposta3"] }
Cada resposta deve ser curta, direta e com CTA claro. Varie o tom: 1) amigável 2) profissional 3) urgente.`;

      const completion = await client.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'Você gera sugestões de resposta em formato JSON.',
          },
          { role: 'user', content: prompt },
        ],
        response_format: { type: 'json_object' },
      });

      const content = completion.choices[0]?.message?.content || '{}';
      const parsed = JSON.parse(content);
      
      // Determinar contexto da conversa
      const lastMessage = msgs[0]?.content || '';
      let context = 'geral';
      if (lastMessage.match(/preço|valor|quanto|custa/i)) context = 'preço';
      else if (lastMessage.match(/pago|paguei|compro|quero/i)) context = 'compra';
      else if (lastMessage.match(/duvida|como|funciona/i)) context = 'dúvida';
      
      return { 
        suggestions: parsed.suggestions || [], 
        context 
      };
    } catch (error: any) {
      this.logger.warn(`Copilot suggestMultiple error: ${error.message}`);
      return {
        suggestions: [
          'Estou aqui para ajudar! Posso tirar suas dúvidas.',
          'Quer que eu envie mais informações sobre nossos produtos?',
          'Que tal fecharmos agora? Tenho condições especiais!',
        ],
      };
    }
  }
}
