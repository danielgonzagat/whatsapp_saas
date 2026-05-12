import {
  BadRequestException,
  Body,
  Controller,
  Get,
  NotFoundException,
  Optional,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { Idempotent } from '../common/idempotency.guard';
import { OpsAlertService } from '../observability/ops-alert.service';
import { PrismaService } from '../prisma/prisma.service';
import { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';
import { EmailMarketingService } from './email-marketing.service';

import { RouteClass } from '../common/throttler/route-class.decorator';
@Controller('marketing/email')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class EmailMarketingController {
  constructor(
    private readonly emailMarketingService: EmailMarketingService,
    private readonly prisma: PrismaService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  @Post('campaigns')
  @Idempotent()
  async createCampaign(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Body() dto: CreateEmailCampaignDto,
  ) {
    const workspaceId = req.user.workspaceId;

    if (!dto.recipients || dto.recipients.length === 0) {
      throw new BadRequestException('At least one recipient is required');
    }

    if (dto.recipients.length > 500) {
      throw new BadRequestException('Maximum 500 recipients per campaign');
    }

    try {
      const campaign = await this.emailMarketingService.createCampaign(workspaceId, dto);
      return { campaign };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown_error';
      void this.opsAlert?.alertOnCriticalError(err, 'EmailMarketingController.createCampaign');
      throw new BadRequestException(`Failed to create campaign: ${msg}`);
    }
  }

  @Get('campaigns')
  async listCampaigns(@Request() req: { user: { workspaceId: string; email?: string } }) {
    const workspaceId = req.user.workspaceId;
    const campaigns = await this.emailMarketingService.listCampaigns(workspaceId);
    return { campaigns };
  }

  @Get('campaigns/:id')
  async getCampaign(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Param('id') id: string,
  ) {
    const workspaceId = req.user.workspaceId;
    const campaign = await this.emailMarketingService.getCampaignWithDeliveries(id, workspaceId);

    if (!campaign) {
      throw new NotFoundException('Campaign not found');
    }

    return { campaign };
  }

  @Post('campaigns/:id/send')
  @Idempotent()
  async sendCampaign(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Param('id') id: string,
    @Body() body?: { approvalRequestId?: string },
  ) {
    const workspaceId = req.user.workspaceId;

    try {
      const approvalRequestId =
        typeof body?.approvalRequestId === 'string' ? body.approvalRequestId.trim() : '';
      if (approvalRequestId) {
        const approval = await this.prisma.approvalRequest.findFirst({
          where: {
            id: approvalRequestId,
            workspaceId,
            kind: 'email_campaign:send',
            entityType: 'EmailCampaign',
            entityId: id,
            state: 'APPROVED',
          },
          select: { id: true },
        });
        if (!approval) {
          throw new BadRequestException('Approved email campaign send request not found');
        }
        const campaign = await this.emailMarketingService.enqueueSend(id, workspaceId);
        await this.prisma.approvalRequest.updateMany({
          where: { id: approval.id, workspaceId, state: 'APPROVED' },
          data: {
            state: 'COMPLETED',
            respondedAt: new Date(),
            response: {
              action: 'approved_email_campaign_send_executed',
              campaignId: id,
              executedAt: new Date().toISOString(),
            },
          },
        });
        return { campaign, message: 'Campaign queued for sending', approvalExecuted: true };
      }

      const existingCampaign = await this.emailMarketingService.getCampaignWithDeliveries(
        id,
        workspaceId,
      );
      if (!existingCampaign) {
        throw new NotFoundException('Campaign not found');
      }
      if (existingCampaign.status !== 'DRAFT') {
        throw new BadRequestException(
          `Cannot request send approval in status: ${existingCampaign.status}`,
        );
      }

      const approval = await this.prisma.approvalRequest.create({
        data: {
          workspaceId,
          kind: 'email_campaign:send',
          scope: 'workspace',
          entityType: 'EmailCampaign',
          entityId: id,
          state: 'OPEN',
          title: `Aprovar envio da campanha ${existingCampaign.name}`,
          prompt: `A campanha de email "${existingCampaign.name}" sera enviada para ${existingCampaign.recipients.length} destinatario(s). Revise antes de autorizar o disparo.`,
          payload: {
            campaignId: id,
            recipientCount: existingCampaign.recipients.length,
            requestedByEmail: req.user.email || null,
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
        message: 'Envio de campanha enviado para aprovacao humana antes do disparo.',
      };
    } catch (err: unknown) {
      if (err instanceof BadRequestException || err instanceof NotFoundException) {
        throw err;
      }
      const msg = err instanceof Error ? err.message : 'unknown_error';
      void this.opsAlert?.alertOnCriticalError(err, 'EmailMarketingController.sendCampaign');
      throw new BadRequestException(`Failed to send campaign: ${msg}`);
    }
  }
}
