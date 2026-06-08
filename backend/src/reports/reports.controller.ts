import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  Query,
  Request,
  UseGuards,
} from '@nestjs/common';
import { EmailService } from '../auth/email.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AuthenticatedRequest } from '../common/interfaces';
import { PrismaService } from '../prisma/prisma.service';
import { ReportFiltersDto } from './dto/report-filters.dto';
import { InternalEndpoint } from '../common/decorators/internal-endpoint.decorator';
import { ReportsService } from './reports.service';

import { RouteClass } from '../common/throttler/route-class.decorator';
type ReportResponseDetails = { score?: number; [key: string]: unknown };

/** Report types the email-report UI can request; each maps to a real builder + template. */
const EMAIL_REPORT_TYPES = ['vendas', 'assinaturas', 'abandonos', 'chargeback'] as const;
type EmailReportType = (typeof EMAIL_REPORT_TYPES)[number];

function isEmailReportType(value: string): value is EmailReportType {
  return (EMAIL_REPORT_TYPES as readonly string[]).includes(value);
}

// All dates stored as UTC via Prisma DateTime (toISOString)
@Controller('reports')
@UseGuards(JwtAuthGuard)
@RouteClass('read')
export class ReportsController {
  constructor(
    private readonly reportsService: ReportsService,
    private readonly prisma: PrismaService,
    private readonly emailService: EmailService,
  ) {}

  private ws(req: AuthenticatedRequest): string {
    return req.user?.workspaceId || '';
  }

  /** Get vendas. */
  @InternalEndpoint('sales report')
  @Get('vendas')
  getVendas(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getVendas(this.ws(req), f);
  }

  /** Get vendas summary. */
  @InternalEndpoint('sales summary report')
  @Get('vendas/summary')
  getVendasSummary(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getVendasSummary(this.ws(req), f);
  }

  /** Get vendas daily. */
  @Get('vendas/daily')
  getVendasDaily(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getVendasDaily(this.ws(req), f);
  }

  /** Get after pay. */
  @Get('afterpay')
  getAfterPay(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getAfterPay(this.ws(req), f);
  }

  /** Get churn. */
  @Get('churn')
  getChurn(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getChurn(this.ws(req), f);
  }

  /** Get abandonos. */
  @Get('abandonos')
  getAbandonos(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getAbandonos(this.ws(req), f);
  }

  /** Get afiliados. */
  @InternalEndpoint('affiliates report')
  @Get('afiliados')
  getAfiliados(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getAfiliados(this.ws(req), f);
  }

  /** Get indicadores. */
  @InternalEndpoint('indicators report')
  @Get('indicadores')
  getIndicadores(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getIndicadores(this.ws(req), f);
  }

  /** Get assinaturas. */
  @InternalEndpoint('subscriptions report')
  @Get('assinaturas')
  getAssinaturas(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getAssinaturas(this.ws(req), f);
  }

  /** Get indicadores produto. */
  @InternalEndpoint('product indicators report')
  @Get('indicadores-produto')
  getIndicadoresProduto(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getIndicadoresProduto(this.ws(req), f);
  }

  /** Get recusa. */
  @Get('recusa')
  getRecusa(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getRecusa(this.ws(req), f);
  }

  /** Get origem. */
  @InternalEndpoint('source report')
  @Get('origem')
  getOrigem(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getOrigem(this.ws(req), f);
  }

