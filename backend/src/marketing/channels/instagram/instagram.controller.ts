import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Param,
  Optional,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../../../auth/workspace-access';
import { WorkspaceGuard } from '../../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../../common/interfaces/authenticated-request.interface';
import { normalizeMetaGraphSegment } from '../../../meta/meta-input.util';
import { MetaWhatsAppService } from '../../../meta/meta-whatsapp.service';
import { InstagramService } from './instagram.service';
import { RouteClass } from '../../../common/throttler/route-class.decorator';
import { PaginationLimitPipe } from '../../../common/pagination-clamp.pipe';
import { ChannelMessageDispatchService } from '../../channel-message-dispatch.service';
import { isInstagramControllerCanonicalDispatchEnabled } from './instagram-controller-canonical-dispatch.flag';

/** Instagram controller. */
@Controller('meta/instagram')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class InstagramController {
  constructor(
    private readonly instagramService: InstagramService,
    private readonly metaWhatsApp: MetaWhatsAppService,
    @Optional()
    private readonly canonicalDispatch?: ChannelMessageDispatchService,
  ) {}

  private async resolveInstagramConnection(
    workspaceId: string,
    igAccountId?: string,
    accessToken?: string,
  ) {
    const resolved = await this.metaWhatsApp.resolveConnection(workspaceId, 'instagram');
    const finalIgAccountId = normalizeMetaGraphSegment(
      igAccountId || resolved.instagramAccountId || '',
      'Instagram account id',
    );
    const finalAccessToken = String(accessToken || resolved.accessToken || '').trim();

    if (!finalAccessToken) {
      throw new BadRequestException('meta_instagram_connection_required');
    }

    return {
      igAccountId: finalIgAccountId,
      accessToken: finalAccessToken,
    };
  }

  /** Get profile. */
  @Get('profile')
  async getProfile(
    @Req() req: AuthenticatedRequest,
    @Query('igAccountId') igAccountId: string,
    @Query('accessToken') accessToken: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const channelSession = await this.resolveInstagramConnection(
      workspaceId,
      igAccountId,
      accessToken,
    );
    return this.instagramService.getProfile(channelSession.igAccountId, channelSession.accessToken);
  }

  /** Get media. */
  @Get('media')
  async getMedia(
    @Req() req: AuthenticatedRequest,
    @Query('igAccountId') igAccountId: string,
    @Query('limit', new PaginationLimitPipe({ default: 25 })) limit: number,
    @Query('accessToken') accessToken: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const channelSession = await this.resolveInstagramConnection(
      workspaceId,
      igAccountId,
      accessToken,
    );
    return this.instagramService.getMedia(
      channelSession.igAccountId,
      limit,
      channelSession.accessToken,
    );
  }

  /** Get account insights. */
  @Get('insights/account')
  async getAccountInsights(
    @Req() req: AuthenticatedRequest,
    @Query('igAccountId') igAccountId: string,
    @Query('metrics') metrics: string,
    @Query('period') period: string,
    @Query('accessToken') accessToken: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const channelSession = await this.resolveInstagramConnection(
      workspaceId,
      igAccountId,
      accessToken,
    );
    const metricsList = metrics ? metrics.split(',') : ['impressions', 'reach', 'follower_count'];
    return this.instagramService.getAccountInsights(
      channelSession.igAccountId,
      metricsList,
      period || 'day',
      channelSession.accessToken,
    );
  }

  /** Publish photo. */
  @Post('publish/photo')
  async publishPhoto(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      igAccountId: string;
      imageUrl: string;
      caption: string;
      accessToken: string;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const channelSession = await this.resolveInstagramConnection(
      workspaceId,
      body.igAccountId,
      body.accessToken,
    );
    return this.instagramService.publishPhoto(
      channelSession.igAccountId,
      body.imageUrl,
      body.caption,
      channelSession.accessToken,
    );
  }

  /** Get comments. */
  @Get('media/:id/comments')
  async getComments(@Req() req: AuthenticatedRequest, @Param('id') mediaId: string) {
    const workspaceId = resolveWorkspaceId(req);
    const channelSession = await this.resolveInstagramConnection(workspaceId);
    return this.instagramService.getComments(
      normalizeMetaGraphSegment(mediaId, 'Instagram media id'),
      channelSession.accessToken,
    );
  }

  /** Reply to comment. */
  @Post('comments/:id/reply')
  async replyToComment(
    @Req() req: AuthenticatedRequest,
    @Param('id') commentId: string,
    @Body() body: { text: string },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const channelSession = await this.resolveInstagramConnection(workspaceId);
    return this.instagramService.replyToComment(
      normalizeMetaGraphSegment(commentId, 'Instagram comment id'),
      body.text,
      channelSession.accessToken,
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
      accessToken: string;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const channelSession = await this.resolveInstagramConnection(
      workspaceId,
      body.igAccountId,
      body.accessToken,
    );
    const recipientId = normalizeMetaGraphSegment(body.recipientId, 'Instagram recipient id');

    // ADDITIVE + flag-gated (KLOEL_INSTAGRAM_CONTROLLER_CANONICAL_DISPATCH,
    // DEFAULT OFF): route the outbound DM through the canonical cross-channel
    // dispatch front door. The already-resolved igAccountId + access token are
    // passed as explicit credential overrides so the canonical path uses the
    // EXACT same credentials this controller resolved. Any blocked/failed/empty
    // canonical result (or a missing/throwing canonical service) falls through
    // to the existing raw instagramService.sendMessage path, unchanged.
    if (isInstagramControllerCanonicalDispatchEnabled() && this.canonicalDispatch) {
      try {
        const result = await this.canonicalDispatch.dispatch(
          workspaceId,
          'instagram',
          recipientId,
          body.text,
          {
            igAccountId: channelSession.igAccountId,
            accessToken: channelSession.accessToken,
          },
        );
        if (result.success) {
          return { message_id: result.messageId ?? result.externalId ?? null };
        }
        // Honest blocked/failed canonical result: fall through to the raw path
        // below, which surfaces the real Meta failure semantics.
      } catch {
        // DI/build/dispatch failure: fall through to the raw path unchanged.
      }
    }

    return this.instagramService.sendMessage(
      channelSession.igAccountId,
      recipientId,
      body.text,
      channelSession.accessToken,
    );
  }
}
