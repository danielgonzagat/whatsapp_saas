import { Controller, Get, Req, UnauthorizedException } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/public.decorator';
import { safeCompareStrings } from './common/utils/crypto-compare.util';
import { PrismaService } from './prisma/prisma.service';
import { AuthenticatedRequest } from './common/interfaces/authenticated-request.interface';

@Controller()
export class AppController {
  constructor(
    private readonly appService: AppService,
    private readonly prisma: PrismaService,
  ) {}

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
  async diagnostic(@Req() req: AuthenticatedRequest) {
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

    const results: Record<string, any> = {
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
      results.tables.agents = await this.prisma.agent.count();
      results.tables.contacts = await this.prisma.contact.count();
      results.tables.conversations = await this.prisma.conversation.count();
    } catch (error: unknown) {
      results.database = 'error';
      results.error = error instanceof Error ? error.message : 'unknown error';
      results.stack = error instanceof Error ? error.stack?.split('\n').slice(0, 5) : undefined;
    }

    return results;
  }
}
