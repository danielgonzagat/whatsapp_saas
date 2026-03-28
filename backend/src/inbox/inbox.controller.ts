import { Controller, Get, Post, Body, Param, Req, UseGuards, Request } from '@nestjs/common';
import { InboxService } from './inbox.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';

@Controller('inbox')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class InboxController {
  constructor(private readonly inbox: InboxService) {}

  @Get(':workspaceId/agents')
  async listAgents(@Req() req: any, @Param('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.inbox.listAgents(effectiveWorkspaceId);
  }

  @Get(':workspaceId/conversations')
  async listConversations(
    @Req() req: any,
    @Param('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.inbox.listConversations(effectiveWorkspaceId);
  }

  @Get('conversations/:conversationId/messages')
  async getMessages(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.inbox.getMessages(conversationId, workspaceId);
  }

  @Post('conversations/:conversationId/close')
  async closeConversation(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.inbox.updateStatus(workspaceId, conversationId, 'CLOSED');
  }

  @Post('conversations/:conversationId/assign')
  async assignAgent(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Body('agentId') agentId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.inbox.assignAgent(workspaceId, conversationId, agentId);
  }

  @Post('conversations/:conversationId/reply')
  async replyToConversation(
    @Req() req: any,
    @Param('conversationId') conversationId: string,
    @Body('content') content: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.inbox.replyToConversation(workspaceId, conversationId, content);
  }
}
