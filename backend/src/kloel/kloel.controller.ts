import {
  Controller,
  Post,
  Put,
  Delete,
  Body,
  Res,
  Get,
  Param,
  Query,
  Headers,
  UseGuards,
  Request,
  Req,
  UseInterceptors,
  UploadedFile,
} from '@nestjs/common';
import { Response } from 'express';
import { FileInterceptor } from '@nestjs/platform-express';
import { memoryStorage } from 'multer';
import { extname } from 'path';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { KloelService } from './kloel.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { Public } from '../auth/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { StorageService } from '../common/storage/storage.service';
import { detectUploadedMime } from '../common/file-signature.util';

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
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
  ) {}

  /**
   * 🧠 KLOEL THINK - Endpoint principal de chat com streaming
   * Retorna SSE (Server-Sent Events) em tempo real
   *
   * Requires authentication for multi-tenancy.
   * workspaceId is extracted from JWT token if not provided.
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('think')
  async think(
    @Body() dto: ThinkDto,
    @Res() res: Response,
    @Request() req: any,
  ): Promise<void> {
    // Workspace SEMPRE vem do token (WorkspaceGuard propaga req.workspaceId)
    const workspaceId = req.workspaceId || req.user?.workspaceId;

    const abortController = new AbortController();
    const timeoutMs = Number(process.env.KLOEL_THINK_TIMEOUT_MS || 60000);
    const timeout = setTimeout(() => abortController.abort(), timeoutMs);

    // Se o cliente desconectar, aborta imediatamente para evitar vazamentos
    req.on('close', () => abortController.abort());
    res.on('close', () => abortController.abort());

    try {
      return await this.kloelService.think(
        { ...dto, workspaceId, userId: req.user?.id },
        res,
        {
        signal: abortController.signal,
        timeoutMs,
        },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 📜 Obter histórico do chat
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('history')
  async getHistory(@Request() req: any): Promise<any[]> {
    const workspaceId = req.user?.workspaceId;
    return this.kloelService.getHistory(workspaceId);
  }

  /**
   * 🧠 KLOEL THINK SYNC - Versão sem streaming
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('think/sync')
  async thinkSync(
    @Body() dto: ThinkDto,
    @Request() req: any,
  ): Promise<{ response: string }> {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    const response = await this.kloelService.thinkSync({
      ...dto,
      workspaceId,
      userId: req.user?.id,
    });
    return { response };
  }

  /**
   * 💾 Salvar memória/aprendizado
   * Requires authentication to prevent unauthorized memory injection.
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('memory/save')
  async saveMemory(
    @Body() dto: MemoryDto,
    @Request() req: any,
  ): Promise<{ success: boolean }> {
    // Validate workspace access
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    await this.kloelService.saveMemory(
      workspaceId,
      dto.type,
      dto.content,
      dto.metadata,
    );
    return { success: true };
  }

  /**
   * 📄 Processar PDF
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('pdf/process')
  async processPdf(
    @Body() dto: { workspaceId: string; content: string },
    @Request() req: any,
  ): Promise<{ analysis: string }> {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    const analysis = await this.kloelService.processPdf(
      workspaceId,
      dto.content,
    );
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
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('upload')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 25 * 1024 * 1024, // 25MB max
      },
      fileFilter: (req, file, cb) => {
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'audio/mpeg',
          'audio/wav',
          'audio/webm',
          'audio/ogg',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Tipo de arquivo não permitido'), false);
        }
      },
    }),
  )
  async uploadFile(@UploadedFile() file: any, @Request() req: any) {
    if (!file) {
      return { success: false, error: 'Nenhum arquivo enviado' };
    }

    const detectedMime = detectUploadedMime(file);
    if (!detectedMime) {
      return {
        success: false,
        error: 'Tipo de arquivo não permitido ou assinatura inválida',
      };
    }
    file.mimetype = detectedMime;

    const workspaceId = req.workspaceId || req.user?.workspaceId;
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const filename = `${uniqueSuffix}${extname(file.originalname || '')}`;
    const stored = await this.storageService.upload(file.buffer, {
      filename,
      mimeType: detectedMime,
      folder: 'chat',
      workspaceId,
    });

    // Determinar tipo do arquivo
    let fileType: 'image' | 'document' | 'audio' = 'document';
    if (detectedMime.startsWith('image/')) {
      fileType = 'image';
    } else if (detectedMime.startsWith('audio/')) {
      fileType = 'audio';
    }

    return {
      success: true,
      url: stored.url,
      type: fileType,
      name: file.originalname,
      size: file.size,
      mimeType: detectedMime,
    };
  }

  // ================================================
  // ONBOARDING CONVERSACIONAL COM IA
  // ================================================

  /**
   * 🚀 Iniciar onboarding conversacional
   * A IA dá boas-vindas e começa a coletar informações
   *
   * Requer autenticação: onboarding persiste dados do workspace.
   * Mantém workspaceId na URL apenas para compatibilidade,
   * mas valida que pertence ao usuário autenticado.
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('onboarding/:workspaceId/start')
  async startConversationalOnboarding(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
  ): Promise<{ message: string }> {
    const validatedWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const message =
      await this.conversationalOnboarding.start(validatedWorkspaceId);
    return { message };
  }

  /**
   * 💬 Enviar mensagem no onboarding conversacional
   * A IA processa, extrai informações e configura automaticamente
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('onboarding/:workspaceId/chat')
  async chatOnboarding(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: OnboardingChatDto,
  ): Promise<{ message: string }> {
    const validatedWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const response = await this.conversationalOnboarding.chat(
      validatedWorkspaceId,
      dto.message,
    );
    return { message: response as string };
  }

  /**
   * 💬 Enviar mensagem no onboarding conversacional com SSE (streaming)
   * A IA processa, extrai informações e configura automaticamente
   * Retorna Server-Sent Events em tempo real
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('onboarding/:workspaceId/chat/stream')
  async chatOnboardingStream(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: OnboardingChatDto,
    @Res() res: Response,
  ): Promise<void> {
    const validatedWorkspaceId = resolveWorkspaceId(req, workspaceId);
    await this.conversationalOnboarding.chat(
      validatedWorkspaceId,
      dto.message,
      res,
    );
  }

  /**
   * 📊 Status do onboarding
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('onboarding/:workspaceId/status')
  async getOnboardingStatus(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
  ) {
    const validatedWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.conversationalOnboarding.getStatus(validatedWorkspaceId);
  }

  /**
   * 📅 Lista follow-ups programados do workspace
   * Retorna todos os follow-ups agendados, pendentes e executados
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('followups')
  async listFollowups(@Req() req: any) {
    const workspaceId = resolveWorkspaceId(req);
    return this.kloelService.listFollowups(workspaceId);
  }

  /**
   * 📅 Lista follow-ups de um contato específico
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('followups/:contactId')
  async listContactFollowups(
    @Req() req: any,
    @Param('contactId') contactId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.kloelService.listFollowups(workspaceId, contactId);
  }

  // ═══ CHAT THREADS (dashboard persistence) ═══

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('threads')
  async listThreads(@Req() req: any) {
    try {
      const workspaceId = resolveWorkspaceId(req);
      return await this.prisma.chatThread.findMany({
        where: { workspaceId },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: { id: true, title: true, updatedAt: true, messages: { take: 1, orderBy: { createdAt: 'desc' }, select: { content: true, role: true } } },
      });
    } catch {
      return [];
    }
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('threads')
  async createThread(@Req() req: any, @Body() dto: { title?: string }) {
    try {
      const workspaceId = resolveWorkspaceId(req);
      return await this.prisma.chatThread.create({ data: { workspaceId, title: dto.title || 'Nova conversa' } });
    } catch { return { id: 'local_' + Date.now(), title: dto.title || 'Nova conversa' }; }
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('threads/search')
  async searchThreads(@Request() req: any, @Query('q') q: string) {
    const workspaceId = req.user?.workspaceId;
    if (!workspaceId || !q || q.length < 3) return [];
    const messages = await this.prisma.chatMessage.findMany({
      where: {
        thread: { workspaceId },
        content: { contains: q, mode: 'insensitive' },
      },
      select: {
        threadId: true,
        content: true,
        thread: { select: { id: true, title: true, updatedAt: true } },
      },
      take: 20,
      orderBy: { createdAt: 'desc' },
    });
    const seen = new Set<string>();
    return messages
      .filter(m => { if (seen.has(m.threadId)) return false; seen.add(m.threadId); return true; })
      .map(m => ({ id: m.thread.id, title: m.thread.title, updatedAt: m.thread.updatedAt, matchedContent: m.content.slice(0, 100) }));
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Put('threads/:id')
  async updateThread(@Param('id') id: string, @Body() dto: { title: string }) {
    try { return await this.prisma.chatThread.update({ where: { id }, data: { title: dto.title } }); }
    catch { return { success: false }; }
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Delete('threads/:id')
  async deleteThread(@Param('id') id: string) {
    try { return await this.prisma.chatThread.delete({ where: { id } }); }
    catch { return { success: false }; }
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('threads/:id/messages')
  async getThreadMessages(@Param('id') id: string) {
    try {
      return await this.prisma.chatMessage.findMany({ where: { threadId: id }, orderBy: { createdAt: 'asc' } });
    } catch { return []; }
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('threads/:id/messages')
  async addThreadMessage(
    @Param('id') id: string,
    @Body() dto: { role: string; content: string; metadata?: any },
  ) {
    try {
      const msg = await this.prisma.chatMessage.create({
        data: { threadId: id, role: dto.role, content: dto.content, metadata: dto.metadata },
      });
      await this.prisma.chatThread.update({ where: { id }, data: { updatedAt: new Date() } });
      return msg;
    } catch { return { success: false }; }
  }
}
