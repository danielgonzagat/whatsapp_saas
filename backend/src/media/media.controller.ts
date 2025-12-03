import { Controller, Post, Body, Get, Param, Req } from '@nestjs/common';
import { MediaService } from './media.service';
import { resolveWorkspaceId } from '../auth/workspace-access';

@Controller('media')
export class MediaController {
  constructor(private readonly mediaService: MediaService) {}

  @Post('video')
  async generateVideo(@Req() req: any, @Body() body: any) {
    const { workspaceId, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.mediaService.createVideoJob(effectiveWorkspaceId, data);
  }

  @Get('job/:id')
  async getStatus(@Req() req: any, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.mediaService.getJobStatus(id, workspaceId);
  }
}
