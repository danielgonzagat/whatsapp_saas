import { Body, Controller, Get, Post, Query, Req, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { WorkspaceGuard } from '../common/guards/workspace.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { AutopilotService } from './autopilot.service';

const PATTERN_RE = /,/g;

interface AutopilotActionRow {
  createdAt: Date | string;
  contactId?: string;
  contact?: string;
  intent?: string;
  action?: string;
  status?: string;
  reason?: string;
}

@Controller('autopilot')
@UseGuards(JwtAuthGuard, WorkspaceGuard)
export class AutopilotController {
  constructor(private readonly autopilotService: AutopilotService) {}

  @Post('toggle')
  toggle(
    @Req() req: AuthenticatedRequest,
    @Body() body: { enabled: boolean; workspaceId?: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.autopilotService.toggleAutopilot(workspaceId, body.enabled);
  }

  @Get('status')
  status(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.autopilotService.getStatus(effectiveWorkspaceId);
  }

  @Get('config')
  getWorkspaceConfig(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId?: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.autopilotService.getConfig(effectiveWorkspaceId);
  }

  @Get('stats')
  stats(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId?: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.autopilotService.getStats(effectiveWorkspaceId);
  }

  @Get('pipeline')
  pipeline(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId?: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.autopilotService.getPipelineStatus(effectiveWorkspaceId);
  }

  @Get('impact')
  impact(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId?: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return this.autopilotService.getImpact(effectiveWorkspaceId);
  }

  @Get('actions')
  actions(
    @Req() req: AuthenticatedRequest,
    @Query('workspaceId') workspaceId?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const clampedLimit = Math.min(Math.max(Number(limit) || 30, 1), 100);
    return this.autopilotService.getRecentActions(effectiveWorkspaceId, clampedLimit, status);
  }

  @Get('actions/export')
  async exportActions(
    @Req() req: AuthenticatedRequest,
    @Query('workspaceId') workspaceId?: string,
    @Query('status') status?: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const data: AutopilotActionRow[] = await this.autopilotService.getRecentActions(
      effectiveWorkspaceId,
      200,
      status,
    );
    const rows = [
      ['createdAt', 'contactId', 'contact', 'intent', 'action', 'status', 'reason'].join(','),
      ...data.map((d) =>
        [
          d.createdAt,
          d.contactId || '',
          (d.contact || '').replace(PATTERN_RE, ' '),
          d.intent || '',
          d.action || '',
          d.status || '',
          (d.reason || '').replace(PATTERN_RE, ' '),
        ].join(','),
      ),
    ].join('\n');
    return rows;
  }

  /**
   * Reprocessa um contato enfileirando o Autopilot (útil para retries).
   */
  @Post('retry')
  @Roles('ADMIN', 'AGENT')
  async retry(
    @Req() req: AuthenticatedRequest,
    @Body() body: { workspaceId?: string; contactId: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    if (!body.contactId) {
      throw new Error('contactId é obrigatório para retry');
    }
    return this.autopilotService.retryContact(workspaceId, body.contactId);
  }

  /**
   * Marca conversão manual/webhook.
   */
  @Post('conversion')
  @Roles('ADMIN', 'AGENT')
  async conversion(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      workspaceId?: string;
      contactId?: string;
      phone?: string;
      reason?: string;
      meta?: Record<string, unknown>;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.autopilotService.markConversion({
      workspaceId,
      contactId: body.contactId,
      phone: body.phone,
      reason: body.reason,
      meta: body.meta,
    });
  }

  /**
   * Configurações simples do Autopilot (ex.: flow pós-conversão).
   */
  @Post('config')
  @Roles('ADMIN')
  async config(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      workspaceId?: string;
      conversionFlowId?: string | null;
      currencyDefault?: string;
      recoveryTemplateName?: string | null;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.autopilotService.updateConfig(workspaceId, {
      conversionFlowId: body.conversionFlowId,
      currencyDefault: body.currencyDefault,
      recoveryTemplateName: body.recoveryTemplateName,
    });
  }

  /**
   * Dispara ciclo manual do Autopilot (útil para testes ou recuperação).
   */
  @Post('run')
  @Roles('ADMIN')
  async run(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      workspaceId?: string;
      phone?: string;
      contactId?: string;
      message?: string;
      forceLocal?: boolean;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    // Se houver dados de mensagem/contato, preferimos enfileirar no worker
    if (!body.forceLocal && (body.phone || body.contactId)) {
      return this.autopilotService.enqueueProcessing({
        workspaceId,
        phone: body.phone,
        contactId: body.contactId,
        message: body.message,
      });
    }
    const result = await this.autopilotService.runAutopilotCycle(workspaceId);
    return { workspaceId, ...result, mode: 'local' };
  }

  @Post('test')
  @Roles('ADMIN', 'AGENT')
  async test(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      workspaceId?: string;
      phone?: string;
      message?: string;
      waitMs?: number;
      liveSend?: boolean;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.autopilotService.runSmokeTest({
      workspaceId,
      phone: body.phone,
      message: body.message,
      waitMs: body.waitMs,
      liveSend: body.liveSend,
    });
  }

  /**
   * Máquina de Dinheiro: varre conversas e gera campanhas de reativação/fechamento.
   */
  @Post('money-machine')
  @Roles('ADMIN')
  async moneyMachine(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: {
      workspaceId?: string;
      topN?: number;
      autoSend?: boolean;
      smartTime?: boolean;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return this.autopilotService.moneyMachine(
      workspaceId,
      body?.topN || 200,
      !!body?.autoSend,
      !!body?.smartTime,
    );
  }

  @Get('insights')
  async insights(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId?: string) {
    const effective = resolveWorkspaceId(req, workspaceId);
    return this.autopilotService.getInsights(effective);
  }

  @Post('ask')
  async askInsights(
    @Req() req: AuthenticatedRequest,
    @Body() body: { workspaceId?: string; question: string },
  ) {
    const effective = resolveWorkspaceId(req, body.workspaceId);
    return this.autopilotService.askInsights(effective, body.question || '');
  }

  @Get('runtime-config')
  getRuntimeConfig() {
    return this.autopilotService.getRuntimeConfig();
  }

  @Get('queue')
  async queueStats() {
    return this.autopilotService.getQueueStats();
  }

  @Get('money-report')
  async moneyReport(@Req() req: AuthenticatedRequest, @Query('workspaceId') workspaceId?: string) {
    const effective = resolveWorkspaceId(req, workspaceId);
    return this.autopilotService.getMoneyReport(effective);
  }

  @Get('revenue-events')
  async revenueEvents(
    @Req() req: AuthenticatedRequest,
    @Query('workspaceId') workspaceId?: string,
    @Query('limit') limit?: string,
  ) {
    const effective = resolveWorkspaceId(req, workspaceId);
    const clampedRevenueLimit = Math.min(Math.max(Number(limit) || 20, 1), 100);
    return this.autopilotService.getRevenueEvents(effective, clampedRevenueLimit);
  }

  @Post('process')
  async process(
    @Req() req: AuthenticatedRequest,
    @Body() body: { workspaceId?: string; forceLocal?: boolean },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    if (!body.forceLocal) {
      return this.autopilotService.runAutopilotCycle(workspaceId);
    }
    const result = await this.autopilotService.runAutopilotCycle(workspaceId);
    return { workspaceId, ...result, mode: 'local' };
  }

  @Get('next-best-action')
  @Roles('ADMIN', 'AGENT')
  async nextBest(
    @Req() req: AuthenticatedRequest,
    @Query('workspaceId') workspaceId?: string,
    @Query('contactId') contactId?: string,
  ) {
    const effective = resolveWorkspaceId(req, workspaceId);
    if (!contactId) {
      throw new Error('contactId é obrigatório');
    }
    return this.autopilotService.nextBestAction(effective, contactId);
  }

  @Post('send')
  @Roles('ADMIN', 'AGENT')
  async sendDirect(
    @Req() req: AuthenticatedRequest,
    @Body()
    body: { workspaceId?: string; contactId: string; message: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    if (!body.contactId || !body.message) {
      throw new Error('contactId e message são obrigatórios');
    }
    // messageLimit: enforced via PlanLimitsService.trackMessageSend
    return this.autopilotService.sendDirectMessage(workspaceId, body.contactId, body.message);
  }
}
