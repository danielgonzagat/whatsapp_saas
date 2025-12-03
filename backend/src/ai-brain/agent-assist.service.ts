import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class AgentAssistService {
  private openai: OpenAI | null;

  constructor(
    private config: ConfigService,
    private prisma: PrismaService,
  ) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async analyzeSentiment(text: string) {
    if (!this.openai) return { sentiment: 'neutral', score: 0 };
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Classifique sentimento em positivo, neutro ou negativo.' },
        { role: 'user', content: text || '' },
      ],
    });
    const content = completion.choices[0]?.message?.content?.toLowerCase() || '';
    const sentiment = content.includes('positivo')
      ? 'positive'
      : content.includes('negativo')
        ? 'negative'
        : 'neutral';
    return { sentiment, raw: content };
  }

  async summarizeConversation(conversationId: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: 'asc' }, take: 30 },
      },
    });
    if (!convo) return { summary: '' };

    const history = convo.messages
      .map((m) => `[${m.direction}] ${m.content}`)
      .join('\n');

    if (!this.openai) {
      return { summary: history.slice(0, 200) };
    }

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Resuma em 3 linhas, português.' },
        { role: 'user', content: history },
      ],
    });
    return { summary: completion.choices[0]?.message?.content || '' };
  }

  async suggestReply(workspaceId: string, conversationId: string, prompt?: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 10 },
      },
    });
    const latest = convo?.messages?.[0]?.content || '';
    if (!this.openai) {
      return { suggestion: prompt ? `${prompt} ${latest}` : latest };
    }
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Responda curto e direto, tom humano.' },
        { role: 'user', content: prompt ? `${prompt}\nContexto: ${latest}` : latest },
      ],
    });
    return { suggestion: completion.choices[0]?.message?.content || latest };
  }

  async generatePitch(conversationId: string, workspaceId: string) {
    const convo = await this.prisma.conversation.findUnique({
      where: { id: conversationId },
      include: {
        messages: { orderBy: { createdAt: 'desc' }, take: 5 },
      },
    });
    const context = convo?.messages?.map((m) => m.content).join('\n') || '';
    const base = context || 'oferta rápida';
    if (!this.openai) {
      return { pitch: `Tenho uma condição especial hoje. Quer aproveitar? (${base.slice(0, 80)})` };
    }
    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'Crie um pitch curto, persuasivo, português BR, CTA claro.' },
        { role: 'user', content: base },
      ],
    });
    return { pitch: completion.choices[0]?.message?.content || base };
  }
}
