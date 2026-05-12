import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { MassSendService } from './mass-send.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { PrismaService } from '../prisma/prisma.service';

type StartCampaignBody = {
  workspaceId?: string;
  user?: string;
  numbers?: string[];
  message?: string;
  approvalRequestId?: string;
};

/** Mass send controller. */
@Controller('campaign')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class MassSendController {
  constructor(
    private readonly massSendService: MassSendService,
    private readonly prisma: PrismaService,
  ) {}

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  @Post('start')
  @Roles('ADMIN')
  async startCampaign(@Req() req: AuthenticatedRequest, @Body() body: StartCampaignBody) {
    const approvalRequestId =
      typeof body.approvalRequestId === 'string' ? body.approvalRequestId.trim() : '';
    const effectiveWorkspaceId = resolveWorkspaceId(req, body.workspaceId);
    let user = body.user;
    let numbers = body.numbers;
    let message = body.message;

    if (approvalRequestId) {
      const approval = await this.prisma.approvalRequest.findFirst({
        where: {
          id: approvalRequestId,
          workspaceId: effectiveWorkspaceId,
          kind: 'whatsapp_campaign:start',
          entityType: 'WhatsAppMassSendCampaign',
          state: 'APPROVED',
        },
        select: { id: true, payload: true },
      });
      if (!approval || !approval.payload || typeof approval.payload !== 'object') {
        throw new BadRequestException('Approved WhatsApp campaign request not found');
      }
      const payload = approval.payload as Record<string, unknown>;
      user = typeof payload.user === 'string' ? payload.user : user;
      numbers = Array.isArray(payload.numbers)
        ? payload.numbers.filter((number): number is string => typeof number === 'string')
        : numbers;
      message = typeof payload.message === 'string' ? payload.message : message;
    }

    if (!Array.isArray(numbers) || numbers.length === 0) {
      throw new BadRequestException('numbers deve ser uma lista não vazia');
    }
    if (!message || !message.trim()) {
      throw new BadRequestException('message é obrigatório');
    }

    if (!approvalRequestId) {
      const approval = await this.prisma.approvalRequest.create({
        data: {
          workspaceId: effectiveWorkspaceId,
          kind: 'whatsapp_campaign:start',
          scope: 'workspace',
          entityType: 'WhatsAppMassSendCampaign',
          entityId: `whatsapp-campaign:${Date.now()}`,
          state: 'OPEN',
          title: `Aprovar campanha WhatsApp para ${numbers.length} contato(s)`,
          prompt: `Campanha WhatsApp em massa para ${numbers.length} contato(s). Revise publico e mensagem antes de autorizar o envio.`,
          payload: {
            user: user || req.user?.email || null,
            numbers,
            message,
            requestedByUserId: req.user?.sub || null,
            risk: 'high',
            requiresApproval: true,
          },
        },
        select: { id: true, state: true, title: true, createdAt: true },
      });
      return {
        approvalRequired: true,
        approvalRequestId: approval.id,
        approvalState: approval.state,
        approval,
        message: 'Campanha WhatsApp enviada para aprovacao humana antes do disparo.',
      };
    }

    const result = await this.massSendService.enqueueCampaign(
      effectiveWorkspaceId,
      user || req.user?.email || req.user?.sub,
      numbers,
      message,
    );
    await this.prisma.approvalRequest.updateMany({
      where: { id: approvalRequestId, workspaceId: effectiveWorkspaceId, state: 'APPROVED' },
      data: {
        state: 'COMPLETED',
        respondedAt: new Date(),
        response: {
          action: 'approved_whatsapp_campaign_start_executed',
          jobId: result.jobId || null,
          executedAt: new Date().toISOString(),
        },
      },
    });
    return { approvalExecuted: true, ...result };
  }
}
