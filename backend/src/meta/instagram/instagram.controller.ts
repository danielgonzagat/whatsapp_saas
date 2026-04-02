import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
  BadRequestException,
} from '@nestjs/common';
import { InstagramService } from './instagram.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { resolveWorkspaceId } from '../../auth/workspace-access';
import { MetaWhatsAppService } from '../meta-whatsapp.service';

@Controller('meta/instagram')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class InstagramController {
  constructor(
    private readonly instagramService: InstagramService,
    private readonly metaWhatsApp: MetaWhatsAppService,
  ) {}

  private async resolveInstagramConnection(
    workspaceId: string,
    igAccountId?: string,
    accessToken?: string,
  ) {
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);
    const finalIgAccountId = String(
      igAccountId || resolved.instagramAccountId || '',
    ).trim();
    const finalAccessToken = String(
      accessToken || resolved.accessToken || '',
    ).trim();

    if (!finalIgAccountId || !finalAccessToken) {
      throw new BadRequestException('meta_instagram_connection_required');
    }

    return {
      igAccountId: finalIgAccountId,
      accessToken: finalAccessToken,
    };
  }

  @Get('profile')
  async getProfile(
    @Req() req: any,
    @Query('igAccountId') igAccountId: string,
    @Query('accessToken') accessToken: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveInstagramConnection(
      workspaceId,
      igAccountId,
      accessToken,
    );
    return this.instagramService.getProfile(
      connection.igAccountId,
      connection.accessToken,
    );
  }

  @Get('media')
  async getMedia(
    @Req() req: any,
    @Query('igAccountId') igAccountId: string,
    @Query('limit') limit: string,
    @Query('accessToken') accessToken: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveInstagramConnection(
      workspaceId,
      igAccountId,
      accessToken,
    );
    return this.instagramService.getMedia(
      connection.igAccountId,
      limit ? parseInt(limit, 10) : 25,
      connection.accessToken,
    );
  }

  @Get('insights/account')
  async getAccountInsights(
    @Req() req: any,
    @Query('igAccountId') igAccountId: string,
    @Query('metrics') metrics: string,
    @Query('period') period: string,
    @Query('accessToken') accessToken: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveInstagramConnection(
      workspaceId,
      igAccountId,
      accessToken,
    );
    const metricsList = metrics
      ? metrics.split(',')
      : ['impressions', 'reach', 'follower_count'];
    return this.instagramService.getAccountInsights(
      connection.igAccountId,
      metricsList,
      period || 'day',
      connection.accessToken,
    );
  }

  @Post('publish/photo')
  async publishPhoto(
    @Req() req: any,
    @Body()
    body: {
      igAccountId: string;
      imageUrl: string;
      caption: string;
      accessToken: string;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveInstagramConnection(
      workspaceId,
      body.igAccountId,
      body.accessToken,
    );
    return this.instagramService.publishPhoto(
      connection.igAccountId,
      body.imageUrl,
      body.caption,
      connection.accessToken,
    );
  }

  @Get('media/:id/comments')
  async getComments(
    @Req() req: any,
    @Param('id') mediaId: string,
    @Query('accessToken') accessToken: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveInstagramConnection(
      workspaceId,
      undefined,
      accessToken,
    );
    return this.instagramService.getComments(mediaId, connection.accessToken);
  }

  @Post('comments/:id/reply')
  async replyToComment(
    @Req() req: any,
    @Param('id') commentId: string,
    @Body() body: { text: string; accessToken: string },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveInstagramConnection(
      workspaceId,
      undefined,
      body.accessToken,
    );
    return this.instagramService.replyToComment(
      commentId,
      body.text,
      connection.accessToken,
    );
  }

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  @Post('messages/send')
  async sendMessage(
    @Req() req: any,
    @Body()
    body: {
      igAccountId: string;
      recipientId: string;
      text: string;
      accessToken: string;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveInstagramConnection(
      workspaceId,
      body.igAccountId,
      body.accessToken,
    );
    return this.instagramService.sendMessage(
      connection.igAccountId,
      body.recipientId,
      body.text,
      connection.accessToken,
    );
  }
}
