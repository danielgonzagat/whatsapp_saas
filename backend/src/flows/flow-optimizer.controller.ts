import { Controller, Param, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { FlowOptimizerService } from './flow-optimizer.service';

/** Flow optimizer controller. */
@ApiTags('Flow AI')
@ApiBearerAuth()
@Controller('flows/ai')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class FlowOptimizerController {
  constructor(private readonly optimizer: FlowOptimizerService) {}

  /** Optimize. */
  @Post('optimize/:flowId')
  @ApiOperation({ summary: 'Trigger AI optimization for a flow' })
  async optimize(@Request() req, @Param('flowId') flowId: string) {
    return this.optimizer.optimizeFlow(req.user.workspaceId, flowId);
  }
}
