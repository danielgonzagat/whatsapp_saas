import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { InstagramService } from './instagram.service';
import { JwtAuthGuard } from '../../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../../common/guards/workspace.guard';
import { resolveWorkspaceId } from '../../auth/workspace-access';

@Controller('meta/instagram')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class InstagramController {
  constructor(private readonly instagramService: InstagramService) {}

  @Get('profile')
  async getProfile(
    @Req() req: any,
    @Query('igAccountId') igAccountId: string,
    @Query('accessToken') accessToken: string,
  ) {
    resolveWorkspaceId(req);
    return this.instagramService.getProfile(igAccountId, accessToken);
  }

  @Get('media')
  async getMedia(
    @Req() req: any,
    @Query('igAccountId') igAccountId: string,
    @Query('limit') limit: string,
    @Query('accessToken') accessToken: string,
  ) {
    resolveWorkspaceId(req);
    return this.instagramService.getMedia(
      igAccountId,
      limit ? parseInt(limit, 10) : 25,
      accessToken,
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
    resolveWorkspaceId(req);
    const metricsList = metrics ? metrics.split(',') : ['impressions', 'reach', 'follower_count'];
    return this.instagramService.getAccountInsights(
      igAccountId,
      metricsList,
      period || 'day',
      accessToken,
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
    resolveWorkspaceId(req);
    return this.instagramService.publishPhoto(
      body.igAccountId,
      body.imageUrl,
      body.caption,
      body.accessToken,
    );
  }

  @Get('media/:id/comments')
  async getComments(
    @Req() req: any,
    @Param('id') mediaId: string,
    @Query('accessToken') accessToken: string,
  ) {
    resolveWorkspaceId(req);
    return this.instagramService.getComments(mediaId, accessToken);
  }

  @Post('comments/:id/reply')
  async replyToComment(
    @Req() req: any,
    @Param('id') commentId: string,
    @Body() body: { text: string; accessToken: string },
  ) {
    resolveWorkspaceId(req);
    return this.instagramService.replyToComment(
      commentId,
      body.text,
      body.accessToken,
    );
  }

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
    resolveWorkspaceId(req);
    return this.instagramService.sendMessage(
      body.igAccountId,
      body.recipientId,
      body.text,
      body.accessToken,
    );
  }
}
