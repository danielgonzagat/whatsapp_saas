// NOTE: No frontend integration yet — endpoints available for future use
import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { VideoService } from './video.service';

@UseGuards(JwtAuthGuard)
@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('create')
  async createJob(
    @Req() req: AuthenticatedRequest,
    @Body() body: { inputUrl: string; prompt: string },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.videoService.createJob(workspaceId, body.inputUrl, body.prompt);
  }

  @Get('jobs')
  async listJobs(@Req() req: AuthenticatedRequest) {
    const workspaceId = resolveWorkspaceId(req);
    return this.videoService.listJobs(workspaceId);
  }

  @Get('job/:id')
  async getJob(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.videoService.getJob(id, workspaceId);
  }
}
