import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { StructuredLogger } from '../logging/structured-logger';
import { appendFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import type { AuthenticatedRequest } from '../common/interfaces';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';

@Controller('admin')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class LacunasController {
  private readonly logger = StructuredLogger.from(LacunasController.name);

  @InternalEndpoint('admin lacunas suggestion')
  @Post('lacunas-suggest')
  async suggest(@Body() body: { intent?: string; userMessage?: string }, @Req() req: AuthenticatedRequest) {
    const entry = {
      suggestedAt: new Date().toISOString(),
      workspaceId: req.workspaceId || req.user?.workspaceId || 'unknown',
      intent: body.intent ?? 'unspecified',
      userMessage: (body.userMessage ?? '').slice(0, 500),
    };

    try {
      const dir = join(process.cwd(), 'artifacts');
      if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
      }
      appendFileSync(join(dir, 'lacunas-suggestions.jsonl'), JSON.stringify(entry) + '\n', 'utf-8');
    } catch (error: unknown) {
      this.logger.warn(`Failed to persist lacuna suggestion: ${error instanceof Error ? error.message : 'unknown'}`);
    }

    this.logger.log(`Lacuna suggestion recorded: ${entry.intent} from ${entry.workspaceId}`);
    return { ok: true };
  }
}
