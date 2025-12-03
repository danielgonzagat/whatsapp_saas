import { Controller, Post, Body } from '@nestjs/common';
import { FunnelsService } from './funnels.service';

@Controller('funnels')
export class FunnelsController {
  constructor(private readonly funnelsService: FunnelsService) {}

  @Post('register')
  register(@Body() funnel: any) {
    this.funnelsService.registerFunnel(funnel);
    return { status: 'ok', funnel };
  }
}
