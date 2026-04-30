import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { InboxService } from './inbox.service';

/** Inbox controller. */
@UseGuards(ThrottlerGuard)
@Controller('inbox')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Throttle({ default: { limit: 10, ttl: 60000 } })
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  /** List agents. */
  @Get(':workspaceId/agents')
  async listAgents(@Req() req: AuthenticatedRequest, @Param('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.inbox.listAgents(effectiveWorkspaceId);
  }

  /** List conversations. */
  @Get(':workspaceId/conversations')
  async listConversations(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.inbox.listConversations(effectiveWorkspaceId);
  }

  /** Get messages. */
  @Get('conversations/:conversationId/messages')
  async getMessages(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.inbox.getMessages(conversationId, workspaceId);
  }

  /** Close conversation. */
  @Post('conversations/:conversationId/close')
  async closeConversation(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.inbox.updateStatus(workspaceId, conversationId, 'CLOSED');
  }

  /** Assign agent. */
  @Post('conversations/:conversationId/assign')
  async assignAgent(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Body('agentId') agentId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.inbox.assignAgent(workspaceId, conversationId, agentId);
  }

  /** Reply to conversation. */
  @Post('conversations/:conversationId/reply')
  async replyToConversation(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Body('content') content: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.inbox.replyToConversation(workspaceId, conversationId, content);
  }
}
