import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { CiaService } from './cia.service';

@ApiTags('CIA')
@Controller('cia')
export class CiaController {
  constructor(private readonly ciaService: CiaService) {}

  @Get('surface/:workspaceId')
  async getSurface(@Param('workspaceId') workspaceId: string) {
    return this.ciaService.getSurface(workspaceId);
  }

  @Post('autopilot-total/:workspaceId')
  async activateAutopilotTotal(
    @Param('workspaceId') workspaceId: string,
    @Body() body?: { limit?: number },
  ) {
    return this.ciaService.activateAutopilotTotal(
      workspaceId,
      body?.limit,
    );
  }
}
