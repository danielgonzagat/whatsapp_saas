import { Controller, Post, Body, Res, Get, Param, Headers } from '@nestjs/common';
import { Response } from 'express';
import { KloelService } from './kloel.service';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { Public } from '../auth/public.decorator';

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
   */
  @Public()
  @Post('think')
  async think(@Body() dto: ThinkDto, @Res() res: Response): Promise<void> {
    return this.kloelService.think(dto, res);
  }

  /**
   * 🧠 KLOEL THINK SYNC - Versão sem streaming
   */
  @Public()
  @Post('think/sync')
  async thinkSync(@Body() dto: ThinkDto): Promise<{ response: string }> {
    const response = await this.kloelService.thinkSync(dto);
    return { response };
  }

  /**
   * 💾 Salvar memória/aprendizado
   */
  @Post('memory/save')
  async saveMemory(@Body() dto: MemoryDto): Promise<{ success: boolean }> {
    await this.kloelService.saveMemory(dto.workspaceId, dto.type, dto.content, dto.metadata);
    return { success: true };
  }

  /**
   * 📄 Processar PDF
   */
  @Post('pdf/process')
  async processPdf(
    @Body() dto: { workspaceId: string; content: string },
  ): Promise<{ analysis: string }> {
    const analysis = await this.kloelService.processPdf(dto.workspaceId, dto.content);
    return { analysis };
  }

  /**
   * 🔥 Health check da KLOEL
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
