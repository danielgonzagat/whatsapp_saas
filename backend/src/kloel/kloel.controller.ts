import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  NotFoundException,
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
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
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
import { KloelToolDispatcherService } from './kloel-tool-dispatcher.service';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { StorageService } from '../common/storage/storage.service';
import {
  listThreads,
  createThread,
  updateThread,
  deleteThread,
  getThreadMessages,
  addThreadMessage,
  updateThreadMessage,
  updateMessageFeedback,
} from './kloel-thread.controller-helpers';
import { handleUploadFile, handleUploadChatFile } from './kloel-upload.controller-helpers';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';
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
interface ApprovalDecisionDto {
  note?: string;
  adjustment?: Prisma.InputJsonValue;
}
const KLOEL_UPLOAD_GENERIC_MIME_RE =
  /^(image\/(jpeg|png|gif|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/;
const KLOEL_UPLOAD_CHAT_MIME_RE =
  /^(image\/(jpeg|png|gif|webp)|application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document|application\/vnd\.ms-excel|application\/vnd\.openxmlformats-officedocument\.spreadsheetml\.sheet|text\/plain|text\/csv|audio\/(mpeg|wav|webm|ogg|mp4|x-m4a))$/;
const UPLOAD_MAX = 25 * 1024 * 1024;
@Controller('kloel')
@RouteClass('ai')
export class KloelController {
  constructor(
    private readonly kloelService: KloelService,
    private readonly conversationalOnboarding: ConversationalOnboardingService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
    private readonly threadSearchService: KloelThreadSearchService,
    private readonly toolDispatcher: KloelToolDispatcherService,
  ) {}
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
  private readWorkspaceId(req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) {
      throw new BadRequestException('workspace_id_required');
    }
    return workspaceId;
  }
  private normalizeApprovalNote(body?: ApprovalDecisionDto) {
    return typeof body?.note === 'string' && body.note.trim() ? body.note.trim() : null;
  }
  private async transitionApprovalRequest(input: {
    approvalRequestId: string;
    req: AuthenticatedRequest;
    state: 'APPROVED' | 'REJECTED' | 'ADJUSTMENT_REQUESTED';
    body?: ApprovalDecisionDto;
  }) {
    const approvalRequestId = String(input.approvalRequestId || '').trim();
    if (!approvalRequestId) {
      throw new BadRequestException('approval_request_id_required');
    }
    const workspaceId = this.readWorkspaceId(input.req);
    const approval = await this.prisma.approvalRequest.findFirst({
      where: { id: approvalRequestId, workspaceId },
      select: { id: true, state: true },
    });
    if (!approval) {
      throw new NotFoundException('approval_request_not_found');
    }
    if (approval.state !== 'OPEN') {
      throw new BadRequestException('approval_request_not_open');
    }
    const userId = this.readUserId(input.req.user);
    const response: Prisma.InputJsonObject = {
      action: input.state.toLowerCase(),
      decidedAt: new Date().toISOString(),
      ...(userId ? { decidedByUserId: userId } : {}),
      note: this.normalizeApprovalNote(input.body),
      ...(input.state === 'ADJUSTMENT_REQUESTED'
        ? { adjustment: input.body?.adjustment ?? null }
        : {}),
    };
    const result = await this.prisma.approvalRequest.updateMany({
      where: { id: approvalRequestId, workspaceId, state: 'OPEN' },
      data: {
        state: input.state,
        respondedAt: new Date(),
        response,
      },
    });
    if (result.count !== 1) {
      throw new BadRequestException('approval_request_not_open');
    }
    return {
      success: true,
      approvalRequestId,
      state: input.state,
    };
  }
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
      if (!abortController.signal.aborted) {
        abortController.abort(reason);
      }
    };
    const timeoutMs = Number(process.env.KLOEL_THINK_TIMEOUT_MS || 240000);
    const timeout = setTimeout(() => abortWithReason('request_timeout'), timeoutMs);
    req.on('close', () => abortWithReason('client_disconnected'));
    res.on('close', () => abortWithReason('client_disconnected'));
    try {
      const { metadata: rawMetadata, ...requestDto } = dto;
      const metadata = rawMetadata as Prisma.InputJsonValue | undefined;
      return await this.kloelService.think(
        {
          ...requestDto,
          workspaceId,
          ...(userId !== undefined ? { userId } : {}),
          ...(userName !== undefined ? { userName } : {}),
          ...(metadata !== undefined ? { metadata } : {}),
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
  @Get('approvals/pending')
  async getPendingApprovals(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    if (!workspaceId) {
      throw new BadRequestException('workspace_id_required');
    }
    const approvals = await this.prisma.approvalRequest.findMany({
      where: { workspaceId, state: 'OPEN' },
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        kind: true,
        scope: true,
        entityType: true,
        entityId: true,
        state: true,
        title: true,
        prompt: true,
        payload: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    return { approvals };
  }
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @InternalEndpoint('approval request approve')
  @Post('approvals/:approvalRequestId/approve')
  async approveApprovalRequest(
    @Param('approvalRequestId') approvalRequestId: string,
    @Body() body: ApprovalDecisionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    const transition = await this.transitionApprovalRequest({
      approvalRequestId,
      req,
      state: 'APPROVED',
      body,
    });
    const userId = this.readUserId(req.user);
    const execution = await this.toolDispatcher.executeApprovedApprovalRequest({
      workspaceId: this.readWorkspaceId(req),
      approvalRequestId: transition.approvalRequestId,
      ...(userId !== undefined ? { userId } : {}),
    });
    return execution.executed
      ? {
          ...transition,
          state: execution.state,
          executed: true,
          result: execution.result,
        }
      : transition;
  }
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @InternalEndpoint('approval request reject')
  @Post('approvals/:approvalRequestId/reject')
  async rejectApprovalRequest(
    @Param('approvalRequestId') approvalRequestId: string,
    @Body() body: ApprovalDecisionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.transitionApprovalRequest({
      approvalRequestId,
      req,
      state: 'REJECTED',
      body,
    });
  }
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @InternalEndpoint('approval request adjust')
  @Post('approvals/:approvalRequestId/adjust')
  async adjustApprovalRequest(
    @Param('approvalRequestId') approvalRequestId: string,
    @Body() body: ApprovalDecisionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return this.transitionApprovalRequest({
      approvalRequestId,
      req,
      state: 'ADJUSTMENT_REQUESTED',
      body,
    });
  }
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('think/sync')
  async thinkSync(@Body() dto: ThinkDto, @Request() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId || req.user?.workspaceId;
    const userId = this.readUserId(req.user);
    const userName = typeof req.user?.name === 'string' ? req.user.name : undefined;
    const { metadata: rawMetadata, ...requestDto } = dto;
    const metadata = rawMetadata as Prisma.InputJsonValue | undefined;
    return this.kloelService.thinkSync({
      ...requestDto,
      workspaceId,
      ...(userId !== undefined ? { userId } : {}),
      ...(userName !== undefined ? { userName } : {}),
      ...(metadata !== undefined ? { metadata } : {}),
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
  @InternalEndpoint('PDF processing trigger')
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
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('onboarding/:workspaceId/start')
  async startConversationalOnboarding(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return {
      message: await this.conversationalOnboarding.start(resolveWorkspaceId(req, workspaceId)),
    };
  }
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
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
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
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
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('onboarding/:workspaceId/status')
  async getOnboardingStatus(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    return this.conversationalOnboarding.getStatus(resolveWorkspaceId(req, workspaceId));
  }
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
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('threads')
  async listChatThreads(
    @Req() req: AuthenticatedRequest,
    @Query('limit') limit?: string,
    @Query('cursor') cursor?: string,
  ) {
    const parsedLimit = limit ? Number.parseInt(limit, 10) : undefined;
    const parsedCursor = cursor ? Number.parseInt(cursor, 10) : undefined;
    const numericLimit = Number.isFinite(parsedLimit) ? parsedLimit : undefined;
    const numericCursor = Number.isFinite(parsedCursor) ? parsedCursor : undefined;
    return listThreads({ prisma: this.prisma }, resolveWorkspaceId(req), {
      ...(numericLimit !== undefined ? { limit: numericLimit } : {}),
      ...(numericCursor !== undefined ? { cursor: numericCursor } : {}),
      paginated: Boolean(limit || cursor),
    });
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
  @InternalEndpoint('thread search')
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
  @InternalEndpoint('thread message creation')
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
    if (!messageId) {
      throw new BadRequestException('messageId é obrigatório.');
    }
    const userId = typeof req.user?.sub === 'string' ? req.user.sub : undefined;
    const userName = typeof req.user?.name === 'string' ? req.user.name : undefined;
    return this.kloelService.regenerateThreadAssistantResponse({
      workspaceId: resolveWorkspaceId(req),
      conversationId: id,
      assistantMessageId: messageId,
      ...(userId !== undefined ? { userId } : {}),
      ...(userName !== undefined ? { userName } : {}),
    });
  }
}
