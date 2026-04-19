import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import OpenAI from 'openai';
import { AuditService } from '../audit/audit.service';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { KLOEL_GUEST_SYSTEM_PROMPT } from './kloel.prompts';
import { chatCompletionWithFallback, chatCompletionWithRetry } from './openai-wrapper';

interface GuestConversation {
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  createdAt: Date;
  lastMessageAt: Date;
}

// cache.invalidate — guest conversations stored in-memory Map; cleaned up via periodic timer
@Injectable()
export class GuestChatService implements OnModuleDestroy {
  private readonly logger = new Logger(GuestChatService.name);
  private readonly openai: OpenAI;
  private readonly unavailableMessage =
    'Eu continuo aqui, mas a camada de IA esta instavel agora. Tenta de novo em alguns segundos que eu retomo de onde paramos.';

  // In-memory store para conversas de visitantes (em produção, usar Redis)
  private conversations: Map<string, GuestConversation> = new Map();

  // Limpar conversas antigas a cada 1 hora
  private cleanupInterval?: NodeJS.Timeout;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly auditService?: AuditService,
  ) {
    const isTestEnv = !!process.env.JEST_WORKER_ID || process.env.NODE_ENV === 'test';

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
      this.cleanupInterval = setInterval(() => this.cleanupOldConversations(), 60 * 60 * 1000);
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
      process.env.OPENAI_API_KEY || this.configService.get<string>('OPENAI_API_KEY') || undefined
    );
  }

  private writeStreamChunk(
    res: Response,
    data: { content?: string; chunk?: string; done?: boolean; error?: string },
  ) {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
  }

  private buildGuestMessages(message: string, sessionId: string) {
    const conversation = this.getOrCreateConversation(sessionId);
    conversation.messages.push({ role: 'user', content: message });
    conversation.lastMessageAt = new Date();

    const contextMessages = [
      { role: 'system' as const, content: KLOEL_GUEST_SYSTEM_PROMPT },
      ...conversation.messages.slice(-10),
    ];

    return {
      conversation,
      contextMessages,
    };
  }

  private trackGuestUsage(sessionId: string, tokens: number | undefined, model?: string) {
    this.logger.debug(
      `[guest-ai] session=${sessionId} model=${model || 'unknown'} tokens=${tokens ?? 0} tracked as transient guest usage without workspace budget context.`,
    );
  }

  private async generateGuestReply(
    contextMessages: {
      role: 'user' | 'assistant' | 'system';
      content: string;
    }[],
    sessionId: string,
  ): Promise<string> {
    const primaryModel = resolveBackendOpenAIModel('writer', this.configService);
    const fallbackModel = resolveBackendOpenAIModel('writer_fallback', this.configService);
    const emergencyModels = [
      resolveBackendOpenAIModel('brain', this.configService),
      resolveBackendOpenAIModel('brain_fallback', this.configService),
      'gpt-4o-mini',
    ].filter(Boolean);

    try {
      const completion = await chatCompletionWithFallback(
        this.openai,
        {
          model: primaryModel,
          messages: contextMessages,
          max_tokens: 500,
          temperature: 0.7,
        },
        fallbackModel,
      );
      this.trackGuestUsage(sessionId, completion?.usage?.total_tokens, primaryModel);

      return completion.choices[0]?.message?.content?.trim() || this.unavailableMessage;
    } catch (error: unknown) {
      this.logger.warn(
        `Guest writer fallback failed (${error instanceof Error ? error.message : 'unknown_error'}). Trying emergency model chain.`,
      );
    }

    // tokenBudget: caller responsible for pre-flight budget check
    // biome-ignore lint/performance/noAwaitInLoops: sequential fallback through model list
    for (const model of emergencyModels) {
      try {
        // biome-ignore lint/performance/noAwaitInLoops: retry loop for OpenAI chat completion with exponential backoff
        const completion = await chatCompletionWithRetry(this.openai, {
          model,
          messages: contextMessages,
          max_tokens: 500,
          temperature: 0.7,
        });
        this.trackGuestUsage(sessionId, completion?.usage?.total_tokens, model);
        const reply = completion.choices[0]?.message?.content?.trim();
        if (reply) {
          return reply;
        }
      } catch (error: unknown) {
        this.logger.warn(
          `Guest emergency model ${model} failed (${error instanceof Error ? error.message : 'unknown_error'}).`,
        );
      }
    }

    return this.unavailableMessage;
  }

  /**
   * 💬 Chat com streaming SSE para visitantes
   */
  async chat(message: string, sessionId: string, req: Request, res: Response): Promise<void> {
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

      const { conversation, contextMessages } = this.buildGuestMessages(message, sessionId);

      const fullResponse = await this.generateGuestReply(contextMessages, sessionId);

      this.writeStreamChunk(res, {
        content: fullResponse,
        chunk: fullResponse,
        done: false,
      });

      // Salvar resposta na conversa
      conversation.messages.push({ role: 'assistant', content: fullResponse });

      // Enviar done
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error: unknown) {
      this.logger.error(
        `Guest chat error: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
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

      const { conversation, contextMessages } = this.buildGuestMessages(message, sessionId);

      this.logger.log(
        `Guest chat sync: session=${sessionId}, message="${message.substring(0, 50)}..."`,
      );

      const reply = await this.generateGuestReply(contextMessages, sessionId);

      conversation.messages.push({ role: 'assistant', content: reply });

      this.logger.log(`Guest chat sync reply: ${reply.substring(0, 100)}...`);

      return reply;
    } catch (error: unknown) {
      this.logger.error(
        `Guest chat sync error: ${error instanceof Error ? error.message : 'unknown error'}`,
        error instanceof Error ? error.stack : undefined,
      );
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
