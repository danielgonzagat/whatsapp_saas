import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class FlowOptimizerService {
  private readonly logger = new Logger(FlowOptimizerService.name);
  private openai: OpenAI | null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const apiKey = this.config.get('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async optimizeFlow(workspaceId: string, flowId: string) {
    if (!this.openai) return;

    const flow = await this.prisma.flow.findUnique({
      where: { id: flowId },
      include: { executions: { take: 50, orderBy: { createdAt: 'desc' } } },
    });

    if (!flow || !flow.aiOptimization) return;

    // 1. Analyze Performance
    const total = flow.executions.length;
    const completed = flow.executions.filter(
      (e) => e.status === 'COMPLETED',
    ).length;
    const conversionRate = total > 0 ? completed / total : 0;

    if (conversionRate > 0.8) return; // Good enough

    // 2. Generate Optimization Suggestion
    const prompt = `
    This flow has a conversion rate of ${(conversionRate * 100).toFixed(1)}%.
    Current Nodes: ${JSON.stringify(flow.nodes)}
    
    Suggest a JSON modification to improve it. 
    Focus on copywriting and simplifying logic.
    Return { "nodes": [...], "reason": "..." }
    `;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a Flow Optimization AI.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    const suggestion = JSON.parse(
      completion.choices[0]?.message?.content || '{}',
    );

    // 3. Create New Version (Draft)
    if (suggestion.nodes) {
      await this.prisma.flowVersion.create({
        data: {
          flowId,
          workspaceId,
          nodes: suggestion.nodes,
          edges: flow.edges, // Keep edges for now
          label: `AI Auto-Optimization: ${suggestion.reason}`,
        },
      });
      this.logger.log(`Created optimized version for flow ${flowId}`);
    }
  }
}
