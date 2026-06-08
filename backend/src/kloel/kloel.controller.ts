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
import { Response } from 'express';
import { memoryStorage } from 'multer';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Public } from '../auth/public.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { AuthenticatedRequest } from '../common/interfaces';
import { MaxFileSizeValidator, ParseFilePipe, FileTypeValidator } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { MindChatMessageService } from './mind/aliases/mind-chat-message.service';
import { ConversationalOnboardingService } from './conversational-onboarding.service';
import { KloelService } from './kloel.service';
import { KloelMemoryEngineService } from './kloel-memory-engine.service';
import { KloelThreadSearchService } from './kloel-thread-search.service';
import { KloelGlobalSearchService } from './kloel-global-search.service';
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
import {
  handleUploadFile,
  handleUploadChatFile,
  KLOEL_UPLOAD_GENERIC_MIME_RE,
  KLOEL_UPLOAD_CHAT_MIME_RE,
  KLOEL_UPLOAD_MAX_BYTES,
  kloelGenericUploadFileFilter,
  kloelChatUploadFileFilter,
} from './kloel-upload.controller-helpers';
import {
  ApprovalDecisionDto,
  readUserId,
  readWorkspaceId,
  transitionApprovalRequest,
} from './kloel-approval.controller-helpers';
import {
  KLOEL_PENDING_APPROVALS_SELECT,
  buildKloelMemoryArgs,
  buildKloelThinkPayload,
  buildRegenerateMessageArgs,
  parseListThreadsQuery,
  type KloelMemoryDto,
  type KloelThinkDto,
} from './kloel.controller.helpers';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';
type ThinkDto = KloelThinkDto;
type MemoryDto = KloelMemoryDto;
interface OnboardingChatDto {
  message: string;
}
@Controller('kloel')
@RouteClass('ai')
export class KloelController {
  constructor(
    private readonly kloelService: KloelService,
    private readonly conversationalOnboarding: ConversationalOnboardingService,
    private readonly storageService: StorageService,
    private readonly prisma: PrismaService,
    private readonly threadSearchService: KloelThreadSearchService,
    private readonly globalSearchService: KloelGlobalSearchService,
    private readonly toolDispatcher: KloelToolDispatcherService,
    @Optional() private readonly mindChatMessage?: MindChatMessageService,
    @Optional() private readonly memoryEngine?: KloelMemoryEngineService,
  ) {}

  /**
   * Per-user memory GRAPH for the immutable Kloel Sigma renderer — the "Memória"
   * node's data source. Derived read-time from the user's MindMemory slots; never
   * leaks other users' memory (scoped by JWT workspaceId + userId).
   */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get('memory/graph')
  async getMemoryGraph(@Request() req: AuthenticatedRequest) {
    const workspaceId = req.workspaceId || req.user?.workspaceId || '';
    const userId = readUserId(req.user) || '';
    if (!this.memoryEngine || !workspaceId || !userId) {
      return { nodes: [], edges: [] };
    }
    return this.memoryEngine.recallGraph(workspaceId, userId);
  }

