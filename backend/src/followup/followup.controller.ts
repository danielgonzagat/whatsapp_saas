import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Body,
  Param,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { FollowUpService, CreateFollowUpDto, UpdateFollowUpDto } from './followup.service';

@Controller('followups')
@UseGuards(JwtAuthGuard)
export class FollowUpController {
  constructor(private readonly followUpService: FollowUpService) {}

  @Get()
  async list(
    @Req() req: any,
    @Query('workspaceId') workspaceId?: string,
    @Query('status') status?: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.followUpService.list(effectiveWorkspaceId, status);
  }

  @Get('stats')
  async stats(
    @Req() req: any,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.followUpService.getStats(effectiveWorkspaceId);
  }

  @Post()
  async create(
    @Req() req: any,
    @Body() dto: CreateFollowUpDto & { workspaceId?: string },
  ) {
    const { workspaceId, ...rest } = dto;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.followUpService.create(effectiveWorkspaceId, rest);
  }

  @Patch(':id')
  async update(
    @Req() req: any,
    @Param('id') id: string,
    @Body() dto: UpdateFollowUpDto & { workspaceId?: string },
  ) {
    const { workspaceId, ...rest } = dto;
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.followUpService.update(effectiveWorkspaceId, id, rest);
  }

  @Delete(':id')
  async cancel(
    @Req() req: any,
    @Param('id') id: string,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.followUpService.cancel(effectiveWorkspaceId, id);
  }
}
