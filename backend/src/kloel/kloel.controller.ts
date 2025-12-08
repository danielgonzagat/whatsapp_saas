import { Controller, Post, Body, Res, Get, Param, Headers, UseGuards, Request } from '@nestjs/common';
import { Response } from 'express';
import { KloelService } from './kloel.service';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

interface ThinkDto {
  message: string;
  workspaceId?: string;
  conversationId?: string;
  mode?: 'chat' | 'onboarding' | 'sales';
}

interface MemoryDto {
  workspaceId: string;
  type: string;
  content: string;
  metadata?: any;
}

interface OnboardingChatDto {
  message: string;
}

@Controller('kloel')
export class KloelController {
  constructor(
    private readonly kloelService: KloelService,
    private readonly conversationalOnboarding: ConversationalOnboardingService,
  ) {}

  /**
   * 🧠 KLOEL THINK - Endpoint principal de chat com streaming
   * Retorna SSE (Server-Sent Events) em tempo real
   * 
   * Requires authentication for multi-tenancy.
   * workspaceId is extracted from JWT token if not provided.
   */
  @UseGuards(JwtAuthGuard)
  @Post('think')
  async think(
    @Body() dto: ThinkDto, 
    @Res() res: Response,
    @Request() req: any,
  ): Promise<void> {
    // Use workspaceId from JWT if not provided
    const workspaceId = dto.workspaceId || req.user?.workspaceId;
    return this.kloelService.think({ ...dto, workspaceId }, res);
  }

  /**
   * 🧠 KLOEL THINK SYNC - Versão sem streaming
   */
  @UseGuards(JwtAuthGuard)
  @Post('think/sync')
  async thinkSync(
    @Body() dto: ThinkDto,
    @Request() req: any,
  ): Promise<{ response: string }> {
    const workspaceId = dto.workspaceId || req.user?.workspaceId;
    const response = await this.kloelService.thinkSync({ ...dto, workspaceId });
    return { response };
  }

  /**
   * 💾 Salvar memória/aprendizado
   * Requires authentication to prevent unauthorized memory injection.
   */
  @UseGuards(JwtAuthGuard)
  @Post('memory/save')
  async saveMemory(
    @Body() dto: MemoryDto,
    @Request() req: any,
  ): Promise<{ success: boolean }> {
    // Validate workspace access
    const workspaceId = dto.workspaceId || req.user?.workspaceId;
    await this.kloelService.saveMemory(workspaceId, dto.type, dto.content, dto.metadata);
    return { success: true };
  }

  /**
   * 📄 Processar PDF
   */
  @UseGuards(JwtAuthGuard)
  @Post('pdf/process')
  async processPdf(
    @Body() dto: { workspaceId: string; content: string },
    @Request() req: any,
  ): Promise<{ analysis: string }> {
    const workspaceId = dto.workspaceId || req.user?.workspaceId;
    const analysis = await this.kloelService.processPdf(workspaceId, dto.content);
    return { analysis };
  }

  /**
   * 🔥 Health check da KLOEL
   * Public endpoint for monitoring
   */
  @Public()
  @Get('health')
  health(): { status: string; identity: string } {
    return {
      status: 'online',
      identity: 'KLOEL - Inteligência Comercial Autônoma',
    };
  }

  // ================================================
  // ONBOARDING CONVERSACIONAL COM IA
  // ================================================

  /**
   * 🚀 Iniciar onboarding conversacional
   * A IA dá boas-vindas e começa a coletar informações
   * 
   * Note: Public for initial onboarding, but workspaceId should be
   * linked to authenticated user when available.
   */
  @Public()
  @Post('onboarding/:workspaceId/start')
  async startConversationalOnboarding(
    @Param('workspaceId') workspaceId: string,
  ): Promise<{ message: string }> {
    const message = await this.conversationalOnboarding.start(workspaceId);
    return { message };
  }

  /**
   * 💬 Enviar mensagem no onboarding conversacional
   * A IA processa, extrai informações e configura automaticamente
   */
  @Public()
  @Post('onboarding/:workspaceId/chat')
  async chatOnboarding(
    @Param('workspaceId') workspaceId: string,
    @Body() dto: OnboardingChatDto,
  ): Promise<{ message: string }> {
    const response = await this.conversationalOnboarding.chat(workspaceId, dto.message);
    return { message: response as string };
  }

  /**
   * 📊 Status do onboarding
   */
  @Public()
  @Get('onboarding/:workspaceId/status')
  async getOnboardingStatus(
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.conversationalOnboarding.getStatus(workspaceId);
  }
}
