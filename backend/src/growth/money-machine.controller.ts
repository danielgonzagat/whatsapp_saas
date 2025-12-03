import { Controller, Post, Get, UseGuards, Request } from '@nestjs/common';
import { MoneyMachineService } from './money-machine.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ApiTags, ApiOperation, ApiBearerAuth } from '@nestjs/swagger';

@ApiTags('Money Machine')
@ApiBearerAuth()
@Controller('growth/money-machine')
@UseGuards(JwtAuthGuard)
export class MoneyMachineController {
  constructor(private readonly moneyMachine: MoneyMachineService) {}

  @Post('activate')
  @ApiOperation({
    summary: 'ACTIVATE THE MONEY MACHINE (Scan & Auto-Campaign)',
  })
  activate(@Request() req) {
    return this.moneyMachine.activateMachine(req.user.workspaceId);
  }

  @Get('report')
  @ApiOperation({ summary: 'Get daily financial report from the machine' })
  getReport(@Request() req) {
    return this.moneyMachine.getDailyReport(req.user.workspaceId);
  }
}
