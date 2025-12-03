import { Controller, Post, Param, UseGuards, Request } from '@nestjs/common';
import { FlowOptimizerService } from './flow-optimizer.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Flow AI')
@ApiBearerAuth()
@Controller('flows/ai')
@UseGuards(JwtAuthGuard)
export class FlowOptimizerController {
  constructor(private readonly optimizer: FlowOptimizerService) {}

  @Post('optimize/:flowId')
  @ApiOperation({ summary: 'Trigger AI optimization for a flow' })
  async optimize(@Request() req, @Param('flowId') flowId: string) {
    return this.optimizer.optimizeFlow(req.user.workspaceId, flowId);
  }
}
