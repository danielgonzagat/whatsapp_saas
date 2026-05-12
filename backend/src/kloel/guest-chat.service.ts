import { InjectRedis } from '@nestjs-modules/ioredis';
import { Injectable, Logger, OnModuleDestroy, Optional } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Request, Response } from 'express';
import type Redis from 'ioredis';
import OpenAI from 'openai';
import { findFirstSequential } from '../common/async-sequence';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { KLOEL_GUEST_SYSTEM_PROMPT } from './kloel.prompts';
import { chatCompletionWithFallback, chatCompletionWithRetry } from './openai-wrapper';
import { OpsAlertService } from '../observability/ops-alert.service';

interface GuestConversation {
  messages: { role: 'user' | 'assistant' | 'system'; content: string }[];
  createdAt: Date;
  lastMessageAt: Date;
}

const GUEST_CONVERSATION_TTL_SECONDS = 24 * 60 * 60;

// cache.invalidate — Redis is the primary guest conversation store; local Map is fallback.
@Injectable()
export class GuestChatService implements OnModuleDestroy {
  private readonly logger = new Logger(GuestChatService.name);
  private readonly openai: OpenAI;
  private readonly unavailableMessage =
    'Eu continuo aqui, mas a camada de IA esta instavel agora. Tenta de novo em alguns segundos que eu retomo de onde paramos.';

  // Local fallback when Redis is temporarily unavailable.
  private conversations: Map<string, GuestConversation> = new Map();

  // Limpar conversas antigas a cada 1 hora
  private cleanupInterval?: NodeJS.Timeout | undefined;

  constructor(
    private readonly configService: ConfigService,
    @Optional() private readonly opsAlert?: OpsAlertService,
    @Optional() @InjectRedis() private readonly redis?: Redis,
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

  /** On module destroy. */
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

  private async buildGuestMessages(message: string, sessionId: string) {
    const conversation = await this.getOrCreateConversation(sessionId);
    conversation.messages.push({ role: 'user', content: message });
    conversation.lastMessageAt = new Date();
    await this.persistConversation(sessionId, conversation);

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
      resolveBackendOpenAIModel('guest_emergency', this.configService),
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
      void this.opsAlert?.alertOnCriticalError(error, 'GuestChatService.resolveBackendOpenAIModel');
      this.logger.warn(
        `Guest writer fallback failed (${error instanceof Error ? error.message : 'unknown_error'}). Trying emergency model chain.`,
      );
    }

    const reply = await findFirstSequential(emergencyModels, async (model) => {
      try {
        const completion = await chatCompletionWithRetry(this.openai, {
          model,
          messages: contextMessages,
          max_tokens: 500,
          temperature: 0.7,
        });
        this.trackGuestUsage(sessionId, completion?.usage?.total_tokens, model);
        return completion.choices[0]?.message?.content?.trim();
      } catch (error: unknown) {
        void this.opsAlert?.alertOnCriticalError(
          error,
          'GuestChatService.resolveBackendOpenAIModel',
        );
        this.logger.warn(
          `Guest emergency model ${model} failed (${error instanceof Error ? error.message : 'unknown_error'}).`,
        );
        return undefined;
      }
    });

    if (reply) {
      return reply;
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

      const { conversation, contextMessages } = await this.buildGuestMessages(message, sessionId);

      const fullResponse = await this.generateGuestReply(contextMessages, sessionId);

      this.writeStreamChunk(res, {
        content: fullResponse,
        chunk: fullResponse,
        done: false,
      });

      // Salvar resposta na conversa
      conversation.messages.push({ role: 'assistant', content: fullResponse });
      await this.persistConversation(sessionId, conversation);

      // Enviar done
      res.write(`data: [DONE]\n\n`);
      res.end();
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'GuestChatService.end');
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

      const { conversation, contextMessages } = await this.buildGuestMessages(message, sessionId);

      this.logger.log(
        `Guest chat sync: session=${sessionId}, message="${message.substring(0, 50)}..."`,
      );

      const reply = await this.generateGuestReply(contextMessages, sessionId);

      conversation.messages.push({ role: 'assistant', content: reply });
      await this.persistConversation(sessionId, conversation);

      this.logger.log(`Guest chat sync reply: ${reply.substring(0, 100)}...`);

      return reply;
    } catch (error: unknown) {
      void this.opsAlert?.alertOnCriticalError(error, 'GuestChatService.chatSync');
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
  private getRedisKey(sessionId: string): string {
    return `kloel:guest-chat:${sessionId}`;
  }

  private parseConversation(raw: string | null): GuestConversation | null {
    if (!raw) {
      return null;
    }
    try {
      const parsed = JSON.parse(raw) as {
        messages?: GuestConversation['messages'];
        createdAt?: string;
        lastMessageAt?: string;
      };
      if (!Array.isArray(parsed.messages)) {
        return null;
      }
      return {
        messages: parsed.messages,
        createdAt: parsed.createdAt ? new Date(parsed.createdAt) : new Date(),
        lastMessageAt: parsed.lastMessageAt ? new Date(parsed.lastMessageAt) : new Date(),
      };
    } catch {
      return null;
    }
  }

  private async getOrCreateConversation(sessionId: string): Promise<GuestConversation> {
    const cached = this.conversations.get(sessionId);
    if (cached) {
      return cached;
    }

    if (this.redis) {
      try {
        const stored = this.parseConversation(await this.redis.get(this.getRedisKey(sessionId)));
        if (stored) {
          this.conversations.set(sessionId, stored);
          return stored;
        }
      } catch (error: unknown) {
        this.logger.warn(
          `Guest chat Redis read failed (${error instanceof Error ? error.message : 'unknown_error'}). Falling back to local cache.`,
        );
      }
    }

    const created: GuestConversation = {
      messages: [],
      createdAt: new Date(),
      lastMessageAt: new Date(),
    };
    this.conversations.set(sessionId, created);
    return created;
  }

  private async persistConversation(
    sessionId: string,
    conversation: GuestConversation,
  ): Promise<void> {
    this.conversations.set(sessionId, conversation);
    if (!this.redis) {
      return;
    }
    try {
      await this.redis.set(
        this.getRedisKey(sessionId),
        JSON.stringify(conversation),
        'EX',
        GUEST_CONVERSATION_TTL_SECONDS,
      );
    } catch (error: unknown) {
      this.logger.warn(
        `Guest chat Redis write failed (${error instanceof Error ? error.message : 'unknown_error'}). Continuing with local cache.`,
      );
    }
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
