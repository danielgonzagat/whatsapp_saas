import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Logger,
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
import { InstagramMarketingService } from './instagram-marketing.service';

@Controller('marketing/instagram')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class InstagramMarketingController {
  private readonly logger = new Logger(InstagramMarketingController.name);

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
    @Query('limit') limit?: string,
    @Query('offset') offset?: string,
  ) {
    const workspaceId = resolveWorkspaceId(req);
    const clampedLimit = Math.min(Math.max(Number(limit) || 25, 1), 100);
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
}
