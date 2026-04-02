import { Controller, Post, Body, Req, BadRequestException, UseGuards } from '@nestjs/common';
import { MassSendService } from './mass-send.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { Roles } from '../auth/roles.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';

@Controller('campaign')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class MassSendController {
  constructor(private readonly massSendService: MassSendService) {}

  @Post('start')
  @Roles('ADMIN')
  async startCampaign(
    @Req() req: any,
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
