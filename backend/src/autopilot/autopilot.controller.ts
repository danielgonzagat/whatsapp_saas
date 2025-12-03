import {
  Controller,
  Post,
  Get,
  Body,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { AutopilotService } from './autopilot.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { resolveWorkspaceId } from '../auth/workspace-access';
import { Roles } from '../auth/roles.decorator';

@Controller('autopilot')
@UseGuards(JwtAuthGuard)
export class AutopilotController {
  constructor(private readonly autopilotService: AutopilotService) {}

  @Post('toggle')
  toggle(
    @Req() req: any,
    @Body() body: { enabled: boolean; workspaceId?: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    // Cast to any to avoid type mismatch if build artifacts are stale
    return (this.autopilotService as any).toggleAutopilot(
      workspaceId,
      body.enabled,
    );
  }

  @Get('status')
  status(@Req() req: any, @Query('workspaceId') workspaceId: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return (this.autopilotService as any).getStatus(effectiveWorkspaceId);
  }

  @Get('config')
  getWorkspaceConfig(
    @Req() req: any,
    @Query('workspaceId') workspaceId?: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return (this.autopilotService as any).getConfig(effectiveWorkspaceId);
  }

  @Get('stats')
  stats(@Req() req: any, @Query('workspaceId') workspaceId?: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return (this.autopilotService as any).getStats(effectiveWorkspaceId);
  }

  @Get('impact')
  impact(@Req() req: any, @Query('workspaceId') workspaceId?: string) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    return (this.autopilotService as any).getImpact(effectiveWorkspaceId);
  }

  @Get('actions')
  actions(
    @Req() req: any,
    @Query('workspaceId') workspaceId?: string,
    @Query('limit') limit?: string,
    @Query('status') status?: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const parsed = limit ? parseInt(limit, 10) || 30 : 30;
    return (this.autopilotService as any).getRecentActions(
      effectiveWorkspaceId,
      parsed,
      status,
    );
  }

  @Get('actions/export')
  async exportActions(
    @Req() req: any,
    @Query('workspaceId') workspaceId?: string,
    @Query('status') status?: string,
  ) {
    const effectiveWorkspaceId = resolveWorkspaceId(req, workspaceId);
    const data = await (this.autopilotService as any).getRecentActions(
      effectiveWorkspaceId,
      200,
      status,
    );
    const rows = [
      ['createdAt', 'contactId', 'contact', 'intent', 'action', 'status', 'reason'].join(','),
      ...data.map((d: any) =>
        [
          d.createdAt,
          d.contactId || '',
          (d.contact || '').replace(/,/g, ' '),
          d.intent || '',
          d.action || '',
          d.status || '',
          (d.reason || '').replace(/,/g, ' '),
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
    @Req() req: any,
    @Body() body: { workspaceId?: string; contactId: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    if (!body.contactId) {
      throw new Error('contactId é obrigatório para retry');
    }
    return (this.autopilotService as any).retryContact(
      workspaceId,
      body.contactId,
    );
  }

  /**
   * Marca conversão manual/webhook.
   */
  @Post('conversion')
  @Roles('ADMIN', 'AGENT')
  async conversion(
    @Req() req: any,
    @Body()
    body: {
      workspaceId?: string;
      contactId?: string;
      phone?: string;
      reason?: string;
      meta?: Record<string, any>;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return (this.autopilotService as any).markConversion({
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
    @Req() req: any,
    @Body()
    body: {
      workspaceId?: string;
      conversionFlowId?: string | null;
      currencyDefault?: string;
      recoveryTemplateName?: string | null;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return (this.autopilotService as any).updateConfig(workspaceId, {
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
    @Req() req: any,
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
      return (this.autopilotService as any).enqueueProcessing({
        workspaceId,
        phone: body.phone,
        contactId: body.contactId,
        message: body.message,
      });
    }
    const result = await (this.autopilotService as any).runAutopilotCycle(
      workspaceId,
    );
    return { workspaceId, ...result, mode: 'local' };
  }

  /**
   * Máquina de Dinheiro: varre conversas e gera campanhas de reativação/fechamento.
   */
  @Post('money-machine')
  @Roles('ADMIN')
  async moneyMachine(
    @Req() req: any,
    @Body()
    body: {
      workspaceId?: string;
      topN?: number;
      autoSend?: boolean;
      smartTime?: boolean;
    },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    return (this.autopilotService as any).moneyMachine(
      workspaceId,
      body?.topN || 200,
      !!body?.autoSend,
      !!body?.smartTime,
    );
  }

  @Get('insights')
  async insights(@Req() req: any, @Query('workspaceId') workspaceId?: string) {
    const effective = resolveWorkspaceId(req, workspaceId);
    return (this.autopilotService as any).getInsights(effective);
  }

  @Post('ask')
  async askInsights(
    @Req() req: any,
    @Body() body: { workspaceId?: string; question: string },
  ) {
    const effective = resolveWorkspaceId(req, body.workspaceId);
    return (this.autopilotService as any).askInsights(
      effective,
      body.question || '',
    );
  }

  @Get('runtime-config')
  async getRuntimeConfig() {
    return (this.autopilotService as any).getRuntimeConfig();
  }

  @Get('queue')
  async queueStats() {
    return (this.autopilotService as any).getQueueStats();
  }

  @Get('money-report')
  async moneyReport(@Req() req: any, @Query('workspaceId') workspaceId?: string) {
    const effective = resolveWorkspaceId(req, workspaceId);
    return (this.autopilotService as any).getMoneyReport(effective);
  }

  @Get('revenue-events')
  async revenueEvents(
    @Req() req: any,
    @Query('workspaceId') workspaceId?: string,
    @Query('limit') limit?: string,
  ) {
    const effective = resolveWorkspaceId(req, workspaceId);
    const parsed = limit ? parseInt(limit, 10) || 20 : 20;
    return (this.autopilotService as any).getRevenueEvents(effective, parsed);
  }

  @Post('process')
  async process(
    @Req() req: any,
    @Body() body: { workspaceId?: string; forceLocal?: boolean },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    if (!body.forceLocal) {
      return (this.autopilotService as any).runAutopilotCycle(workspaceId);
    }
    const result = await (this.autopilotService as any).runAutopilotCycle(
      workspaceId,
    );
    return { workspaceId, ...result, mode: 'local' };
  }

  @Get('next-best-action')
  @Roles('ADMIN', 'AGENT')
  async nextBest(
    @Req() req: any,
    @Query('workspaceId') workspaceId?: string,
    @Query('contactId') contactId?: string,
  ) {
    const effective = resolveWorkspaceId(req, workspaceId);
    if (!contactId) {
      throw new Error('contactId é obrigatório');
    }
    return (this.autopilotService as any).nextBestAction(
      effective,
      contactId,
    );
  }

  @Post('send')
  @Roles('ADMIN', 'AGENT')
  async sendDirect(
    @Req() req: any,
    @Body()
    body: { workspaceId?: string; contactId: string; message: string },
  ) {
    const workspaceId = resolveWorkspaceId(req, body.workspaceId);
    if (!body.contactId || !body.message) {
      throw new Error('contactId e message são obrigatórios');
    }
    return (this.autopilotService as any).sendDirectMessage(
      workspaceId,
      body.contactId,
      body.message,
    );
  }
}
