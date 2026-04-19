import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../../auth/workspace-access';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { normalizeMetaGraphSegment } from '../meta-input.util';
import { MetaWhatsAppService } from '../meta-whatsapp.service';
import { InstagramService } from './instagram.service';

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
  ) {
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId);
    const finalIgAccountId = normalizeMetaGraphSegment(
      igAccountId || resolved.instagramAccountId || '',
      'Instagram account id',
    );
    const finalAccessToken = String(resolved.accessToken || '').trim();

    if (!finalAccessToken) {
      throw new BadRequestException('meta_instagram_connection_required');
    }

    return {
      igAccountId: finalIgAccountId,
      accessToken: finalAccessToken,
    };
  }

  @Get('profile')
  async getProfile(
    @Req() req: AuthenticatedRequest,
    @Query('igAccountId') igAccountId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveInstagramConnection(workspaceId, igAccountId);
    return this.instagramService.getProfile(connection.igAccountId, connection.accessToken);
  }

  @Get('media')
  async getMedia(
    @Req() req: AuthenticatedRequest,
    @Query('igAccountId') igAccountId: string,
    @Query('limit') limit: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveInstagramConnection(workspaceId, igAccountId);
    const clampedLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
    return this.instagramService.getMedia(
      connection.igAccountId,
      clampedLimit,
      connection.accessToken,
    );
  }

  @Get('insights/account')
  async getAccountInsights(
    @Req() req: AuthenticatedRequest,
    @Query('igAccountId') igAccountId: string,
    @Query('metrics') metrics: string,
    @Query('period') period: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveInstagramConnection(workspaceId, igAccountId);
    const metricsList = metrics ? metrics.split(',') : ['impressions', 'reach', 'follower_count'];
    return this.instagramService.getAccountInsights(
      connection.igAccountId,
      metricsList,
      period || 'day',
      connection.accessToken,
    );
  }

  @Post('publish/photo')
  async publishPhoto(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      igAccountId: string;
      imageUrl: string;
      caption: string;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveInstagramConnection(workspaceId, body.igAccountId);
    return this.instagramService.publishPhoto(
      connection.igAccountId,
      body.imageUrl,
      body.caption,
      connection.accessToken,
    );
  }

  @Get('media/:id/comments')
  async getComments(
    @Req() req: AuthenticatedRequest,
    @Param('id') mediaId: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveInstagramConnection(workspaceId);
    return this.instagramService.getComments(
      normalizeMetaGraphSegment(mediaId, 'Instagram media id'),
      connection.accessToken,
    );
  }

  @Post('comments/:id/reply')
  async replyToComment(
    @Req() req: AuthenticatedRequest,
    @Param('id') commentId: string,
    @Body() body: { text: string },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveInstagramConnection(workspaceId);
    return this.instagramService.replyToComment(
      normalizeMetaGraphSegment(commentId, 'Instagram comment id'),
      body.text,
      connection.accessToken,
    );
  }

  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  @Post('messages/send')
  async sendMessage(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      igAccountId: string;
      recipientId: string;
      text: string;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const connection = await this.resolveInstagramConnection(workspaceId, body.igAccountId);
    return this.instagramService.sendMessage(
      connection.igAccountId,
      normalizeMetaGraphSegment(body.recipientId, 'Instagram recipient id'),
      body.text,
      connection.accessToken,
    );
  }
}
