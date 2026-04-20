import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { PaginationLimitPipe } from '../common/pagination-clamp.pipe';
import { LeadsService } from './leads.service';

/** Leads controller. */
@Controller('kloel/leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  /** List. */
  @UseGuards(JwtAuthGuard, WorkspaceGuard)
  @Get(':workspaceId')
  async list(
    @Param('workspaceId') workspaceId: string,
    @Query('status') status?: string,
    @Query('q') search?: string,
    // I17 — centralised clamp: [1, 100], default 20. Replaces the inline
    // Math.min(Math.max(...)) duplicated across 10+ controllers.
    @Query('limit', new PaginationLimitPipe()) limit: number = 20,
  ) {
    const data = await this.leads.listLeads(workspaceId, {
      status: status || undefined,
      search: search || undefined,
      limit,
    });
    return data;
  }
}
