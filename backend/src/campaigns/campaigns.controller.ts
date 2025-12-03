import { Controller, Get, Post, Body, Param, Query, Req } from '@nestjs/common';
import { CampaignsService } from './campaigns.service';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { PlanLimitsService } from '../billing/plan-limits.service';

@Controller('campaigns')
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  @Post()
  async create(@Req() req: any, @Body() body: any) {
    const { workspaceId, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    await this.planLimits.ensureCampaignLimit(effectiveWorkspaceId);
    return this.campaignsService.create(effectiveWorkspaceId, data);
  }

  @Get()
  findAll(@Req() req: any, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.campaignsService.findAll(effectiveWorkspaceId);
  }

  @Get(':id')
  findOne(
    @Req() req: any,
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.campaignsService.findOne(effectiveWorkspaceId, id);
  }

  @Post(':id/launch')
  launch(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { workspaceId: string; smartTime?: boolean },
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.planLimits
      .ensureSubscriptionActive(effectiveWorkspaceId)
      .then(() =>
        this.campaignsService.launch(effectiveWorkspaceId, id, body.smartTime),
      );
  }

  @Post(':id/darwin/variants')
  async createVariants(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { workspaceId?: string; variants?: number },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.campaignsService.createVariants(
      workspaceId,
      id,
      body.variants || 3,
    );
  }

  @Post(':id/darwin/evaluate')
  async evaluateDarwin(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { workspaceId?: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.campaignsService.evaluateDarwin(workspaceId, id);
  }
}
