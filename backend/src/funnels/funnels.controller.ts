import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { FunnelsService } from './funnels.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

@UseGuards(JwtAuthGuard)
@Controller('funnels')
export class FunnelsController {
  constructor(private readonly funnelsService: FunnelsService) {}

  @Post('register')
  register(@Body() funnel: any) {
    this.funnelsService.registerFunnel(funnel);
    return { status: 'ok', funnel };
  }
}
