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

  @Get('human-tasks/:workspaceId')
  async getHumanTasks(@Param('workspaceId') workspaceId: string) {
    return this.ciaService.getHumanTasks(workspaceId);
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

  @Post('human-tasks/:workspaceId/:taskId/approve')
  async approveHumanTask(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
    @Body() body?: { message?: string; resume?: boolean },
  ) {
    return this.ciaService.approveHumanTask(workspaceId, taskId, body);
  }

  @Post('human-tasks/:workspaceId/:taskId/reject')
  async rejectHumanTask(
    @Param('workspaceId') workspaceId: string,
    @Param('taskId') taskId: string,
  ) {
    return this.ciaService.rejectHumanTask(workspaceId, taskId);
  }

  @Post('conversations/:workspaceId/:conversationId/resume')
  async resumeConversation(
    @Param('workspaceId') workspaceId: string,
    @Param('conversationId') conversationId: string,
  ) {
    return this.ciaService.resumeConversation(workspaceId, conversationId);
  }
}
