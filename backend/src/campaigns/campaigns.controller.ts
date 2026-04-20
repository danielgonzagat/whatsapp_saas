import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
  UsePipes,
  ValidationPipe,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { CampaignsService } from './campaigns.service';
import { CreateCampaignDto } from './dto/create-campaign.dto';

/** Campaigns controller. */
@Controller('campaigns')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class CampaignsController {
  constructor(
    private readonly campaignsService: CampaignsService,
    private readonly planLimits: PlanLimitsService,
  ) {}

  /** Create. */
  @Post()
  @UsePipes(new ValidationPipe({ whitelist: true }))
  async create(@Req() req: AuthenticatedRequest, @Body() body: CreateCampaignDto) {
    const { workspaceId, ...data } = body;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);

    // Idempotency: if client sends X-Idempotency-Key, check for existingRecord
    const idempotencyKey = req.headers['x-idempotency-key'] as string | undefined;
    if (idempotencyKey) {
      const existingRecord = await this.campaignsService
        .findOne(effectiveWorkspaceId, idempotencyKey)
        .catch(() => null);
      if (existingRecord) {
        return existingRecord;
      }
    }

    await this.planLimits.ensureCampaignLimit(effectiveWorkspaceId);
    return this.campaignsService.create(effectiveWorkspaceId, data);
  }

  /** Find all. */
  @Get()
  findAll(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.campaignsService.findAll(effectiveWorkspaceId);
  }

  /** Find one. */
  @Get(':id')
  findOne(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('workspaceId') workspaceId: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.campaignsService.findOne(effectiveWorkspaceId, id);
  }

  /** Launch. */
  @Post(':id/launch')
  async launch(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { workspaceId: string; smartTime?: boolean },
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, body.workspaceId);
    await this.planLimits.ensureSubscriptionActive(effectiveWorkspaceId);
    return this.campaignsService.launch(effectiveWorkspaceId, id, body.smartTime);
  }

  /** Pause. */
  @Post(':id/pause')
  async pause(@Req() req: AuthenticatedRequest, @Param('id') id: string) {
    const workspaceId = resolveWorkspaceId(req);
    return this.campaignsService.pause(workspaceId, id);
  }

  /** Create variants. */
  @Post(':id/darwin/variants')
  async createVariants(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { workspaceId?: string; variants?: number },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.campaignsService.createVariants(workspaceId, id, body.variants || 3);
  }

  /** Evaluate darwin. */
  @Post(':id/darwin/evaluate')
  async evaluateDarwin(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() body: { workspaceId?: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.campaignsService.evaluateDarwin(workspaceId, id);
  }
}
