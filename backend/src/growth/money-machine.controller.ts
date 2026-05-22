import { Controller, Get, Post, Request, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { MoneyMachineService } from './money-machine.service';
import { RouteClass } from '../common/throttler/route-class.decorator';

/** Money machine controller. */
@ApiTags('Money Machine')
@ApiBearerAuth()
@Controller('growth/money-machine')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('ai')
export class MoneyMachineController {
  constructor(private readonly moneyMachine: MoneyMachineService) {}

  /** Activate. */
  @Post('activate')
  @ApiOperation({
    summary: 'ACTIVATE THE MONEY MACHINE (Scan & Auto-Campaign)',
  })
  activate(@Request() req: AuthenticatedRequest) {
    return this.moneyMachine.activateMachine(req.user.workspaceId);
  }

  /** Get report. */
  @Get('report')
  @ApiOperation({ summary: 'Get daily financial report from the machine' })
  getReport(@Request() req: AuthenticatedRequest) {
    return this.moneyMachine.getDailyReport(req.user.workspaceId);
  }
}
