import { Controller, Get } from '@nestjs/common';
import { Public } from './auth/public.decorator';
import { AppService } from './app.service';
import { PrismaService } from './prisma/prisma.service';

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
  @Get('health-simple')
  healthCheck(): { status: string; timestamp: string; uptime: number } {
    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
    };
  }

  /**
   * Diagnóstico de banco de dados
   */
  @Public()
  @Get('diag')
  async diagnostic() {
    const results: Record<string, any> = {
      timestamp: new Date().toISOString(),
      database: 'checking...',
      tables: {},
    };

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      results.database = 'connected';
      results.tables.workspaces = await this.prisma.workspace.count();
      results.tables.agents = await this.prisma.agent.count();
      results.tables.contacts = await this.prisma.contact.count();
    } catch (error: any) {
      results.database = 'error';
      results.error = error.message;
    }

    return results;
  }
}
