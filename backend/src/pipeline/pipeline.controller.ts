import { Body, Controller, Get, Param, Post, Put, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { CreateDealDto } from './dto/create-deal.dto';
import { PipelineService } from './pipeline.service';

@Controller('pipeline')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class PipelineController {
  constructor(private readonly pipelineService: PipelineService) {}

  @Get()
  async getPipeline(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.pipelineService.getPipeline(effectiveWorkspaceId);
  }

  @Post('deals')
  async createDeal(@Req() req: AuthenticatedRequest, @Body() body: CreateDealDto) {
    const { workspaceId, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.pipelineService.createDeal(effectiveWorkspaceId, data);
  }

  @Put('deals/:id/stage')
  async updateStage(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { stageId: string },
  ) {
    const workspaceId = resolveWorkspaceId(req);
    return this.pipelineService.updateDealStage(workspaceId, id, body.stageId);
  }
}
