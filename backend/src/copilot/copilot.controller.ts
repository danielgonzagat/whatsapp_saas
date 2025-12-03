import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { CopilotService } from './copilot.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';

@Controller('copilot')
@UseGuards(JwtAuthGuard)
export class CopilotController {
  constructor(private readonly copilot: CopilotService) {}

  @Post('suggest')
  async suggest(
    @Req() req: any,
    @Body()
    body: {
      workspaceId?: string;
      contactId?: string;
      phone?: string;
      kbSnippet?: string;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    const { contactId, phone, kbSnippet } = body || {};
    return this.copilot.suggest({ workspaceId, contactId, phone, kbSnippet });
  }
}
