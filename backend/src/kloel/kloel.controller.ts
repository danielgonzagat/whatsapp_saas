import { Controller, Post, Body, Res, Get, Param, Headers, UseGuards, Request, Req, UseInterceptors, UploadedFile } from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { diskStorage } from 'multer';
import { extname } from 'path';
import { KloelService } from './kloel.service';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { ConfigService } from '@nestjs/config';

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
    private readonly configService: ConfigService,
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
   * 📜 Obter histórico do chat
   */
  @UseGuards(JwtAuthGuard)
  @Get('history')
  async getHistory(@Request() req: any): Promise<any[]> {
    const workspaceId = req.user?.workspaceId;
    return this.kloelService.getHistory(workspaceId);
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

  /**
   * 📎 Upload de arquivo para o chat
   * Aceita imagens, PDFs, documentos e áudio
   */
  @UseGuards(JwtAuthGuard)
  @Post('upload')
  @UseInterceptors(FileInterceptor('file', {
    storage: diskStorage({
      destination: './uploads/chat',
      filename: (req, file, cb) => {
        const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
        cb(null, uniqueSuffix + extname(file.originalname));
      },
    }),
    limits: {
      fileSize: 25 * 1024 * 1024, // 25MB max
    },
    fileFilter: (req, file, cb) => {
      const allowedMimes = [
        'image/jpeg', 'image/png', 'image/gif', 'image/webp',
        'application/pdf',
        'application/msword',
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/vnd.ms-excel',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'audio/mpeg', 'audio/wav', 'audio/webm', 'audio/ogg',
      ];
      if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error('Tipo de arquivo não permitido'), false);
      }
    },
  }))
  async uploadFile(
    @UploadedFile() file: any,
    @Request() req: any,
  ) {
    if (!file) {
      return { success: false, error: 'Nenhum arquivo enviado' };
    }

    const baseUrl = this.configService.get('API_URL') || 'http://localhost:3001';
    const fileUrl = `${baseUrl}/uploads/chat/${file.filename}`;

    // Determinar tipo do arquivo
    let fileType: 'image' | 'document' | 'audio' = 'document';
    if (file.mimetype.startsWith('image/')) {
      fileType = 'image';
    } else if (file.mimetype.startsWith('audio/')) {
      fileType = 'audio';
    }

    return {
      success: true,
      url: fileUrl,
      type: fileType,
      name: file.originalname,
      size: file.size,
      mimeType: file.mimetype,
    };
  }

  // ================================================
  // ONBOARDING CONVERSACIONAL COM IA
  // ================================================

  /**
   * 🚀 Iniciar onboarding conversacional
   * A IA dá boas-vindas e começa a coletar informações
   * 
   * @Public porque usuário pode não ter token ainda durante onboarding inicial.
   * Workspace ID vem da URL e é verificado pelo service.
   */
  @Public()
  @Post('onboarding/:workspaceId/start')
  async startConversationalOnboarding(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
  ): Promise<{ message: string }> {
    // Em onboarding público, usa workspaceId do parâmetro diretamente
    // Se autenticado, valida que o workspace pertence ao usuário
    const validatedWorkspaceId = req.user?.workspaceId 
      ? resolveWorkspaceId(req, workspaceId) 
      : workspaceId;
    const message = await this.conversationalOnboarding.start(validatedWorkspaceId);
    return { message };
  }

  /**
   * 💬 Enviar mensagem no onboarding conversacional
   * A IA processa, extrai informações e configura automaticamente
   * 
   * @Public porque usuário pode não ter token ainda durante onboarding inicial.
   */
  @Public()
  @Post('onboarding/:workspaceId/chat')
  async chatOnboarding(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: OnboardingChatDto,
  ): Promise<{ message: string }> {
    const validatedWorkspaceId = req.user?.workspaceId 
      ? resolveWorkspaceId(req, workspaceId) 
      : workspaceId;
    const response = await this.conversationalOnboarding.chat(validatedWorkspaceId, dto.message);
    return { message: response as string };
  }

  /**
   * 📊 Status do onboarding
   * @Public para permitir verificar status sem autenticação
   */
  @Public()
  @Get('onboarding/:workspaceId/status')
  async getOnboardingStatus(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
  ) {
    const validatedWorkspaceId = req.user?.workspaceId 
      ? resolveWorkspaceId(req, workspaceId) 
      : workspaceId;
    return this.conversationalOnboarding.getStatus(validatedWorkspaceId);
  }
}
