import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { LeadsService } from './leads.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';

@Controller('kloel/leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get(':workspaceId')
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query('status') status?: string,
    @Query('q') search?: string,
    @Query('limit') limit?: string,
  ) {
    const parsedLimit = limit ? Math.min(Math.max(Number(limit) || 20, 1), 100) : undefined;
    const data = await this.leads.listLeads(workspaceId, {
      status: status || undefined,
      search: search || undefined,
      limit: parsedLimit,
    });
    return data;
  }
}
