import { Controller, Get, Query, Request, UseGuards } from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReportsService } from './reports.service';
import { ReportFiltersDto } from './dto/report-filters.dto';

@Controller('reports')
@UseGuards(JwtAuthGuard)
export class ReportsController {
  constructor(private readonly reportsService: ReportsService) {}

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
}
