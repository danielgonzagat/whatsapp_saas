import { Injectable, Logger } from '@nestjs/common';
import { Response } from 'express';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

// System prompt para modo visitante - IA como vendedor
const GUEST_SYSTEM_PROMPT = `Você é o Kloel, um vendedor pessoal e assistente de inteligência comercial autônoma.

🎯 SEU OBJETIVO PRINCIPAL:
Ajudar visitantes com suas dúvidas sobre vendas, WhatsApp e automação, enquanto gentilmente os guia para criar uma conta quando apropriado.

💡 COMPORTAMENTO:
1. SEMPRE seja prestativo e responda às perguntas do visitante
2. NUNCA bloqueie ou negue informações básicas
3. Quando o visitante demonstrar interesse real, sugira criar uma conta
4. Se perguntarem sobre funcionalidades que exigem conta (WhatsApp, automações), explique que precisam criar conta

🚫 O QUE NÃO FAZER:
- Não force a criação de conta em toda mensagem
- Não seja insistente ou agressivo nas vendas
- Não minta sobre funcionalidades

✨ GATILHOS PARA SUGERIR CONTA:
- Visitante pergunta como conectar WhatsApp
- Visitante pergunta sobre automações
- Visitante pergunta sobre preços/planos
- Visitante demonstra intenção de compra
- Visitante pergunta funcionalidades específicas do produto

📝 EXEMPLO DE CONVITE PARA CRIAR CONTA:
"Posso te ajudar com isso! Para [funcionalidade], você precisa criar sua conta - é grátis e leva menos de 1 minuto. Quer que eu te leve até lá?"

🎁 BENEFÍCIOS PARA MENCIONAR:
- 7 dias grátis para testar
- IA de vendas automática 24/7
- Conexão com WhatsApp
- Dashboard de métricas
- Sem cartão para começar

💬 TOM DE VOZ:
- Amigável e profissional
- Direto ao ponto
- Entusiasmado mas não forçado
- Use emojis com moderação

Lembre-se: você é o melhor vendedor. Cada conversa é uma oportunidade de mostrar valor e converter visitantes em usuários.`;

interface GuestConversation {
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  createdAt: Date;
  lastMessageAt: Date;
}

@Injectable()
export class GuestChatService {
  private readonly logger = new Logger(GuestChatService.name);
  private readonly openai: OpenAI;
  
  // In-memory store para conversas de visitantes (em produção, usar Redis)
  private conversations: Map<string, GuestConversation> = new Map();
  
  // Limpar conversas antigas a cada 1 hora
  private cleanupInterval: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
    this.openai = new OpenAI({
      apiKey: this.configService.get('OPENAI_API_KEY'),
    });

    // Limpar conversas inativas (mais de 24h)
    this.cleanupInterval = setInterval(() => this.cleanupOldConversations(), 60 * 60 * 1000);
  }

  /**
   * 💬 Chat com streaming SSE para visitantes
   */
  async chat(message: string, sessionId: string, res: Response): Promise<void> {
    // Configurar SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Session-Id', sessionId);
    res.flushHeaders();

    try {
      // Obter ou criar conversa
      const conversation = this.getOrCreateConversation(sessionId);
      
      // Adicionar mensagem do usuário
      conversation.messages.push({ role: 'user', content: message });
      conversation.lastMessageAt = new Date();

      // Preparar mensagens para OpenAI (últimas 10 para contexto)
      const contextMessages = [
        { role: 'system' as const, content: GUEST_SYSTEM_PROMPT },
        ...conversation.messages.slice(-10),
      ];

      // Chamar OpenAI com streaming
      const stream = await this.openai.chat.completions.create({
        model: this.configService.get('OPENAI_MODEL') || 'gpt-4o-mini',
        messages: contextMessages,
        stream: true,
        max_tokens: 500,
        temperature: 0.7,
      });

      let fullResponse = '';

      for await (const chunk of stream) {
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          fullResponse += content;
          res.write(`data: ${JSON.stringify({ chunk: content })}\n\n`);
        }
      }

      // Salvar resposta na conversa
      conversation.messages.push({ role: 'assistant', content: fullResponse });
      
      // Enviar done
      res.write(`data: [DONE]\n\n`);
      res.end();

    } catch (error: any) {
      this.logger.error(`Guest chat error: ${error.message}`, error.stack);
      res.write(`data: ${JSON.stringify({ error: 'Desculpe, ocorreu um erro. Tente novamente.' })}\n\n`);
      res.end();
    }
  }

  /**
   * 🔄 Chat síncrono (sem streaming)
   */
  async chatSync(message: string, sessionId: string): Promise<string> {
    try {
      const conversation = this.getOrCreateConversation(sessionId);
      
      conversation.messages.push({ role: 'user', content: message });
      conversation.lastMessageAt = new Date();

      const contextMessages = [
        { role: 'system' as const, content: GUEST_SYSTEM_PROMPT },
        ...conversation.messages.slice(-10),
      ];

      const completion = await this.openai.chat.completions.create({
        model: this.configService.get('OPENAI_MODEL') || 'gpt-4o-mini',
        messages: contextMessages,
        max_tokens: 500,
        temperature: 0.7,
      });

      const reply = completion.choices[0]?.message?.content || 'Desculpe, não consegui processar sua mensagem.';
      
      conversation.messages.push({ role: 'assistant', content: reply });
      
      return reply;

    } catch (error: any) {
      this.logger.error(`Guest chat sync error: ${error.message}`);
      return 'Desculpe, ocorreu um erro. Tente novamente em alguns segundos.';
    }
  }

  /**
   * 📋 Obter ou criar conversa
   */
  private getOrCreateConversation(sessionId: string): GuestConversation {
    if (!this.conversations.has(sessionId)) {
      this.conversations.set(sessionId, {
        messages: [],
        createdAt: new Date(),
        lastMessageAt: new Date(),
      });
    }
    return this.conversations.get(sessionId)!;
  }

  /**
   * 🧹 Limpar conversas antigas
   */
  private cleanupOldConversations(): void {
    const maxAge = 24 * 60 * 60 * 1000; // 24 horas
    const now = Date.now();
    let cleaned = 0;

    for (const [sessionId, conversation] of this.conversations.entries()) {
      if (now - conversation.lastMessageAt.getTime() > maxAge) {
        this.conversations.delete(sessionId);
        cleaned++;
      }
    }

    if (cleaned > 0) {
      this.logger.log(`Cleaned up ${cleaned} old guest conversations`);
    }
  }

  /**
   * 📊 Estatísticas (para debug)
   */
  getStats(): { activeSessions: number; totalMessages: number } {
    let totalMessages = 0;
    for (const conversation of this.conversations.values()) {
      totalMessages += conversation.messages.length;
    }
    return {
      activeSessions: this.conversations.size,
      totalMessages,
    };
  }
}
