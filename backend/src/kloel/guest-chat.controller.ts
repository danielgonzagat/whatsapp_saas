import { Controller, Post, Body, Res, Get, Headers, Logger } from '@nestjs/common';
import { Response } from 'express';
import { Public } from '../auth/public.decorator';
import { GuestChatService } from './guest-chat.service';

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
 */
@Controller('chat')
export class GuestChatController {
  private readonly logger = new Logger(GuestChatController.name);

  constructor(private readonly guestChatService: GuestChatService) {}

  /**
   * 💬 Chat público para visitantes
   * Não requer autenticação, usa sessionId para contexto
   */
  @Public()
  @Post('guest')
  async guestChat(
    @Body() dto: GuestChatDto,
    @Res() res: Response,
    @Headers('x-session-id') headerSessionId?: string,
  ): Promise<void> {
    const sessionId = dto.sessionId || headerSessionId || this.generateSessionId();
    
    this.logger.log(`Guest chat: session=${sessionId}, message="${dto.message.substring(0, 50)}..."`);
    
    return this.guestChatService.chat(dto.message, sessionId, res);
  }

  /**
   * 🔄 Chat síncrono (sem streaming) para visitantes
   */
  @Public()
  @Post('guest/sync')
  async guestChatSync(
    @Body() dto: GuestChatDto,
    @Headers('x-session-id') headerSessionId?: string,
  ): Promise<{ reply: string; sessionId: string }> {
    const sessionId = dto.sessionId || headerSessionId || this.generateSessionId();
    
    this.logger.log(`Guest chat sync: session=${sessionId}`);
    
    const reply = await this.guestChatService.chatSync(dto.message, sessionId);
    return { reply, sessionId };
  }

  /**
   * 🆔 Gerar nova sessão para visitante
   */
  @Public()
  @Get('guest/session')
  getSession(): { sessionId: string } {
    return { sessionId: this.generateSessionId() };
  }

  /**
   * 🔥 Health check público
   */
  @Public()
  @Get('guest/health')
  health(): { status: string; mode: string } {
    return {
      status: 'online',
      mode: 'guest',
    };
  }

  private generateSessionId(): string {
    return `guest_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}
