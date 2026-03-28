import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../prisma/prisma.service';
import { flowQueue } from '../queue/queue';

/**
 * Serviço de Reengajamento de Onboarding
 *
 * Verifica workspaces que iniciaram onboarding mas não finalizaram
 * e envia lembretes via WhatsApp ou email.
 */
@Injectable()
export class OnboardingReengagementService {
  private readonly logger = new Logger(OnboardingReengagementService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Job diário para verificar onboardings pendentes
   * Executa às 10h da manhã (horário comercial)
   */
  @Cron(CronExpression.EVERY_DAY_AT_10AM)
  async checkPendingOnboardings() {
    this.logger.log('🔄 Verificando onboardings pendentes...');

    try {
      const pendingWorkspaces = await this.findPendingOnboardings();

      for (const workspace of pendingWorkspaces) {
        await this.sendReengagementMessage(workspace);
      }

      this.logger.log(
        `✅ Reengajamento enviado para ${pendingWorkspaces.length} workspaces`,
      );
    } catch (error: any) {
      this.logger.error(`Erro no reengajamento: ${error.message}`);
    }
  }

  /**
   * Encontra workspaces com onboarding iniciado mas não finalizado
   */
  private async findPendingOnboardings() {
    const prismaAny = this.prisma as Record<string, any>;
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);

    // Buscar workspaces que:
    // 1. Iniciaram onboarding (têm memória de businessName)
    // 2. Não finalizaram (não têm onboarding_completed = true)
    // 3. Última atividade entre 24h e 48h atrás (evita spam)
    const startedOnboarding = await prismaAny.kloelMemory.findMany({
      where: {
        key: 'businessName',
        updatedAt: {
          gte: fortyEightHoursAgo,
          lte: twentyFourHoursAgo,
        },
      },
      select: { workspaceId: true },
    });

    const workspaceIds = startedOnboarding.map((m: any) => m.workspaceId);

    if (workspaceIds.length === 0) return [];

    // Filtrar os que não completaram
    const completedOnboarding = await prismaAny.kloelMemory.findMany({
      where: {
        workspaceId: { in: workspaceIds },
        key: 'onboarding_completed',
        value: true,
      },
      select: { workspaceId: true },
    });

    const completedIds = new Set(
      completedOnboarding.map((m: any) => m.workspaceId),
    );
    const pendingIds = workspaceIds.filter(
      (id: string) => !completedIds.has(id),
    );

    if (pendingIds.length === 0) return [];

    // Verificar se já enviamos reengajamento recentemente
    const recentReengagement = await prismaAny.kloelMemory.findMany({
      where: {
        workspaceId: { in: pendingIds },
        key: 'reengagement_sent',
        updatedAt: { gte: twentyFourHoursAgo },
      },
      select: { workspaceId: true },
    });

    const recentIds = new Set(
      recentReengagement.map((m: any) => m.workspaceId),
    );
    const eligibleIds = pendingIds.filter((id: string) => !recentIds.has(id));

    // Buscar dados do workspace para reengajamento
    const workspaces = await this.prisma.workspace.findMany({
      where: { id: { in: eligibleIds } },
      select: {
        id: true,
        name: true,
        providerSettings: true,
      },
    });

    return workspaces;
  }

  /**
   * Envia mensagem de reengajamento
   */
  private async sendReengagementMessage(workspace: any) {
    const prismaAny = this.prisma as Record<string, any>;
    const settings = workspace.providerSettings;

    // Buscar nome do negócio para personalização
    const businessName = await prismaAny.kloelMemory.findFirst({
      where: { workspaceId: workspace.id, key: 'businessName' },
    });

    const name = businessName?.value || workspace.name || 'lá';

    // Buscar telefone de contato (se houver)
    const ownerPhone = settings?.ownerPhone || settings?.mainPhone;

    const message =
      `👋 Olá ${name}!\n\n` +
      `Percebi que você começou a configurar o KLOEL mas ainda não finalizou.\n\n` +
      `Posso te ajudar a completar em menos de 5 minutos! Basta responder aqui.\n\n` +
      `💡 Dica: Com a configuração completa, você poderá:\n` +
      `• Atender clientes automaticamente 24h\n` +
      `• Fechar vendas pelo WhatsApp\n` +
      `• Qualificar leads automaticamente\n\n` +
      `Quer continuar de onde parou?`;

    try {
      // Enfileirar mensagem via WhatsApp (se tiver telefone)
      if (ownerPhone) {
        await flowQueue.add('send-message', {
          workspaceId: workspace.id,
          user: ownerPhone.replace(/\D/g, ''),
          message,
        });
        this.logger.log(
          `📱 Reengajamento enviado via WhatsApp para ${workspace.id}`,
        );
      }

      // Marcar que enviamos reengajamento
      await prismaAny.kloelMemory.upsert({
        where: {
          workspaceId_key: {
            workspaceId: workspace.id,
            key: 'reengagement_sent',
          },
        },
        update: { value: new Date().toISOString(), updatedAt: new Date() },
        create: {
          workspaceId: workspace.id,
          key: 'reengagement_sent',
          value: new Date().toISOString(),
          category: 'system',
        },
      });
    } catch (error: any) {
      this.logger.warn(
        `Falha no reengajamento ${workspace.id}: ${error.message}`,
      );
    }
  }

  /**
   * Método manual para disparar reengajamento (para testes)
   */
  async triggerReengagement(workspaceId: string) {
    const workspace = await this.prisma.workspace.findUnique({
      where: { id: workspaceId },
    });

    if (!workspace) {
      return { success: false, error: 'Workspace não encontrado' };
    }

    await this.sendReengagementMessage(workspace);
    return { success: true, message: 'Reengajamento enviado' };
  }
}
