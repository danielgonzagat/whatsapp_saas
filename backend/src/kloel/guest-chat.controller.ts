import { randomUUID } from 'node:crypto';
import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Headers,
  Post,
  Req,
  Res,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { StructuredLogger } from '../logging/structured-logger';
import { Request, Response } from 'express';
import { Public } from '../auth/public.decorator';
import { GuestChatService } from './guest-chat.service';

import { RouteClass } from '../common/throttler/route-class.decorator';
interface GuestChatDto {
  message: string;
  sessionId?: string; // Para manter contexto entre mensagens
  workspaceId?: string; // Para usar o Unified Agent com tools (opcional)
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
@RouteClass('ai')
export class GuestChatController {
  private readonly logger = StructuredLogger.from(GuestChatController.name);

  constructor(private readonly guestChatService: GuestChatService) {}

  /**
   * 💬 Chat público para visitantes
   * Não requer autenticação, usa sessionId para contexto
   * Rate limit: 10 req/min para evitar abuso da API OpenAI
   */
  @Public()
  @Post('guest')
  async guestChat(
    @Body() dto: GuestChatDto,
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-session-id') headerSessionId?: string,
  ): Promise<void> {
    this.assertGuestChatEnabledOrThrow();
    const sessionId = dto.sessionId || headerSessionId || this.generateSessionId();

    this.logger.log(`Guest chat: session=${sessionId}, origin=${req.headers.origin}`);

    return this.guestChatService.chat(dto.message, sessionId, req, res);
  }

  /**
   * 🔄 Chat síncrono (sem streaming) para visitantes
   * Rate limit: 10 req/min para evitar abuso da API OpenAI
   */
  @Public()
  @Post('guest/sync')
  async guestChatSync(
    @Body() dto: GuestChatDto,
    @Req() req: Request,
    @Res() res: Response,
    @Headers('x-session-id') headerSessionId?: string,
  ): Promise<void> {
    this.assertGuestChatEnabledOrThrow();
    const sessionId = dto.sessionId || headerSessionId || this.generateSessionId();

    this.logger.log(`Guest chat sync: session=${sessionId}, origin=${req.headers.origin}`);

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

    const reply = await this.guestChatService.chatSync(dto.message, sessionId, dto.workspaceId);
    res.json({ reply, sessionId });
  }

  /**
   * 🆔 Gerar nova sessão para visitante
   */
  @Public()
  @Get('guest/session')
  getSession(): { sessionId: string } {
    this.assertGuestChatEnabledOrThrow();
    return { sessionId: this.generateSessionId() };
  }

  /**
   * 🔥 Health check público
   */

  /** 📎 Upload de arquivo/imagem via chat */
  @Public()
  @Post('guest/upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 10 * 1024 * 1024 } }))
  async guestUpload(
    @UploadedFile() file: Express.Multer.File,
    @Body('productName') productName?: string,
    @Body('workspaceId') workspaceId?: string,
  ): Promise<{ url?: string; message: string }> {
    this.assertGuestChatEnabledOrThrow();
    if (!file) {return { message: 'Nenhum arquivo enviado.' };}
    try {
      const result = await this.guestChatService.handleFileUpload(
        file.buffer, file.originalname, file.mimetype,
        workspaceId || '',
        productName || '',
      );
      return result;
    } catch {
      return { message: 'Erro ao processar upload.' };
    }
  }
  @Public()
  @Get('guest/health')
  health(): { status: string; mode: string } {
    this.assertGuestChatEnabledOrThrow();
    return {
      status: 'online',
      mode: 'guest',
    };
  }

  private assertGuestChatEnabledOrThrow() {
    const raw = (process.env.GUEST_CHAT_ENABLED ?? 'true').toLowerCase();
    if (raw === 'false') {
      throw new ForbiddenException('guest_chat_disabled');
    }
  }

  private generateSessionId(): string {
    return `guest_${randomUUID()}`;
  }
}
