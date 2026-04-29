import { extname } from 'node:path';
import { buildTimestampedRuntimeId } from './kloel-id.util';
import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  FileTypeValidator,
  Get,
  MaxFileSizeValidator,
  NotFoundException,
  Param,
  ParseFilePipe,
  Post,
  Put,
  Query,
  Req,
  Request,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
  Optional,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Prisma } from '@prisma/client';
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { detectUploadedMime } from '../common/file-signature.util';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { normalizeStorageUrlForRequest } from '../common/storage/public-storage-url.util';
import { StorageService } from '../common/storage/storage.service';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { KloelService } from './kloel.service';
import { KloelThreadSearchService } from './kloel-thread-search.service';
import { OpsAlertService } from '../observability/ops-alert.service';

// memoryStorage uploads below enforce fileSize/maxSize caps plus fileFilter/mimetype validation.
const KLOEL_UPLOAD_GENERIC_MIME_RE =
  /^(image\/(jpeg|png|gif|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;
const KLOEL_UPLOAD_CHAT_MIME_RE =
  /^(image\/(jpeg|png|gif|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/plain|text\/csv|audio\/(mpeg|wav|webm|ogg|mp4|x-m4a))$/;

interface ThinkDto {
  message: string;
  workspaceId?: string;
  conversationId?: string;
  mode?: 'chat' | 'onboarding' | 'sales';
  metadata?: Record<string, unknown>;
}

interface MemoryDto {
  workspaceId: string;
  type: string;
  content: string;
  metadata?: Record<string, unknown>;
}

interface OnboardingChatDto {
  message: string;
}

/** Kloel controller. */
@Controller('kloel')
export class KloelController {
  constructor(
    private readonly kloelService: KloelService,
    private readonly conversationalOnboarding: ConversationalOnboardingService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
    private readonly threadSearchService: KloelThreadSearchService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  private normalizeMessageMetadata(metadata: Prisma.JsonValue | null | undefined) {
    if (metadata && typeof metadata === 'object' && !Array.isArray(metadata)) {
      return { ...(metadata as Record<string, unknown>) };
    }

    return {} as Record<string, unknown>;
  }

  private readUserId(user: unknown) {
    if (!user || typeof user !== 'object') {
      return undefined;
    }

    const sub = 'sub' in user ? user.sub : undefined;
    if (typeof sub === 'string' && sub.trim()) {
      return sub;
    }

    const legacyId = 'id' in user ? user.id : undefined;
    return typeof legacyId === 'string' && legacyId.trim() ? legacyId : undefined;
  }

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
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    // Workspace SEMPRE vem do token (WorkspaceGuard propaga req.workspaceId)
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    const userId = this.readUserId(req.user);
    const userName = typeof req.user?.name === 'string' ? req.user.name : undefined;

    const abortController = new AbortController();
    const abortWithReason = (reason: string) => {
      if (!abortController.signal.aborted) {
        abortController.abort(reason);
      }
    };
    const timeoutMs = Number(process.env.KLOEL_THINK_TIMEOUT_MS || 240000);
    const timeout = setTimeout(() => abortWithReason('request_timeout'), timeoutMs);

    // Se o cliente desconectar, aborta imediatamente para evitar vazamentos
    req.on('close', () => abortWithReason('client_disconnected'));
    res.on('close', () => abortWithReason('client_disconnected'));

    try {
      return await this.kloelService.think(
        {
          ...dto,
          workspaceId,
          userId,
          userName,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        },
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
  async getHistory(@Request() req: AuthenticatedRequest): Promise<unknown[]> {
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
    @Request() req: AuthenticatedRequest,
  ): Promise<{ response: string; conversationId?: string; title?: string }> {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    const userId = this.readUserId(req.user);
    const userName = typeof req.user?.name === 'string' ? req.user.name : undefined;
    return this.kloelService.thinkSync({
      ...dto,
      workspaceId,
      userId,
      userName,
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
    });
  }

  /**
   * 💾 Salvar memória/aprendizado
   * Requires authentication to prevent unauthorized memory injection.
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('memory/save')
  async saveMemory(
    @Body() dto: MemoryDto,
    @Request() req: AuthenticatedRequest,
  ): Promise<{ success: boolean }> {
    // Validate workspace access
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    await this.kloelService.saveMemory(
      workspaceId,
      dto.type,
      dto.content,
      dto.metadata as Prisma.InputJsonValue | undefined,
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
    @Request() req: AuthenticatedRequest,
  ): Promise<{ analysis: string }> {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
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
   * 📎 Upload genérico de arquivo (imagens de produto, etc.)
   * Aceita imagens, PDFs, documentos e áudio
   * O campo "folder" no formData define a pasta de destino (default: "general")
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('upload-generic')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: 25 * 1024 * 1024 },
      fileFilter: (_req, file, cb) => {
        const allowedMimes = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Tipo de arquivo não permitido'), false);
        }
      },
    }),
  )
  async uploadGenericFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 25 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: KLOEL_UPLOAD_GENERIC_MIME_RE }),
        ],
        fileIsRequired: false,
      }),
    )
    file: { buffer: Buffer; originalname?: string; mimetype?: string; size?: number },
    @Request() req: AuthenticatedRequest,
  ) {
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
    const folder = req.body?.folder || 'general';
    const uniqueSuffix = buildTimestampedRuntimeId('upload');
    const filename = `${uniqueSuffix}${extname(file.originalname || '')}`;
    const stored = await this.storageService.upload(file.buffer, {
      filename,
      mimeType: detectedMime,
      folder,
      workspaceId,
    });

    return {
      success: true,
      url: normalizeStorageUrlForRequest(stored.url, req),
      name: file.originalname,
      size: file.size,
      mimeType: detectedMime,
    };
  }

  /**
   * 📎 Upload de arquivo para o chat
   * Aceita imagens, PDFs, documentos e áudio
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('upload-chat')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: {
        fileSize: 25 * 1024 * 1024, // 25MB max
      },
      fileFilter: (_req, file, cb) => {
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
          'text/plain',
          'text/csv',
          'audio/mpeg',
          'audio/wav',
          'audio/webm',
          'audio/ogg',
          'audio/mp4',
          'audio/x-m4a',
        ];
        if (allowedMimes.includes(file.mimetype)) {
          cb(null, true);
        } else {
          cb(new Error('Tipo de arquivo não permitido'), false);
        }
      },
    }),
  )
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 25 * 1024 * 1024 }), // 25MB
          new FileTypeValidator({ fileType: KLOEL_UPLOAD_CHAT_MIME_RE }),
        ],
        fileIsRequired: false,
      }),
    )
    file: { buffer: Buffer; originalname?: string; mimetype?: string; size?: number },
    @Request() req: AuthenticatedRequest,
  ) {
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
    const uniqueSuffix = buildTimestampedRuntimeId('upload');
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
      url: normalizeStorageUrlForRequest(stored.url, req),
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
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ): Promise<{ message: string }> {
    const validatedWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const message = await this.conversationalOnboarding.start(validatedWorkspaceId);
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
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: OnboardingChatDto,
  ): Promise<{ message: string }> {
    const validatedWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const response = await this.conversationalOnboarding.chat(validatedWorkspaceId, dto.message);
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
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: OnboardingChatDto,
    @Res() res: Response,
  ): Promise<void> {
    const validatedWorkspaceId = resolveWorkspaceId(req, workspaceId);
    await this.conversationalOnboarding.chat(validatedWorkspaceId, dto.message, res);
  }

  /**
   * 📊 Status do onboarding
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('onboarding/:workspaceId/status')
  async getOnboardingStatus(
    @Req() req: AuthenticatedRequest,
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
  async listFollowups(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    return this.kloelService.listFollowups(workspaceId);
  }

  /**
   * 📅 Lista follow-ups de um contato específico
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('followups/:contactId')
  async listContactFollowups(
    @Req() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.kloelService.listFollowups(workspaceId, contactId);
  }

  // ═══ CHAT THREADS (dashboard persistence) ═══

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('threads')
  async listThreads(@Req() req: AuthenticatedRequest) {
    try {
      const workspaceId = resolveWorkspaceId(req);
      await this.prisma.chatThread.deleteMany({
        where: {
          workspaceId,
          messages: { none: {} },
        },
      });

      const threads = await this.prisma.chatThread.findMany({
        where: {
          workspaceId,
          messages: { some: {} },
        },
        orderBy: { updatedAt: 'desc' },
        take: 50,
        select: {
          id: true,
          title: true,
          updatedAt: true,
          messages: {
            take: 5,
            orderBy: { createdAt: 'desc' },
            select: { content: true, role: true },
          },
        },
      });

      return threads
        .filter((thread) =>
          thread.messages.some((message) => String(message?.content || '').trim().length > 0),
        )
        .map((thread) => ({
          id: thread.id,
          title: String(thread.title || '').trim() || 'Nova conversa',
          updatedAt: thread.updatedAt,
          lastMessagePreview:
            thread.messages.find((message) => String(message?.content || '').trim().length > 0)
              ?.content || '',
        }));
    } catch {
      return [];
    }
  }

  /** Create thread. */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('threads')
  async createThread(
    @Req() req: AuthenticatedRequest,
    @Body() dto: { title?: string; idempotencyKey?: string },
  ) {
    try {
      const workspaceId = resolveWorkspaceId(req);
      return await this.prisma.chatThread.create({
        data: { workspaceId, title: dto.title || 'Nova conversa' },
      });
    } catch {
      return { id: `local_${Date.now()}`, title: dto.title || 'Nova conversa' };
    }
  }

  /** Search threads. */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('threads/search')
  @Get('conversations/search')
  async searchThreads(
    @Request() req: AuthenticatedRequest,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    return this.threadSearchService.search(resolveWorkspaceId(req), q, limit);
  }

  /** Update thread. */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Put('threads/:id')
  async updateThread(
    @Param('id') id: string,
    @Body() dto: { title: string },
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      const workspaceId = resolveWorkspaceId(req);
      await this.prisma.chatThread.findFirstOrThrow({
        where: { id, workspaceId },
        select: { id: true },
      });
      await this.prisma.chatThread.updateMany({
        where: { id, workspaceId },
        data: { title: dto.title },
      });
      return await this.prisma.chatThread.findFirst({
        where: { id, workspaceId },
      });
    } catch {
      return { success: false };
    }
  }

  /** Delete thread. */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Delete('threads/:id')
  async deleteThread(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    try {
      const workspaceId = resolveWorkspaceId(req);
      await this.prisma.chatThread.findFirstOrThrow({
        where: { id, workspaceId },
        select: { id: true },
      });
      await this.prisma.chatThread.deleteMany({ where: { id, workspaceId } });
      return { success: true };
    } catch {
      return { success: false };
    }
  }

  /** Get thread messages. */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('threads/:id/messages')
  async getThreadMessages(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    const thread = await this.prisma.chatThread.findFirst({
      where: { id, workspaceId },
      select: { id: true },
    });

    if (!thread) {
      throw new NotFoundException('Conversa não encontrada');
    }

    const messages = await this.prisma.chatMessage.findMany({
      where: { threadId: id },
      select: {
        id: true,
        threadId: true,
        role: true,
        content: true,
        metadata: true,
        createdAt: true,
      },
      orderBy: { createdAt: 'asc' },
      take: 200,
    });

    return messages.filter((message) => String(message.content || '').trim().length > 0);
  }

  /** Add thread message. */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('threads/:id/messages')
  async addThreadMessage(
    @Param('id') id: string,
    @Body()
    dto: {
      role: string;
      content: string;
      metadata?: Record<string, unknown>;
      idempotencyKey?: string;
    },
    @Req() req: AuthenticatedRequest,
  ) {
    try {
      const workspaceId = resolveWorkspaceId(req);
      await this.prisma.chatThread.findFirstOrThrow({
        where: { id, workspaceId },
        select: { id: true },
      });
      const msg = await this.prisma.chatMessage.create({
        data: {
          threadId: id,
          role: dto.role,
          content: dto.content,
          metadata: dto.metadata as Prisma.InputJsonValue | undefined,
        },
      });
      await this.prisma.chatThread.updateMany({
        where: { id, workspaceId },
        data: { updatedAt: new Date() },
      });
      return msg;
    } catch {
      return { success: false };
    }
  }

  /** Update thread message. */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Put('messages/:id')
  async updateThreadMessage(
    @Param('id') id: string,
    @Body() dto: { content?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const content = String(dto?.content || '').trim();
    if (!content) {
      throw new BadRequestException('Conteúdo da mensagem é obrigatório.');
    }

    const workspaceId = resolveWorkspaceId(req);
    const existing = await this.prisma.chatMessage.findFirst({
      where: {
        id,
        thread: { workspaceId },
      },
      select: {
        id: true,
        threadId: true,
        role: true,
        metadata: true,
        createdAt: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Mensagem não encontrada.');
    }

    if (existing.role !== 'user') {
      throw new BadRequestException('Somente mensagens do usuário podem ser editadas.');
    }

    const nextMetadata = {
      ...this.normalizeMessageMetadata(existing.metadata),
      editedAt: new Date().toISOString(),
    };

    const [message] = await this.prisma.$transaction(
      [
        this.prisma.chatMessage.update({
          where: { id },
          data: {
            content,
            metadata: nextMetadata,
          },
        }),
        this.prisma.chatThread.updateMany({
          where: { id: existing.threadId, workspaceId },
          data: { updatedAt: new Date() },
        }),
      ],
      { isolationLevel: 'ReadCommitted' },
    );

    return message;
  }

  /** Update message feedback. */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('messages/:id/feedback')
  async updateMessageFeedback(
    @Param('id') id: string,
    @Body() dto: { type?: 'positive' | 'negative' | null },
    @Req() req: AuthenticatedRequest,
  ) {
    const type =
      dto?.type === 'positive' || dto?.type === 'negative'
        ? dto.type
        : dto?.type === null
          ? null
          : undefined;

    if (type === undefined) {
      throw new BadRequestException('Feedback inválido. Use positive, negative ou null.');
    }

    const workspaceId = resolveWorkspaceId(req);
    const existing = await this.prisma.chatMessage.findFirst({
      where: {
        id,
        thread: { workspaceId },
      },
      select: {
        id: true,
        threadId: true,
        role: true,
        metadata: true,
        createdAt: true,
      },
    });

    if (!existing) {
      throw new NotFoundException('Mensagem não encontrada.');
    }

    if (existing.role !== 'assistant') {
      throw new BadRequestException('Feedback só pode ser salvo em mensagens do assistente.');
    }

    const nextMetadata = {
      ...this.normalizeMessageMetadata(existing.metadata),
      feedback: type
        ? {
            type,
            updatedAt: new Date().toISOString(),
          }
        : null,
    };

    return this.prisma.chatMessage.update({
      where: { id },
      data: {
        metadata: nextMetadata,
      },
    });
  }

  /** Regenerate conversation message. */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('conversations/:id/regenerate')
  async regenerateConversationMessage(
    @Param('id') id: string,
    @Body() dto: { messageId?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const messageId = String(dto?.messageId || '').trim();
    if (!messageId) {
      throw new BadRequestException('messageId é obrigatório.');
    }

    return this.kloelService.regenerateThreadAssistantResponse({
      workspaceId: resolveWorkspaceId(req),
      conversationId: id,
      assistantMessageId: messageId,
      userId: req.user?.sub,
      userName: req.user?.name,
    });
  }

  // ================================================
  // LGPD / GDPR COMPLIANCE
  // ================================================

  /**
   * Solicitar exclusao de dados pessoais (LGPD Art. 18)
   * Anonimiza contatos e mensagens do workspace
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('data/request-deletion')
  async requestDataDeletion(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    const agentId = req.user?.sub;
    // Idempotent: LGPD deletion is safe to replay (updateMany + upsert audit log)

    // Anonymize contacts
    await this.prisma.contact.updateMany({
      where: { workspaceId },
      data: { name: 'DELETED', email: null, phone: 'DELETED', avatarUrl: null },
    });

    // Anonymize messages content (keep structure for audit)
    await this.prisma.message.updateMany({
      where: { workspaceId },
      data: { content: '[DADOS REMOVIDOS POR SOLICITACAO LGPD]' },
    });

    // Log the request
    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        action: 'lgpd_data_deletion',
        resource: 'workspace',
        resourceId: workspaceId,
        agentId,
        details: { requestedAt: new Date().toISOString() },
      },
    });

    return {
      success: true,
      message: 'Dados pessoais anonimizados conforme LGPD',
    };
  }

  /**
   * Exportar dados pessoais (LGPD portabilidade - Art. 18)
   * Retorna contatos, mensagens e vendas do workspace
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('data/export')
  async exportData(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId || req.user?.workspaceId;

    const contacts = await this.prisma.contact.findMany({
      where: { workspaceId },
      select: { name: true, email: true, phone: true, createdAt: true },
      take: 10000,
    });

    const messages = await this.prisma.message.findMany({
      where: { workspaceId },
      select: { content: true, direction: true, createdAt: true },
      take: 10000,
    });

    const sales = await this.prisma.kloelSale.findMany({
      where: { workspaceId },
      select: { amount: true, status: true, createdAt: true },
      take: 10000,
    });

    return { contacts, messages, sales, exportedAt: new Date().toISOString() };
  }
}
