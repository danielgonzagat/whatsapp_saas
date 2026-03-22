import { Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import { Response, Request } from 'express';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { KLOEL_GUEST_SYSTEM_PROMPT } from './kloel.prompts';

interface GuestConversation {
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  createdAt: Date;
  lastMessageAt: Date;
}

@Injectable()
export class GuestChatService implements OnModuleDestroy {
  private readonly logger = new Logger(GuestChatService.name);
  private readonly openai: OpenAI;
  private readonly unavailableMessage =
    'Eu continuo aqui, mas a camada de IA está instável agora. Tenta de novo em alguns segundos que eu retomo de onde paramos.';

  // In-memory store para conversas de visitantes (em produção, usar Redis)
  private conversations: Map<string, GuestConversation> = new Map();

  // Limpar conversas antigas a cada 1 hora
  private cleanupInterval?: NodeJS.Timeout;

  constructor(private readonly configService: ConfigService) {
    const isTestEnv =
      !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';

    const apiKey = this.getOpenAiKey();

    if (!isTestEnv) {
      this.logger.log(
        `GuestChatService initialized. API Key present: ${!!apiKey}, length: ${apiKey?.length || 0}`,
      );
      if (!apiKey) {
        this.logger.error('OPENAI_API_KEY not found! Check your .env file.');
      }
    }

    this.openai = new OpenAI({
      apiKey: apiKey,
    });

    // Limpar conversas inativas (mais de 24h)
    if (!isTestEnv) {
      this.cleanupInterval = setInterval(
        () => this.cleanupOldConversations(),
        60 * 60 * 1000,
      );
      this.cleanupInterval.unref?.();
    }
  }

  onModuleDestroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = undefined;
    }
  }

  /** Leitura unificada da chave OpenAI (process.env → ConfigService) */
  private getOpenAiKey(): string | undefined {
    return (
      process.env.OPENAI_API_KEY ||
      this.configService.get<string>('OPENAI_API_KEY') ||
      undefined
    );
  }

  private writeStreamChunk(
    res: Response,
    data: { content?: string; chunk?: string; done?: boolean; error?: string },
  ) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  /**
   * 💬 Chat com streaming SSE para visitantes
   */
  async chat(
    message: string,
    sessionId: string,
    req: Request,
    res: Response,
  ): Promise<void> {
    // CORS manual — obrigatório porque estamos usando @Res() e streaming
    // NestJS desativa CORS automático quando usamos @Res()
    const origin = req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Vary', 'Origin');
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Session-Id, Accept',
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Credentials', 'true');

    // Configurar SSE
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.setHeader('X-Session-Id', sessionId);

    // Enviar cabeçalhos antes de escrever dados
    res.flushHeaders();

    try {
      const apiKey = this.getOpenAiKey();
      if (!apiKey) {
        this.writeStreamChunk(res, {
          content: this.unavailableMessage,
          chunk: this.unavailableMessage,
          error: 'openai_api_key_missing',
          done: true,
        });
        res.write(`data: [DONE]\n\n`);
        res.end();
        return;
      }

      // Obter ou criar conversa
      const conversation = this.getOrCreateConversation(sessionId);

      // Adicionar mensagem do usuário
      conversation.messages.push({ role: 'user', content: message });
      conversation.lastMessageAt = new Date();

      // Preparar mensagens para OpenAI (últimas 10 para contexto)
      const contextMessages = [
        { role: 'system' as const, content: KLOEL_GUEST_SYSTEM_PROMPT },
        ...conversation.messages.slice(-10),
      ];

      // Chamar OpenAI com streaming
      const stream = await this.openai.chat.completions.create({
        model: resolveBackendOpenAIModel('writer', this.configService),
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
          this.writeStreamChunk(res, {
            content,
            chunk: content,
            done: false,
          });
        }
      }

      if (!fullResponse.trim()) {
        fullResponse =
          'Eu travei na hora de responder com profundidade. Me chama de novo que eu continuo daqui, sem enrolação.';
        this.writeStreamChunk(res, {
          content: fullResponse,
          chunk: fullResponse,
          error: 'empty_stream',
          done: false,
        });
      }

      // Salvar resposta na conversa
      conversation.messages.push({ role: 'assistant', content: fullResponse });

      // Enviar done
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error: any) {
      this.logger.error(`Guest chat error: ${error.message}`, error.stack);
      this.writeStreamChunk(res, {
        content: this.unavailableMessage,
        chunk: this.unavailableMessage,
        error: 'guest_chat_error',
        done: true,
      });
      res.write(`data: [DONE]\n\n`);
      res.end();
    }
  }

  /**
   * 🔄 Chat síncrono (sem streaming)
   */
  async chatSync(message: string, sessionId: string): Promise<string> {
    try {
      const apiKey = this.getOpenAiKey();
      if (!apiKey) {
        this.logger.error('OPENAI_API_KEY not configured');
        return this.unavailableMessage;
      }

      const conversation = this.getOrCreateConversation(sessionId);

      conversation.messages.push({ role: 'user', content: message });
      conversation.lastMessageAt = new Date();

      const contextMessages = [
        { role: 'system' as const, content: KLOEL_GUEST_SYSTEM_PROMPT },
        ...conversation.messages.slice(-10),
      ];

      this.logger.log(
        `Guest chat sync: session=${sessionId}, message="${message.substring(0, 50)}..."`,
      );

      const completion = await this.openai.chat.completions.create({
        model: resolveBackendOpenAIModel('writer', this.configService),
        messages: contextMessages,
        max_tokens: 500,
        temperature: 0.7,
      });

      const reply =
        completion.choices[0]?.message?.content ||
        this.unavailableMessage;

      conversation.messages.push({ role: 'assistant', content: reply });

      this.logger.log(`Guest chat sync reply: ${reply.substring(0, 100)}...`);

      return reply;
    } catch (error: any) {
      this.logger.error(`Guest chat sync error: ${error.message}`, error.stack);
      return this.unavailableMessage;
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
    return this.conversations.get(sessionId);
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
