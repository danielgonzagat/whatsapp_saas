import {
  Controller,
  Post,
  Body,
  Res,
  Req,
  Get,
  Headers,
  Logger,
  UseGuards,
  ForbiddenException,
} from '@nestjs/common';
import { Response, Request } from 'express';
import { Public } from '../auth/public.decorator';
import { GuestChatService } from './guest-chat.service';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';

interface GuestChatDto {
  message: string;
  sessionId?: string; // Para manter contexto entre mensagens
}

/**
 * 🌐 GUEST CHAT - Chat público sem autenticação
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
export class GuestChatController {
  private readonly logger = new Logger(GuestChatController.name);

  constructor(private readonly guestChatService: GuestChatService) {}

  /**
   * 💬 Chat público para visitantes
   * Não requer autenticação, usa sessionId para contexto
   * Rate limit: 10 req/min para evitar abuso da API OpenAI
   */
  @Public()
  @Post('guest')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async guestChat(
    @Body() dto: GuestChatDto,
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-session-id') headerSessionId?: string,
  ): Promise<void> {
    this.assertGuestChatEnabledOrThrow();
    const sessionId =
      dto.sessionId || headerSessionId || this.generateSessionId();

    this.logger.log(
      `Guest chat: session=${sessionId}, origin=${req.headers.origin}`,
    );

    return this.guestChatService.chat(dto.message, sessionId, req, res);
  }

  /**
   * 🔄 Chat síncrono (sem streaming) para visitantes
   * Rate limit: 10 req/min para evitar abuso da API OpenAI
   */
  @Public()
  @Post('guest/sync')
  @Throttle({ default: { limit: 10, ttl: 60000 } })
  async guestChatSync(
    @Body() dto: GuestChatDto,
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-session-id') headerSessionId?: string,
  ): Promise<void> {
    this.assertGuestChatEnabledOrThrow();
    const sessionId =
      dto.sessionId || headerSessionId || this.generateSessionId();

    this.logger.log(
      `Guest chat sync: session=${sessionId}, origin=${req.headers.origin}`,
    );

    // CORS manual — obrigatório porque usamos @Res()
    const allowedOrigins = process.env.CORS_ALLOWED_ORIGINS
      ? process.env.CORS_ALLOWED_ORIGINS.split(',').map((o) => o.trim())
      : [];
    const requestOrigin = req.headers.origin;
    const corsOrigin =
      allowedOrigins.length > 0 &&
      requestOrigin &&
      allowedOrigins.includes(requestOrigin)
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

    const reply = await this.guestChatService.chatSync(dto.message, sessionId);
    res.json({ reply, sessionId });
  }

  /**
   * 🆔 Gerar nova sessão para visitante
   */
  @Public()
  @Get('guest/session')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  getSession(): { sessionId: string } {
    this.assertGuestChatEnabledOrThrow();
    return { sessionId: this.generateSessionId() };
  }

  /**
   * 🔥 Health check público
   */
  @Public()
  @Get('guest/health')
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  health(): { status: string; mode: string } {
    this.assertGuestChatEnabledOrThrow();
    return {
      status: 'online',
      mode: 'guest',
    };
  }

  private assertGuestChatEnabledOrThrow() {
    const raw = (process.env.GUEST_CHAT_ENABLED ?? 'false').toLowerCase();
    if (process.env.NODE_ENV === 'production' && raw === 'false') {
      throw new ForbiddenException('guest_chat_disabled');
    }
  }

  private generateSessionId(): string {
    return `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
