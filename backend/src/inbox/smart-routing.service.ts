import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { InjectRedis } from '@nestjs-modules/ioredis';
import Redis from 'ioredis';

@Injectable()
export class SmartRoutingService {
  private readonly logger = new Logger(SmartRoutingService.name);

  constructor(
    private readonly prisma: PrismaService,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  /**
   * Main entry point to route a conversation
   */
  async routeConversation(
    workspaceId: string,
    conversationId: string,
    context: any = {},
  ) {
    this.logger.log(
      `Routing conversation ${conversationId} in workspace ${workspaceId}`,
    );

    // 1. Check explicit Routing Rules first
    const ruleMatch = await this.checkRoutingRules(workspaceId, context);
    if (ruleMatch) {
      return this.applyRule(conversationId, ruleMatch);
    }

    // 2. If no rule, check if it should go to a default Queue or stay unassigned
    // For now, we default to "General" queue if exists, or leave unassigned
    const defaultQueue = await this.prisma.queue.findFirst({
      where: { workspaceId, name: 'General' },
    });

    if (defaultQueue) {
      return this.assignToQueue(conversationId, defaultQueue.id);
    }

    return null;
  }

  /**
   * Assigns a conversation to a Queue and tries to find an available Agent (Round Robin)
   */
  async assignToQueue(conversationId: string, queueId: string) {
    this.logger.log(
      `Assigning conversation ${conversationId} to queue ${queueId}`,
    );

    // Update Conversation
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { queueId, status: 'OPEN' },
    });

    // Try to auto-assign to an agent in this queue
    await this.distributeToAgent(queueId, conversationId);
  }

  /**
   * Round Robin / Load Balancing Logic
   */
  private async distributeToAgent(queueId: string, conversationId: string) {
    // Get all online agents in this queue
    const agentsInQueue = await this.prisma.agentQueue.findMany({
      where: { queueId, agent: { isOnline: true } },
      include: { agent: true },
      orderBy: { priority: 'desc' },
    });

    if (agentsInQueue.length === 0) {
      this.logger.warn(`No online agents in queue ${queueId}`);
      return;
    }

    // Simple Round Robin using Redis to store last assigned index
    const key = `queue:${queueId}:rr_index`;
    const lastIndex = parseInt((await this.redis.get(key)) || '-1', 10);
    const nextIndex = (lastIndex + 1) % agentsInQueue.length;

    const selectedAgent = agentsInQueue[nextIndex].agent;

    // Assign
    await this.prisma.conversation.update({
      where: { id: conversationId },
      data: { assignedAgentId: selectedAgent.id },
    });

    // Update RR index
    await this.redis.set(key, nextIndex);

    this.logger.log(
      `Assigned conversation ${conversationId} to agent ${selectedAgent.email}`,
    );
  }

  private async checkRoutingRules(workspaceId: string, context: any) {
    // Fetch active rules
    const rules = await this.prisma.routingRule.findMany({
      where: { workspaceId, isActive: true },
      orderBy: { createdAt: 'asc' }, // Priority by creation or add a priority field
    });

    for (const rule of rules) {
      // Check Channel
      if (rule.channel && rule.channel !== context.channel) continue;

      // Check Keyword
      if (
        rule.keyword &&
        context.messageBody &&
        !context.messageBody.toLowerCase().includes(rule.keyword.toLowerCase())
      )
        continue;

      // Check Tag (if context has tags)
      // ...

      return rule;
    }

    return null;
  }

  private async applyRule(conversationId: string, rule: any) {
    this.logger.log(
      `Applying rule ${rule.name} to conversation ${conversationId}`,
    );

    if (rule.actionType === 'ASSIGN_TO_QUEUE' && rule.targetId) {
      return this.assignToQueue(conversationId, rule.targetId);
    }

    if (rule.actionType === 'ASSIGN_TO_AGENT' && rule.targetId) {
      await this.prisma.conversation.update({
        where: { id: conversationId },
        data: { assignedAgentId: rule.targetId, status: 'OPEN' },
      });
    }
  }
}