  /** Register ad spend. */
  @Post('ad-spend')
  registerAdSpend(
    @Request() req: AuthenticatedRequest,
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

  /** Get ad spends. */
  @Get('ad-spend')
  getAdSpends(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getAdSpends(this.ws(req), f);
  }

  /** Get metricas. */
  @Get('metricas')
  getMetricas(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getMetricas(this.ws(req), f);
  }

  /** Get estornos. */
  @Get('estornos')
  getEstornos(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getEstornos(this.ws(req), f);
  }

  /** Get chargeback. */
  @InternalEndpoint('chargeback report')
  @Get('chargeback')
  getChargeback(@Query() f: ReportFiltersDto, @Request() req: AuthenticatedRequest) {
    return this.reportsService.getChargeback(this.ws(req), f);
  }

  // ── EMAIL REPORTS ──
  @Post('send-email')
  async sendReportEmail(
    @Request() req: AuthenticatedRequest,
    @Body()
    body: { period?: string; email?: string; reportType?: string; filters?: ReportFiltersDto },
  ) {
    const workspaceId = this.ws(req);
    const targetEmail = (body.email || req.user?.email)?.trim();
    if (!targetEmail) {
      return { error: 'No email provided' };
    }

    const reportType = (body.reportType || 'vendas').trim();
    if (!isEmailReportType(reportType)) {
      throw new BadRequestException(
        `Unsupported reportType '${reportType}'. Supported: ${EMAIL_REPORT_TYPES.join(', ')}.`,
      );
    }

    const submittedFilters = body.filters ?? {};
    const periodParts = body.period
      ?.split(/\s*(?:,|\u2192|->)\s*/)
      .map((part) => part.trim())
      .filter(Boolean);
    const firstPeriodPart = periodParts?.[0];
    const secondPeriodPart = periodParts?.[1];
    const isoDate = /^\d{4}-\d{2}-\d{2}$/;
    const periodFilters: ReportFiltersDto =
      firstPeriodPart && isoDate.test(firstPeriodPart)
        ? {
            startDate: firstPeriodPart,
            ...(secondPeriodPart && isoDate.test(secondPeriodPart)
              ? { endDate: secondPeriodPart }
              : {}),
          }
        : {};
    const filters: ReportFiltersDto = { ...periodFilters, ...submittedFilters };

    const { subject, template, vars } = await this.buildReportEmail(
      reportType,
      workspaceId,
      filters,
    );

    await this.emailService.sendEmail({
      to: targetEmail,
      subject,
      html: (await import('../common/utils/email-template-renderer.util')).renderEmailTemplate(
        template,
        vars,
      ),
    });
    return { success: true, sentTo: targetEmail, reportType };
  }

  /** Build the subject, template name, and template variables for the selected report type. */
  private async buildReportEmail(
    reportType: EmailReportType,
    workspaceId: string,
    filters: ReportFiltersDto,
  ): Promise<{ subject: string; template: string; vars: Record<string, string> }> {
    switch (reportType) {
      case 'vendas': {
        const summary = await this.reportsService.getVendasSummary(workspaceId, filters);
        return {
          subject: 'Relatorio KLOEL — Resumo de Vendas',
          template: 'report-summary',
          vars: {
            totalRevenue: (summary.totalRevenue / 100).toFixed(2),
            totalCount: String(summary.totalCount),
            ticketMedio: (summary.ticketMedio / 100).toFixed(2),
            conversao: String(summary.conversao),
          },
        };
      }
      case 'assinaturas': {
        const report = await this.reportsService.getAssinaturas(workspaceId, filters);
        const active = report.summary
          .filter((s) => s.status === 'ACTIVE')
          .reduce((acc, s) => acc + s._count, 0);
        const recurring = report.summary.reduce((acc, s) => acc + (s._sum.amount ?? 0), 0);
        return {
          subject: 'Relatorio KLOEL — Assinaturas',
          template: 'report-assinaturas',
          vars: {
            totalCount: String(report.total),
            activeCount: String(active),
            recurringRevenue: (recurring / 100).toFixed(2),
          },
        };
      }
      case 'abandonos': {
        const report = await this.reportsService.getAbandonos(workspaceId, filters);
        const potential = report.data.reduce((acc, o) => acc + (o.totalInCents ?? 0), 0);
        return {
          subject: 'Relatorio KLOEL — Carrinhos Abandonados',
          template: 'report-abandonos',
          vars: {
            totalCount: String(report.total),
            potentialRevenue: (potential / 100).toFixed(2),
          },
        };
      }
      case 'chargeback': {
        const report = await this.reportsService.getChargeback(workspaceId, filters);
        const disputed = report.data.reduce((acc, p) => acc + (p.order?.totalInCents ?? 0), 0);
        return {
          subject: 'Relatorio KLOEL — Chargebacks',
          template: 'report-chargeback',
          vars: {
            totalCount: String(report.total),
            disputedAmount: (disputed / 100).toFixed(2),
          },
        };
      }
    }
  }

  // ── NPS SURVEY ──
  @Post('nps')
  async submitNps(
    @Request() req: AuthenticatedRequest,
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

  /** Get nps. */
  @Get('nps')
  async getNps(@Request() req: AuthenticatedRequest) {
    const workspaceId = this.ws(req);
    const responses = await this.prisma.auditLog.findMany({
      where: { workspaceId, action: 'nps_response' },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    const scores = responses
      .map((r) => (r.details as ReportResponseDetails | null)?.score)
      .filter((s): s is number => s != null);
    const avg =
      scores.length > 0 ? scores.reduce((a: number, b: number) => a + b, 0) / scores.length : 0;
    const promoters = scores.filter((s: number) => s >= 9).length;
    const detractors = scores.filter((s: number) => s <= 6).length;
    const nps =
      scores.length > 0 ? Math.round(((promoters - detractors) / scores.length) * 100) : 0;
    return {
      nps,
      avg: avg.toFixed(1),
      total: scores.length,
      responses: responses.slice(0, 20),
    };
  }
}
