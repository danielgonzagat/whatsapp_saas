import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
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
import { AuthenticatedRequest } from '../common/interfaces';
import { MaxFileSizeValidator, ParseFilePipe, FileTypeValidator } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { KloelService } from './kloel.service';
import { KloelThreadSearchService } from './kloel-thread-search.service';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { StorageService } from '../common/storage/storage.service';
import { OpsAlertService } from '../observability/ops-alert.service';

import {
  listThreads,
  createThread,
  updateThread,
  deleteThread,
  getThreadMessages,
  addThreadMessage,
  updateThreadMessage,
  updateMessageFeedback,
  handleUploadFile,
  handleUploadChatFile,
  requestDataDeletion,
  exportData,
} from './__companions__/kloel.controller.companion';

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

const KLOEL_UPLOAD_GENERIC_MIME_RE =
  /^(image\/(jpeg|png|gif|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;
const KLOEL_UPLOAD_CHAT_MIME_RE =
  /^(image\/(jpeg|png|gif|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/plain|text\/csv|audio\/(mpeg|wav|webm|ogg|mp4|x-m4a))$/;

const UPLOAD_MAX = 25 * 1024 * 1024;

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

  private readUserId(user: unknown) {
    if (!user || typeof user !== 'object') return undefined;
    const sub = 'sub' in user ? user.sub : undefined;
    if (typeof sub === 'string' && sub.trim()) return sub;
    const legacyId = 'id' in user ? user.id : undefined;
    return typeof legacyId === 'string' && legacyId.trim() ? legacyId : undefined;
  }

  // ═══ THINK ═══

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('think')
  async think(
    @Body() dto: ThinkDto,
    @Res() res: Response,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    const userId = this.readUserId(req.user);
    const userName = typeof req.user?.name === 'string' ? req.user.name : undefined;
    const abortController = new AbortController();
    const abortWithReason = (reason: string) => {
      if (!abortController.signal.aborted) abortController.abort(reason);
    };
    const timeoutMs = Number(process.env.KLOEL_THINK_TIMEOUT_MS || 240000);
    const timeout = setTimeout(() => abortWithReason('request_timeout'), timeoutMs);
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
        { signal: abortController.signal, timeoutMs },
      );
    } finally {
      clearTimeout(timeout);
    }
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('history')
  async getHistory(@Request() req: AuthenticatedRequest): Promise<unknown[]> {
    return this.kloelService.getHistory(req.user?.workspaceId);
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('think/sync')
  async thinkSync(@Body() dto: ThinkDto, @Request() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    return this.kloelService.thinkSync({
      ...dto,
      workspaceId,
      userId: this.readUserId(req.user),
      userName: typeof req.user?.name === 'string' ? req.user.name : undefined,
      metadata: dto.metadata as Prisma.InputJsonValue | undefined,
    });
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('memory/save')
  async saveMemory(@Body() dto: MemoryDto, @Request() req: AuthenticatedRequest) {
    await this.kloelService.saveMemory(
      req.workspaceId || req.user?.workspaceId,
      dto.type,
      dto.content,
      dto.metadata as Prisma.InputJsonValue | undefined,
    );
    return { success: true };
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('pdf/process')
  async processPdf(
    @Body() dto: { workspaceId: string; content: string },
    @Request() req: AuthenticatedRequest,
  ) {
    return {
      analysis: await this.kloelService.processPdf(
        req.workspaceId || req.user?.workspaceId,
        dto.content,
      ),
    };
  }

  @Public()
  @Get('health')
  health() {
    return { status: 'online', identity: 'KLOEL - Inteligência Comercial Autônoma' };
  }

  // ═══ UPLOADS ═══

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('upload-generic')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: UPLOAD_MAX },
      fileFilter: (_req, file, cb) => {
        const allowed = [
          'image/jpeg',
          'image/png',
          'image/gif',
          'image/webp',
          'application/pdf',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        ];
        cb(
          allowed.includes(file.mimetype) ? null : new Error('Tipo de arquivo não permitido'),
          allowed.includes(file.mimetype),
        );
      },
    }),
  )
  async uploadGenericFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: UPLOAD_MAX }),
          new FileTypeValidator({ fileType: KLOEL_UPLOAD_GENERIC_MIME_RE }),
        ],
        fileIsRequired: false,
      }),
    )
    file: { buffer: Buffer; originalname?: string; mimetype?: string; size?: number },
    @Request() req: AuthenticatedRequest,
  ) {
    return handleUploadFile(
      { storage: this.storageService },
      file,
      req.workspaceId || req.user?.workspaceId,
      req.body?.folder || 'general',
      req,
    );
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('upload-chat')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: UPLOAD_MAX },
      fileFilter: (_req, file, cb) => {
        const allowed = [
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
        cb(
          allowed.includes(file.mimetype) ? null : new Error('Tipo de arquivo não permitido'),
          allowed.includes(file.mimetype),
        );
      },
    }),
  )
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: UPLOAD_MAX }),
          new FileTypeValidator({ fileType: KLOEL_UPLOAD_CHAT_MIME_RE }),
        ],
        fileIsRequired: false,
      }),
    )
    file: { buffer: Buffer; originalname?: string; mimetype?: string; size?: number },
    @Request() req: AuthenticatedRequest,
  ) {
    return handleUploadChatFile(
      { storage: this.storageService },
      file,
      req.workspaceId || req.user?.workspaceId,
      req,
    );
  }

  // ═══ ONBOARDING ═══

  @UseGuards(JwtAuthGuard, WorkspaceGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  @Post('onboarding/:workspaceId/start')
  async startConversationalOnboarding(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return {
      message: await this.conversationalOnboarding.start(resolveWorkspaceId(req, workspaceId)),
    };
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('onboarding/:workspaceId/chat')
  async chatOnboarding(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: OnboardingChatDto,
  ) {
    return {
      message: (await this.conversationalOnboarding.chat(
        resolveWorkspaceId(req, workspaceId),
        dto.message,
      )) as string,
    };
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  @Post('onboarding/:workspaceId/chat/stream')
  async chatOnboardingStream(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
    @Body() dto: OnboardingChatDto,
    @Res() res: Response,
  ) {
    await this.conversationalOnboarding.chat(
      resolveWorkspaceId(req, workspaceId),
      dto.message,
      res,
    );
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard, ThrottlerGuard)
  @Throttle({ default: { limit: 30, ttl: 60000 } })
  @Get('onboarding/:workspaceId/status')
  async getOnboardingStatus(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.conversationalOnboarding.getStatus(resolveWorkspaceId(req, workspaceId));
  }

  // ═══ FOLLOWUPS ═══

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('followups')
  async listFollowups(@Req() req: AuthenticatedRequest) {
    return this.kloelService.listFollowups(resolveWorkspaceId(req));
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('followups/:contactId')
  async listContactFollowups(
    @Req() req: AuthenticatedRequest,
    @Param('contactId') contactId: string,
  ) {
    return this.kloelService.listFollowups(resolveWorkspaceId(req), contactId);
  }

  // ═══ THREADS ═══

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('threads')
  async listChatThreads(@Req() req: AuthenticatedRequest) {
    return listThreads({ prisma: this.prisma }, resolveWorkspaceId(req));
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('threads')
  async createChatThread(
    @Req() req: AuthenticatedRequest,
    @Body() dto: { title?: string; idempotencyKey?: string },
  ) {
    return createThread({ prisma: this.prisma }, resolveWorkspaceId(req), dto);
  }

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

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Put('threads/:id')
  async updateChatThread(
    @Param('id') id: string,
    @Body() dto: { title: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return updateThread({ prisma: this.prisma }, id, dto.title, resolveWorkspaceId(req));
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Delete('threads/:id')
  async deleteChatThread(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return deleteThread({ prisma: this.prisma }, id, resolveWorkspaceId(req));
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('threads/:id/messages')
  async getChatThreadMessages(@Param('id') id: string, @Req() req: AuthenticatedRequest) {
    return getThreadMessages({ prisma: this.prisma }, id, resolveWorkspaceId(req));
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('threads/:id/messages')
  async addChatThreadMessage(
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
    return addThreadMessage({ prisma: this.prisma }, id, dto, resolveWorkspaceId(req));
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Put('messages/:id')
  async updateChatThreadMessage(
    @Param('id') id: string,
    @Body() dto: { content?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return updateThreadMessage({ prisma: this.prisma }, id, dto, resolveWorkspaceId(req));
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('messages/:id/feedback')
  async updateChatMessageFeedback(
    @Param('id') id: string,
    @Body() dto: { type?: 'positive' | 'negative' | null },
    @Req() req: AuthenticatedRequest,
  ) {
    return updateMessageFeedback({ prisma: this.prisma }, id, dto, resolveWorkspaceId(req));
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('conversations/:id/regenerate')
  async regenerateConversationMessage(
    @Param('id') id: string,
    @Body() dto: { messageId?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    const messageId = String(dto?.messageId || '').trim();
    if (!messageId) throw new BadRequestException('messageId é obrigatório.');
    return this.kloelService.regenerateThreadAssistantResponse({
      workspaceId: resolveWorkspaceId(req),
      conversationId: id,
      assistantMessageId: messageId,
      userId: req.user?.sub,
      userName: req.user?.name,
    });
  }

  // ═══ LGPD ═══

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('data/request-deletion')
  async handleDataDeletion(@Request() req: AuthenticatedRequest) {
    await requestDataDeletion(
      { prisma: this.prisma },
      req.workspaceId || req.user?.workspaceId,
      req.user?.sub,
    );
    return { success: true, message: 'Dados pessoais anonimizados conforme LGPD' };
  }

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('data/export')
  async handleDataExport(@Request() req: AuthenticatedRequest) {
    return exportData({ prisma: this.prisma }, req.workspaceId || req.user?.workspaceId);
  }
}
