import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { InboxService } from './inbox.service';

@Controller('inbox')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get(':workspaceId/agents')
  async listAgents(@Req() req: AuthenticatedRequest, @Param('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.inbox.listAgents(effectiveWorkspaceId);
  }

  @Get(':workspaceId/conversations')
  async listConversations(
    @Req() req: AuthenticatedRequest,
    @Param('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.inbox.listConversations(effectiveWorkspaceId);
  }

  @Get('conversations/:conversationId/messages')
  async getMessages(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.inbox.getMessages(conversationId, workspaceId);
  }

  @Post('conversations/:conversationId/close')
  async closeConversation(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.inbox.updateStatus(workspaceId, conversationId, 'CLOSED');
  }

  @Post('conversations/:conversationId/assign')
  async assignAgent(
    @Req() req: AuthenticatedRequest,
    @Param('conversationId') conversationId: string,
    @Body('agentId') agentId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.inbox.assignAgent(workspaceId, conversationId, agentId);
  }

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
