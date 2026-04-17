import { BadRequestException, Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { MassSendService } from './mass-send.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';

@Controller('campaign')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MassSendController {
  constructor(private readonly massSendService: MassSendService) {}

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  @Post('start')
  @Roles('ADMIN')
  async startCampaign(
    @Req() req: AuthenticatedRequest,
    @Body('workspaceId') workspaceId: string,
    @Body('user') user: string,
    @Body('numbers') numbers: string[],
    @Body('message') message: string,
  ) {
    if (!Array.isArray(numbers) || numbers.length === 0) {
      throw new BadRequestException('numbers deve ser uma lista não vazia');
    }
    if (!message || !message.trim()) {
      throw new BadRequestException('message é obrigatório');
    }

    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.massSendService.enqueueCampaign(effectiveWorkspaceId, user, numbers, message);
  }
}
