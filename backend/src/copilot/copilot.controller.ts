import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { RouteClass } from '../common/throttler/route-class.decorator';
import { CopilotService } from './copilot.service';

type CopilotRequest = {
  user?: {
    workspaceId?: string;
  };
  params?: Record<string, unknown>;
  body?: Record<string, unknown>;
  query?: Record<string, unknown>;
};

type CopilotSuggestBody = {
  contactId?: string;
  phone?: string;
  kbSnippet?: string;
};

type CopilotSuggestMultipleBody = CopilotSuggestBody & {
  count?: number;
};

@ApiTags('Copilot')
@ApiBearerAuth()
@Controller('copilot')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
@RouteClass('ai')
export class CopilotController {
  constructor(private readonly copilot: CopilotService) {}

  @InternalEndpoint('sales copilot single suggestion')
  @Post('suggest')
  @ApiOperation({ summary: 'Generate one sales copilot suggestion' })
  suggest(@Req() req: CopilotRequest, @Body() body: CopilotSuggestBody = {}) {
    return this.copilot.suggest({
      workspaceId: resolveWorkspaceId(req),
      contactId: body.contactId,
      phone: body.phone,
      kbSnippet: body.kbSnippet,
    });
  }

  @InternalEndpoint('sales copilot suggestion batch')
  @Post('suggest/multiple')
  @ApiOperation({ summary: 'Generate multiple sales copilot suggestions' })
  suggestMultiple(@Req() req: CopilotRequest, @Body() body: CopilotSuggestMultipleBody = {}) {
    return this.copilot.suggestMultiple({
      workspaceId: resolveWorkspaceId(req),
      contactId: body.contactId,
      phone: body.phone,
      kbSnippet: body.kbSnippet,
      count: body.count || 3,
    });
  }
}
