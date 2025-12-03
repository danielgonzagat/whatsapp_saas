import { Controller, Post, Param, UseGuards, Request } from '@nestjs/common';
import { NeuroCrmService } from './neuro-crm.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';
import { Body, Get } from '@nestjs/common';

@ApiTags('NeuroCRM')
@ApiBearerAuth()
@Controller('crm/neuro')
@UseGuards(JwtAuthGuard)
export class NeuroCrmController {
  constructor(private readonly neuroService: NeuroCrmService) {}

  @Post('analyze/:contactId')
  @ApiOperation({ summary: 'Manually trigger AI analysis for a contact' })
  async analyze(@Request() req, @Param('contactId') contactId: string) {
    return this.neuroService.analyzeContact(req.user.workspaceId, contactId);
  }

  @Get('next-best/:contactId')
  @ApiOperation({ summary: 'Get next best action for a contact' })
  async nba(@Request() req, @Param('contactId') contactId: string) {
    return this.neuroService.nextBestAction(req.user.workspaceId, contactId);
  }

  @Get('clusters')
  @ApiOperation({ summary: 'Cluster leads for this workspace' })
  async clusters(@Request() req) {
    return this.neuroService.clusterLeads(req.user.workspaceId);
  }

  @Post('simulate')
  @ApiOperation({ summary: 'Simulate a sales conversation' })
  async simulate(
    @Request() req,
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
