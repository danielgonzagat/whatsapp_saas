import {
  Controller,
  Get,
  Post,
  Query,
  Body,
  Request,
  UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService } from './reports.service';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { PrismaService } from '../prisma/prisma.service';
import { EmailService } from '../auth/email.service';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  private ws(req: any): string {
    return req.user?.workspaceId || '';
  }

  @Get('vendas')
  getVendas(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getVendas(this.ws(req), f);
  }

  @Get('vendas/summary')
  getVendasSummary(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getVendasSummary(this.ws(req), f);
  }

  @Get('vendas/daily')
  getVendasDaily(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getVendasDaily(this.ws(req), f);
  }

  @Get('afterpay')
  getAfterPay(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getAfterPay(this.ws(req), f);
  }

  @Get('churn')
  getChurn(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getChurn(this.ws(req), f);
  }

  @Get('abandonos')
  getAbandonos(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getAbandonos(this.ws(req), f);
  }

  @Get('afiliados')
  getAfiliados(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getAfiliados(this.ws(req), f);
  }

  @Get('indicadores')
  getIndicadores(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getIndicadores(this.ws(req), f);
  }

  @Get('assinaturas')
  getAssinaturas(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getAssinaturas(this.ws(req), f);
  }

  @Get('indicadores-produto')
  getIndicadoresProduto(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getIndicadoresProduto(this.ws(req), f);
  }

  @Get('recusa')
  getRecusa(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getRecusa(this.ws(req), f);
  }

  @Get('origem')
  getOrigem(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getOrigem(this.ws(req), f);
  }

  @Post('ad-spend')
  registerAdSpend(
    @Request() req: any,
    @Body()
    body: {
      amount: number;
      platform: string;
      date: string;
      campaign?: string;
      description?: string;
    },
  ) {
    return this.reportsService.registerAdSpend(this.ws(req), body);
  }

  @Get('ad-spend')
  getAdSpends(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getAdSpends(this.ws(req), f);
  }

  @Get('metricas')
  getMetricas(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getMetricas(this.ws(req), f);
  }

  @Get('estornos')
  getEstornos(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getEstornos(this.ws(req), f);
  }

  @Get('chargeback')
  getChargeback(@Query() f: ReportFiltersDto, @Request() req: any) {
    return this.reportsService.getChargeback(this.ws(req), f);
  }

  // ── EMAIL REPORTS ──
  @Post('send-email')
  async sendReportEmail(
    @Request() req: any,
    @Body() body: { period?: string; email?: string },
  ) {
    const workspaceId = this.ws(req);
    const targetEmail = body.email || req.user?.email;
    if (!targetEmail) return { error: 'No email provided' };

    // Generate CSV from vendas summary
    const summary = await this.reportsService.getVendasSummary(workspaceId, {
      startDate: body.period?.split(',')[0],
      endDate: body.period?.split(',')[1],
    } as ReportFiltersDto);

    await this.emailService.sendEmail({
      to: targetEmail,
      subject: 'Relatorio KLOEL — Resumo de Vendas',
      html: `<div style="font-family:sans-serif;background:#0A0A0C;color:#e0e0e0;padding:40px;max-width:600px;margin:0 auto;">
        <h1 style="color:#E85D30;">KLOEL — Relatorio</h1>
        <p>Receita: R$ ${(summary.totalRevenue / 100).toFixed(2)}</p>
        <p>Vendas: ${summary.totalCount}</p>
        <p>Ticket Medio: R$ ${(summary.ticketMedio / 100).toFixed(2)}</p>
        <p>Conversao: ${summary.conversao}%</p>
      </div>`,
    });
    return { success: true, sentTo: targetEmail };
  }

  // ── NPS SURVEY ──
  @Post('nps')
  async submitNps(
    @Request() req: any,
    @Body() body: { score: number; comment?: string; orderId?: string; idempotencyKey?: string },
  ) {
    const workspaceId = this.ws(req);
    await this.prisma.auditLog.create({
      data: {
        workspaceId,
        action: 'nps_response',
        resource: 'survey',
        details: {
          score: body.score,
          comment: body.comment,
          orderId: body.orderId,
        },
      },
    });
    return { success: true };
  }

  @Get('nps')
  async getNps(@Request() req: any) {
    const workspaceId = this.ws(req);
    const responses = await this.prisma.auditLog.findMany({
      where: { workspaceId, action: 'nps_response' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const scores = responses.map((r: any) => r.details?.score).filter(Boolean);
    const avg =
      scores.length > 0
        ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length
        : 0;
    const promoters = scores.filter((s: number) => s >= 9).length;
    const detractors = scores.filter((s: number) => s <= 6).length;
    const nps =
      scores.length > 0
        ? Math.round(((promoters - detractors) / scores.length) * 100)
        : 0;
    return {
      nps,
      avg: avg.toFixed(1),
      total: scores.length,
      responses: responses.slice(0, 20),
    };
  }
}
