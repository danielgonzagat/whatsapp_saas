import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Put,
  Query,
  Req,
} from '@nestjs/common';
import { PipelineService } from './pipeline.service';
import { resolveWorkspaceId } from '../auth/workspace-access';

@Controller('pipeline')
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get()
  async getPipeline(
    @Req() req: any,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.pipelineService.getPipeline(effectiveWorkspaceId);
  }

  @Post('deals')
  async createDeal(@Req() req: any, @Body() body: any) {
    const { workspaceId, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.pipelineService.createDeal(effectiveWorkspaceId, data);
  }

  @Put('deals/:id/stage')
  async updateStage(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { stageId: string },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.pipelineService.updateDealStage(workspaceId, id, body.stageId);
  }
}
