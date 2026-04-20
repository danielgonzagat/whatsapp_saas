import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { PlanLimitsService } from '../billing/plan-limits.service';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';

/** Flow optimizer service. */
@Injectable()
export class FlowOptimizerService {
  private readonly logger = new Logger(FlowOptimizerService.name);
  private openai: OpenAI | null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
    private readonly planLimits: PlanLimitsService,
  ) {
    const apiKey = this.config.get('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  /** Optimize flow. */
  async optimizeFlow(workspaceId: string, flowId: string) {
    if (!this.openai) {
      return;
    }

    const flow = await this.prisma.flow.findUnique({
      where: { id: flowId },
      include: { executions: { take: 50, orderBy: { createdAt: 'desc' } } },
    });

    if (!flow || !flow.aiOptimization) {
      return;
    }

    // 1. Analyze Performance
    const total = flow.executions.length;
    const completed = flow.executions.filter((e) => e.status === 'COMPLETED').length;
    const conversionRate = total > 0 ? completed / total : 0;

    if (conversionRate > 0.8) {
      return;
    } // Good enough

    // 2. Generate Optimization Suggestion
    const prompt = `
    This flow has a conversion rate of ${(conversionRate * 100).toFixed(1)}%.
    Current Nodes: ${JSON.stringify(flow.nodes)}
    
    Suggest a JSON modification to improve it. 
    Focus on copywriting and simplifying logic.
    Return { "nodes": [...], "reason": "..." }
    `;

    await this.planLimits.ensureTokenBudget(workspaceId);
    const completion = await chatCompletionWithRetry(this.openai, {
      model: resolveBackendOpenAIModel('brain'),
      messages: [
        { role: 'system', content: 'You are a Flow Optimization AI.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    await this.planLimits
      .trackAiUsage(workspaceId, completion?.usage?.total_tokens ?? 500)
      .catch(() => {});
    let suggestion: Record<string, unknown> = {};
    try {
      suggestion = JSON.parse(completion.choices[0]?.message?.content || '{}');
    } catch {
      /* invalid JSON from model */
    }

    // 3. Create New Version (Draft)
    if (suggestion.nodes) {
      await this.prisma.flowVersion.create({
        data: {
          flowId,
          workspaceId,
          nodes: suggestion.nodes as Prisma.InputJsonValue,
          edges: flow.edges, // Keep edges for now
          label:
            'AI Auto-Optimization: ' +
            (typeof suggestion.reason === 'string' ? suggestion.reason : ''),
        },
      });
      this.logger.log(`Created optimized version for flow ${flowId}`);
    }
  }
}
