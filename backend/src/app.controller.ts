import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';
import { safeCompareStrings } from './common/utils/crypto-compare.util';
import { PrismaService } from './prisma/prisma.service';
import { AuthenticatedRequest } from './common/interfaces/authenticated-request.interface';

interface DiagnosticTables {
  workspaces?: number;
  agents?: number;
  contacts?: number;
  conversations?: number;
}

interface DiagnosticResult {
  timestamp: string;
  database: 'checking...' | 'connected' | 'error';
  tables: DiagnosticTables;
  error?: string;
}

/** App controller. */
@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

  /** Get hello. */
  @Public()
  @Get()
  getHello(): string {
    return this.appService.getHello();
  }

  /**
   * Health check simples para Railway/load balancers
   * Retorna 200 OK se a aplicação está respondendo
   */
  @Public()
  @Get('health')
  healthCheck(): { status: string; timestamp: string; uptime: number } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Diagnóstico de banco de dados e tabelas
   */
  @Public()
  @Get('diag-db')
  async diagnostic(@Req() req: AuthenticatedRequest): Promise<DiagnosticResult> {
    const expected = process.env.DIAG_TOKEN;
    if (process.env.NODE_ENV === 'production' && !expected) {
      throw new UnauthorizedException('DIAG_TOKEN not configured');
    }
    if (expected) {
      const header = req.headers.authorization || '';
      const alt = req.headers['x-diag-token'];
      const bearer =
        typeof header === 'string' && header.startsWith('Bearer ') ? header.slice(7) : undefined;
      const provided =
        (typeof alt === 'string' && alt) ||
        bearer ||
        (typeof req.query?.token === 'string' ? req.query.token : undefined);
      if (!provided || !safeCompareStrings(provided, expected)) {
        throw new UnauthorizedException('Invalid diag token');
      }
    }

    const results: DiagnosticResult = {
      timestamp: new Date().toISOString(),
      database: 'checking...',
      tables: {},
    };

    try {
      // Testar conexão
      await this.prisma.$queryRaw`SELECT 1`;
      results.database = 'connected';

      // Contar registros em tabelas principais
      results.tables.workspaces = await this.prisma.workspace.count();
      results.tables.agents = await this.prisma.agent.count({ where: { workspaceId: undefined } });
      results.tables.contacts = await this.prisma.contact.count({
        where: { workspaceId: undefined },
      });
      results.tables.conversations = await this.prisma.conversation.count({
        where: { workspaceId: undefined },
      });
    } catch (_error: unknown) {
      results.database = 'error';
      // SECURITY: never expose error message or stack trace to caller.
      // Stack traces reveal internal paths, DB schemas, and library
      // versions. In non-production environments we still avoid leaking
      // the full stack; the caller can check application logs instead.
      results.error = 'database query failed';
    }

    return results;
  }
}
