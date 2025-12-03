import { Controller, Post, Body, Get, Param, Req } from '@nestjs/common';
import { VideoService } from './video.service';
import { resolveWorkspaceId } from '../auth/workspace-access';

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
