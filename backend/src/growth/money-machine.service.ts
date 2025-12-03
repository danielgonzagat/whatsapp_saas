import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CampaignsService } from '../campaigns/campaigns.service';
import { AgentAssistService } from '../ai-brain/agent-assist.service';
import { v4 as uuid } from 'uuid';

@Injectable()
export class MoneyMachineService {
  private readonly logger = new Logger(MoneyMachineService.name);

  constructor(
    private prisma: PrismaService,
    private campaigns: CampaignsService,
    private agentAssist: AgentAssistService,
  ) {}

  async activate(workspaceId: string) {
    this.logger.log(`💰 Activating Money Machine for ${workspaceId}`);

    // 1. Scan for Opportunities
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const inactiveLeads = await this.prisma.contact.count({
      where: {
        workspaceId,
        conversations: { some: { lastMessageAt: { lt: thirtyDaysAgo } } },
      },
    });

    // 2. Auto-Generate Campaigns
    if (inactiveLeads > 0) {
      const name = `MoneyMachine - Reativação ${new Date().toISOString().split('T')[0]}`;

      // Generate Copy using AI (Mocked for speed)
      const copy =
        'Oi! Faz um tempo que não nos falamos. Tenho uma novidade que pode te interessar. Posso te mandar?';

      // Create a Flow for this campaign
      const flowId = uuid();
      const startNodeId = uuid();

      await this.prisma.flow.create({
        data: {
          id: flowId,
          workspaceId,
          name: `${name} Flow`,
          triggerType: 'MANUAL',
          nodes: [
            {
              id: startNodeId,
              type: 'messageNode',
              data: { text: copy },
              position: { x: 100, y: 100 },
            },
          ],
          edges: [],
        },
      });

      const campaign = await this.campaigns.create(workspaceId, {
        name,
        messageTemplate: `flow:${flowId}`,
        filters: { lastActive: '30d' },
      });

      this.logger.log(
        `Generated Campaign: ${campaign.id} with Flow: ${flowId}`,
      );

      return {
        status: 'ACTIVE',
        found: { inactiveLeads },
        actions: [`Created Campaign: ${name}`],
      };
    }

    return { status: 'IDLE', reason: 'No opportunities found' };
  }

  // Backwards compatibility for MoneyMachineController
  async activateMachine(workspaceId: string) {
    return this.activate(workspaceId);
  }

  async getDailyReport(workspaceId: string) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const sent = await this.prisma.message.count({
      where: { workspaceId, direction: 'OUTBOUND', createdAt: { gte: today } },
    });
    const inbound = await this.prisma.message.count({
      where: { workspaceId, direction: 'INBOUND', createdAt: { gte: today } },
    });
    return {
      workspaceId,
      date: today.toISOString().slice(0, 10),
      sent,
      inbound,
      note: 'Relatório sintético gerado automaticamente.',
    };
  }
}
