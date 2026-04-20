import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { CiaService } from './cia.service';

/** Cia controller. */
@ApiTags('CIA')
@Controller('cia')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class CiaController {
  constructor(private readonly ciaService: CiaService) {}

  /** Get surface. */
  @Get('surface/:workspaceId')
  async getSurface(@Param('workspaceId') workspaceId: string) {
    return this.ciaService.getSurface(workspaceId);
  }

  /** Get human tasks. */
  @Get('human-tasks/:workspaceId')
  async getHumanTasks(@Param('workspaceId') workspaceId: string) {
    return this.ciaService.getHumanTasks(workspaceId);
  }

  /** Get account runtime. */
  @Get('account-runtime/:workspaceId')
  async getAccountRuntime(@Param('workspaceId') workspaceId: string) {
    return this.ciaService.getAccountRuntime(workspaceId);
  }

  /** Get capability registry. */
  @Get('capability-registry')
  getCapabilityRegistry() {
    return this.ciaService.getCapabilityRegistry();
  }

  /** Get conversation action registry. */
  @Get('conversation-action-registry')
  getConversationActionRegistry() {
    return this.ciaService.getConversationActionRegistry();
  }

  /** Get account approvals. */
  @Get('account-approvals/:workspaceId')
  async getAccountApprovals(@Param('workspaceId') workspaceId: string) {
    return this.ciaService.getAccountApprovals(workspaceId);
  }

  /** Get account input sessions. */
  @Get('account-input-sessions/:workspaceId')
  async getAccountInputSessions(@Param('workspaceId') workspaceId: string) {
    return this.ciaService.getAccountInputSessions(workspaceId);
  }

  /** Get account work items. */
  @Get('account-work-items/:workspaceId')
  async getAccountWorkItems(@Param('workspaceId') workspaceId: string) {
    return this.ciaService.getAccountWorkItems(workspaceId);
  }

  /** Get account proof. */
  @Get('account-proof/:workspaceId')
  async getAccountProof(@Param('workspaceId') workspaceId: string) {
    return this.ciaService.getAccountProof(workspaceId);
  }

  /** Get cycle proof. */
  @Get('cycle-proof/:workspaceId')
  async getCycleProof(@Param('workspaceId') workspaceId: string) {
    return this.ciaService.getCycleProof(workspaceId);
  }

  /** Get conversation proof. */
  @Get('conversation-proof/:workspaceId/:conversationId')
  async getConversationProof(
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.ciaService.getConversationProof(workspaceId, conversationId);
  }

  /** Activate autopilot total. */
  @Post('autopilot-total/:workspaceId')
  async activateAutopilotTotal(
    @Param('workspaceId') workspaceId: string,
    @Body() body?: { limit?: number },
  ) {
    return this.ciaService.activateAutopilotTotal(workspaceId, body?.limit);
  }

  /** Approve human task. */
  @Post('human-tasks/:workspaceId/:taskId/approve')
  async approveHumanTask(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body() body?: { message?: string; resume?: boolean },
  ) {
    return this.ciaService.approveHumanTask(workspaceId, taskId, body);
  }

  /** Reject human task. */
  @Post('human-tasks/:workspaceId/:taskId/reject')
  async rejectHumanTask(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.ciaService.rejectHumanTask(workspaceId, taskId);
  }

  /** Approve account approval. */
  @Post('account-approvals/:workspaceId/:approvalId/approve')
  async approveAccountApproval(
    @Param('workspaceId') workspaceId: string,
    @Param('approvalId') approvalId: string,
  ) {
    return this.ciaService.approveAccountApproval(workspaceId, approvalId);
  }

  /** Reject account approval. */
  @Post('account-approvals/:workspaceId/:approvalId/reject')
  async rejectAccountApproval(
    @Param('workspaceId') workspaceId: string,
    @Param('approvalId') approvalId: string,
  ) {
    return this.ciaService.rejectAccountApproval(workspaceId, approvalId);
  }

  /** Respond to account input session. */
  @Post('account-input-sessions/:workspaceId/:sessionId/respond')
  async respondToAccountInputSession(
    @Param('workspaceId') workspaceId: string,
    @Param('sessionId') sessionId: string,
    @Body() body?: { answer?: string },
  ) {
    return this.ciaService.respondToAccountInputSession(workspaceId, sessionId, body?.answer);
  }

  /** Resume conversation. */
  @Post('conversations/:workspaceId/:conversationId/resume')
  async resumeConversation(
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.ciaService.resumeConversation(workspaceId, conversationId);
  }
}