  /**
   * Canonical Mind surface for the SEPARATE RAC_ChatMessage table. Returns the
   * SAME delegate legacy code used (`prisma.chatMessage`) when the alias service
   * is not provided — byte-identical, documented fallback idiom.
   */
  private get chatMessageItems() {
    return this.mindChatMessage?.items ?? this.prisma.chatMessage;
  }
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('think')
  async think(
    @Body() dto: ThinkDto,
    @Res() res: Response,
    @Request() req: AuthenticatedRequest,
  ): Promise<void> {
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
      return await this.kloelService.think(buildKloelThinkPayload(dto, req, readUserId), res, {
        signal: abortController.signal,
        timeoutMs,
      });
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
      select: { ...KLOEL_PENDING_APPROVALS_SELECT },
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
    const transition = await transitionApprovalRequest(
      { prisma: this.prisma },
      { approvalRequestId, req, state: 'APPROVED', body },
    );
    const userId = readUserId(req.user);
    const execution = await this.toolDispatcher.executeApprovedApprovalRequest({
      workspaceId: readWorkspaceId(req),
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
    return transitionApprovalRequest(
      { prisma: this.prisma },
      { approvalRequestId, req, state: 'REJECTED', body },
    );
  }
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @InternalEndpoint('approval request adjust')
  @Post('approvals/:approvalRequestId/adjust')
  async adjustApprovalRequest(
    @Param('approvalRequestId') approvalRequestId: string,
    @Body() body: ApprovalDecisionDto,
    @Request() req: AuthenticatedRequest,
  ) {
    return transitionApprovalRequest(
      { prisma: this.prisma },
      { approvalRequestId, req, state: 'ADJUSTMENT_REQUESTED', body },
    );
  }
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('think/sync')
  async thinkSync(@Body() dto: ThinkDto, @Request() req: AuthenticatedRequest) {
    return this.kloelService.thinkSync(buildKloelThinkPayload(dto, req, readUserId));
  }
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('memory/save')
  async saveMemory(@Body() dto: MemoryDto, @Request() req: AuthenticatedRequest) {
    const args = buildKloelMemoryArgs(dto, req);
    await this.kloelService.saveMemory(args.workspaceId, args.type, args.content, args.metadata);
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
      limits: { fileSize: KLOEL_UPLOAD_MAX_BYTES },
      fileFilter: kloelGenericUploadFileFilter,
    }),
  )
  async uploadGenericFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: KLOEL_UPLOAD_MAX_BYTES }),
          new FileTypeValidator({
            fileType: KLOEL_UPLOAD_GENERIC_MIME_RE,
            fallbackToMimetype: true,
          }),
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
      (req.body as { folder?: string } | undefined)?.folder || 'general',
      req,
    );
  }
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Post('upload-chat')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: KLOEL_UPLOAD_MAX_BYTES },
      fileFilter: kloelChatUploadFileFilter,
    }),
  )
  async uploadFile(
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: KLOEL_UPLOAD_MAX_BYTES }),
          new FileTypeValidator({
            fileType: KLOEL_UPLOAD_CHAT_MIME_RE,
            fallbackToMimetype: true,
          }),
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
    try {
      await this.conversationalOnboarding.chat(
        resolveWorkspaceId(req, workspaceId),
        dto.message,
        res,
      );
    } catch {
      // Terminal-event guarantee: chat() handles its own happy/error SSE paths,
      // but a throw BEFORE its internal try (history/state/decision setup) would
      // otherwise leave the SSE socket open with no terminal event — wedging the
      // frontend's isReplyInFlight flag. Emit a terminal `done` payload (only if
      // the response is still writable) and end the socket. Best-effort: this
      // must never throw.
      try {
        const response = res as Response & { writableEnded?: boolean; headersSent?: boolean };
        if (response.writableEnded !== true) {
          if (response.headersSent !== true) {
            res.setHeader('Content-Type', 'text/event-stream');
            res.setHeader('Cache-Control', 'no-cache');
            res.setHeader('Connection', 'keep-alive');
          }
          const payload = {
            content:
              'Tive uma instabilidade momentânea pra processar agora. Pode repetir a mensagem em alguns segundos?',
            error: 'onboarding_chat_failed',
            done: true,
          };
          res.write('data: ' + JSON.stringify(payload) + '\n\n');
          res.end();
        }
      } catch {
        // ignore — the socket is already broken; nothing more to do
      }
    }
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
    return listThreads(
      { prisma: this.prisma },
      resolveWorkspaceId(req),
      parseListThreadsQuery(limit, cursor),
    );
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
  @Get('search')
  async searchAll(
    @Request() req: AuthenticatedRequest,
    @Query('q') q: string,
    @Query('limit') limit?: string,
  ) {
    return this.globalSearchService.search(resolveWorkspaceId(req), q, limit);
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
    return getThreadMessages(
      { prisma: this.prisma, chatMessageItems: this.chatMessageItems },
      id,
      resolveWorkspaceId(req),
    );
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
    return addThreadMessage(
      { prisma: this.prisma, chatMessageItems: this.chatMessageItems },
      id,
      dto,
      resolveWorkspaceId(req),
    );
  }
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Put('messages/:id')
  async updateChatThreadMessage(
    @Param('id') id: string,
    @Body() dto: { content?: string },
    @Req() req: AuthenticatedRequest,
  ) {
    return updateThreadMessage(
      { prisma: this.prisma, chatMessageItems: this.chatMessageItems },
      id,
      dto,
      resolveWorkspaceId(req),
    );
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
    return this.kloelService.regenerateThreadAssistantResponse(
      buildRegenerateMessageArgs(id, dto, req, resolveWorkspaceId(req)),
    );
  }
}
