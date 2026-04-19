import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Logger,
  Post,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { VisitorChatService } from './guest-chat.service';
import { isVisitorChatEnabled } from './visitor-chat-enabled';

interface VisitorChatDto {
  message: string;
  sessionId?: string; // Para manter contexto entre mensagens
}

/**
 * 🌐 VISITOR CHAT - Chat público sem autenticação
 *
 * Este controller permite que visitantes conversem com o Kloel
 * antes de criar uma conta. A IA atua como vendedor, convertendo
 * visitantes em usuários cadastrados.
 *
 * Funcionalidades:
 * - Chat sem login
 * - Contexto mantido via sessionId (localStorage no frontend)
 * - IA guia naturalmente para criar conta
 * - Sem acesso a features premium (WhatsApp, automações, etc)
 *
 * ⚠️ RATE LIMITING: 10 requisições por minuto por IP
 */
@Controller('chat')
@UseGuards(ThrottlerGuard)
export class VisitorChatController {
  private readonly logger = new Logger(VisitorChatController.name);

  constructor(private readonly visitorChatService: VisitorChatService) {}

  /**
   * 💬 Chat público para visitantes
   * Não requer autenticação, usa sessionId para contexto
   * Rate limit: 10 req/min para evitar abuso da API OpenAI
   */
  @Public()
  @Post(['guest', 'visitor'])
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async visitorChat(
    @Body() dto: VisitorChatDto,
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-session-id') headerSessionId?: string,
  ): Promise<void> {
    this.assertVisitorChatEnabledOrThrow();
    const sessionId = dto.sessionId || headerSessionId || this.generateSessionId();

    this.logger.log(`Visitor chat: session=${sessionId}, origin=${req.headers.origin}`);

    return this.visitorChatService.chat(dto.message, sessionId, req, res);
  }

  /**
   * 🔄 Chat síncrono (sem streaming) para visitantes
   * Rate limit: 10 req/min para evitar abuso da API OpenAI
   */
  @Public()
  @Post(['guest/sync', 'visitor/sync'])
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async visitorChatSync(
    @Body() dto: VisitorChatDto,
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-session-id') headerSessionId?: string,
  ): Promise<void> {
    this.assertVisitorChatEnabledOrThrow();
    const sessionId = dto.sessionId || headerSessionId || this.generateSessionId();

    this.logger.log(`Visitor chat sync: session=${sessionId}, origin=${req.headers.origin}`);

    // CORS manual — obrigatório porque usamos @Res()
    const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : [];
    const requestOrigin = req.headers.origin;
    const corsOrigin =
      allowedOrigins.length > 0 && requestOrigin && allowedOrigins.includes(requestOrigin)
        ? requestOrigin
        : '*';
    res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    if (corsOrigin !== '*') {
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Session-Id, Accept',
    );
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');

    const reply = await this.visitorChatService.chatSync(dto.message, sessionId);
    res.json({ reply, sessionId });
  }

  /**
   * 🆔 Gerar nova sessão para visitante
   */
  @Public()
  @Get(['guest/session', 'visitor/session'])
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  getSession(): { sessionId: string } {
    this.assertVisitorChatEnabledOrThrow();
    return { sessionId: this.generateSessionId() };
  }

  /**
   * 🔥 Health check público
   */
  @Public()
  @Get(['guest/health', 'visitor/health'])
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  health(): { status: string; mode: string } {
    this.assertVisitorChatEnabledOrThrow();
    return {
      status: 'online',
      mode: 'visitor',
    };
  }

  private assertVisitorChatEnabledOrThrow() {
    if (!isVisitorChatEnabled()) {
      throw new ForbiddenException('visitor_chat_disabled');
    }
  }

  private generateSessionId(): string {
    return `visitor_${randomUUID()}`;
  }
}
