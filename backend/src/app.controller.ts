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
  @Get('diag')
  async diagnostic() {
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
    } catch (error: any) {
      results.database = 'error';
      results.error = error.message;
      results.stack = error.stack?.split('\n').slice(0, 5);
    }

    return results;
  }
}
