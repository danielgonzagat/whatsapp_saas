import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
  NotFoundException,
  Optional,
  Param,
  Post,
  Request,
  UseGuards,
} from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { OpsAlertService } from '../observability/ops-alert.service';
import { CreateEmailCampaignDto } from './dto/create-email-campaign.dto';
import { EmailMarketingService } from './email-marketing.service';

@UseGuards(ThrottlerGuard)
@Controller('marketing/email')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@Throttle({ default: { limit: 20, ttl: 60000 } })
export class EmailMarketingController {
  private readonly logger = new Logger(EmailMarketingController.name);

  constructor(
    private readonly emailMarketingService: EmailMarketingService,
    @Optional() private readonly opsAlert?: OpsAlertService,
  ) {}

  @Post('campaigns')
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
  async sendCampaign(
    @Request() req: { user: { workspaceId: string; email?: string } },
    @Param('id') id: string,
  ) {
    const workspaceId = req.user.workspaceId;

    try {
      const campaign = await this.emailMarketingService.enqueueSend(id, workspaceId);
      return { campaign, message: 'Campaign queued for sending' };
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'unknown_error';
      void this.opsAlert?.alertOnCriticalError(err, 'EmailMarketingController.sendCampaign');
      throw new BadRequestException(`Failed to send campaign: ${msg}`);
    }
  }
}
