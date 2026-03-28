// NOTE: No frontend integration yet — endpoints available for future use
import { Controller, Post, Body, Get, Param, Req, UseGuards } from '@nestjs/common';
import { VideoService } from './video.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('video')
export class VideoController {
  constructor(private readonly videoService: VideoService) {}

  @Post('create')
  async createJob(
    @Req() req: any,
    @Body() body: { inputUrl: string; prompt: string },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.videoService.createJob(workspaceId, body.inputUrl, body.prompt);
  }

  @Get('jobs')
  async listJobs(@Req() req: any) {
    const workspaceId = resolveWorkspaceId(req);
    return this.videoService.listJobs(workspaceId);
  }

  @Get('job/:id')
  async getJob(@Req() req: any, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.videoService.getJob(id, workspaceId);
  }
}
