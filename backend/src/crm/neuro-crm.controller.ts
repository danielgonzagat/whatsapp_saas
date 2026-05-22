import { Body, Controller, Get, Param, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { NeuroCrmService } from './neuro-crm.service';
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface';
import { RouteClass } from '../common/throttler/route-class.decorator';

/** Neuro crm controller. */
@ApiTags('NeuroCRM')
@ApiBearerAuth()
@Controller('crm/neuro')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('ai')
export class NeuroCrmController {
  constructor(private readonly neuroService: NeuroCrmService) {}

  /** Analyze. */
  @Post('analyze/:contactId')
  @ApiOperation({ summary: 'Manually trigger AI analysis for a contact' })
  async analyze(@Req() req: AuthenticatedRequest, @Param('contactId') contactId: string) {
    return this.neuroService.analyzeContact(req.user.workspaceId, contactId);
  }

  /** Nba. */
  @Get('next-best/:contactId')
  @ApiOperation({ summary: 'Get next best action for a contact' })
  async nba(@Req() req: AuthenticatedRequest, @Param('contactId') contactId: string) {
    return this.neuroService.nextBestAction(req.user.workspaceId, contactId);
  }

  /** Clusters. */
  @Get('clusters')
  @ApiOperation({ summary: 'Cluster leads for this workspace' })
  async clusters(@Req() req: AuthenticatedRequest) {
    return this.neuroService.clusterLeads(req.user.workspaceId);
  }

  /** Simulate. */
  @Post('simulate')
  @ApiOperation({ summary: 'Simulate a sales conversation' })
  async simulate(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      persona: string;
      scenario: string;
      goal: string;
    },
  ) {
    return this.neuroService.simulateConversation({
      workspaceId: req.user.workspaceId,
      persona: body.persona,
      scenario: body.scenario,
      goal: body.goal,
    });
  }
}
