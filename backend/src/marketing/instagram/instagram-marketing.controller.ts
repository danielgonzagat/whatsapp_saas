import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../../auth/workspace-access';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../../common/interfaces/authenticated-request.interface';
import { CreateInstagramPostDto } from './dto/create-instagram-post.dto';
import { InstagramInsightsQueryDto, VALID_METRICS } from './dto/instagram-insights-query.dto';
import {
  ListInstagramMessagesQueryDto,
  SendInstagramMessageDto,
} from './dto/send-instagram-message.dto';
import { InstagramMarketingService } from './instagram-marketing.service';
import { RouteClass } from '../../common/throttler/route-class.decorator';
import { PaginationLimitPipe } from '../../common/pagination-clamp.pipe';

@Controller('marketing/instagram')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('mutate')
export class InstagramMarketingController {
  constructor(private readonly instagramMarketingService: InstagramMarketingService) {}

  @Get('accounts')
  async listAccounts(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    return this.instagramMarketingService.listAccounts(workspaceId);
  }

  @Post('posts')
  async publishPost(@Req() req: AuthenticatedRequest, @Body() body: CreateInstagramPostDto) {
    const workspaceId = resolveWorkspaceId(req);
    return this.instagramMarketingService.publishPost(workspaceId, body.imageUrl, body.caption);
  }

  @Get('posts')
  async listPosts(
    @Req() req: AuthenticatedRequest,
    @Query('limit', new PaginationLimitPipe({ default: 25 })) limit?: number | string,
    @Query('offset') offset?: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const parsedLimit = Number(limit) || 25;
    const clampedLimit = Math.min(Math.max(parsedLimit, 1), 100);
    const clampedOffset = Math.max(Number(offset) || 0, 0);
    return this.instagramMarketingService.listPosts(workspaceId, clampedLimit, clampedOffset);
  }

  @Get('insights')
  async getInsights(@Req() req: AuthenticatedRequest, @Query() query: InstagramInsightsQueryDto) {
    const workspaceId = resolveWorkspaceId(req);

    const metricsList = query.metrics
      ? query.metrics
          .split(',')
          .map((m) => m.trim())
          .filter((m): m is string => (VALID_METRICS as readonly string[]).includes(m))
      : ['impressions', 'reach', 'follower_count'];

    if (metricsList.length === 0) {
      throw new BadRequestException('No valid metrics provided');
    }

    const period = query.period ?? 'day';

    return this.instagramMarketingService.getInsights(workspaceId, metricsList, period);
  }

  @Get('insights/history')
  async listInsights(
    @Req() req: AuthenticatedRequest,
    @Query('igAccountId') igAccountId?: string,
    @Query('since') since?: string,
    @Query('until') until?: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.instagramMarketingService.listInsights(workspaceId, igAccountId, since, until);
  }

  /**
   * Send a direct message via Instagram Messaging API.
   *
   * Mirrors `/marketing/facebook-messenger/send` shape so the frontend client
   * can share a single send-handler abstraction across channels.
   */
  // messageLimit: enforced via PlanLimitsService.trackMessageSend
  @Post('send')
  async sendDirectMessage(@Req() req: AuthenticatedRequest, @Body() body: SendInstagramMessageDto) {
    const workspaceId = resolveWorkspaceId(req);
    return this.instagramMarketingService.sendDirectMessage(
      workspaceId,
      body.recipientId,
      body.text,
    );
  }

  /**
   * List Instagram DM conversations from the Meta Graph API.
   *
   * Returns the upstream Graph payload plus the resolved IG account id so the
   * frontend can correlate threads to the connected business account.
   */
  @Get('conversations')
  async listConversations(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    return this.instagramMarketingService.listConversations(workspaceId);
  }

  /**
   * List persisted Instagram DM messages.
   *
   * Honest empty state today — the route exists for paridade with
   * `/marketing/facebook-messenger/messages` and will be backed by a real
   * `IgMessage` model + webhook ingest in a follow-up migration.
   */
  @Get('messages')
  async listMessages(
    @Req() req: AuthenticatedRequest,
    @Query() query: ListInstagramMessagesQueryDto,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.instagramMarketingService.listMessages(workspaceId, query.conversationId);
  }
}
