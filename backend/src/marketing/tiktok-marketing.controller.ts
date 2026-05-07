import { Body, Controller, Get, Logger, Post, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { TikTokMarketingService, type TikTokCompleteBody } from './tiktok-marketing.service';

type TikTokKind = 'creator' | 'advertiser';

@Controller('marketing/connect/tiktok')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class TikTokMarketingController {
  private readonly logger = new Logger(TikTokMarketingController.name);

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
  async disconnect(@Request() req: { user: { id?: string; sub?: string; workspaceId: string } }) {
    const startedAt = Date.now();
    const workspaceId = req.user.workspaceId;
    const userId = req.user.id ?? req.user.sub;
    try {
      const result = await this.tiktokMarketing.disconnect(workspaceId);
      this.logger.log({
        durationMs: Date.now() - startedAt,
        operation: 'disconnect',
        provider: 'tiktok',
        status: 'success',
        userId,
        workspaceId,
      });
      return result;
    } catch (error: unknown) {
      this.logger.error({
        durationMs: Date.now() - startedAt,
        errorCode: error instanceof Error ? error.name : 'UnknownError',
        operation: 'disconnect',
        provider: 'tiktok',
        status: 'failure',
        userId,
        workspaceId,
      });
      throw error;
    }
  }
}
