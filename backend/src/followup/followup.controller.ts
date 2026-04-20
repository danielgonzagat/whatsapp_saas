import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import type { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { CreateFollowUpDto, FollowUpService, UpdateFollowUpDto } from './followup.service';

/** Follow up controller. */
@Controller('followups')
@UseGuards(JwtAuthGuard)
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  /** List. */
  @Get()
  async list(
    @Req() req: AuthenticatedRequest,
    @Query('workspaceId') workspaceId?: string,
    @Query('status') status?: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.followUpService.list(effectiveWorkspaceId, status);
  }

  /** Stats. */
  @Get('stats')
  async stats(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId?: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.followUpService.getStats(effectiveWorkspaceId);
  }

  /** Create. */
  @Post()
  async create(
    @Req() req: AuthenticatedRequest,
    @Body() dto: CreateFollowUpDto & { workspaceId?: string; idempotencyKey?: string },
  ) {
    const { workspaceId, ...rest } = dto;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.followUpService.create(effectiveWorkspaceId, rest);
  }

  /** Update. */
  @Patch(':id')
  async update(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Body() dto: UpdateFollowUpDto & { workspaceId?: string },
  ) {
    const { workspaceId, ...rest } = dto;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.followUpService.update(effectiveWorkspaceId, id, rest);
  }

  /** Cancel. */
  @Delete(':id')
  async cancel(
    @Req() req: AuthenticatedRequest,
    @Param('id') id: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.followUpService.cancel(effectiveWorkspaceId, id);
  }
}
