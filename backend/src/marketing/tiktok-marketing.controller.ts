import { Body, Controller, Get, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { TikTokMarketingService, type TikTokCompleteBody } from './tiktok-marketing.service';

type TikTokKind = 'creator' | 'advertiser';

@Controller('marketing/connect/tiktok')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class TikTokMarketingController {
  constructor(private readonly tiktokMarketing: TikTokMarketingService) {}

  @Get('status')
  status(@Request() req: { user: { workspaceId: string } }) {
    return this.tiktokMarketing.getStatus(req.user.workspaceId);
  }

  @Get('url')
  url(@Request() req: { user: { workspaceId: string } }, @Query('kind') rawKind?: TikTokKind) {
    return this.tiktokMarketing.generateAuthUrl(req.user.workspaceId, rawKind);
  }

  @Post('complete')
  complete(@Request() req: { user: { workspaceId: string } }, @Body() body: TikTokCompleteBody) {
    return this.tiktokMarketing.completeOAuth(req.user.workspaceId, body);
  }

  @Post('disconnect')
  disconnect(@Request() req: { user: { workspaceId: string } }) {
    return this.tiktokMarketing.disconnect(req.user.workspaceId);
  }
}
