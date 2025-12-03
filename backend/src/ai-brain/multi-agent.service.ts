import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MultiAgentService {
  private readonly logger = new Logger(MultiAgentService.name);
  private openai: OpenAI | null;

  constructor(
    private prisma: PrismaService,
    private config: ConfigService,
  ) {
    const apiKey = this.config.get('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async runCrew(workspaceId: string, task: string) {
    // 1. Fetch Personas
    const personas = await this.prisma.persona.findMany({
      where: { workspaceId },
    });
    if (personas.length === 0) return { error: 'No personas defined' };

    // 2. Orchestrator Agent (Manager)
    const plan = await this.createPlan(task, personas);

    // 3. Execute Steps (Mock for Top 1)
    const results = [];
    for (const step of plan.steps) {
      const persona = personas.find((p) => p.role === step.role);
      if (persona) {
        results.push({
          role: step.role,
          output: `Executed step: ${step.instruction} using persona ${persona.name}`,
        });
      }
    }

    return { plan, results };
  }

  private async createPlan(task: string, personas: any[]) {
    if (!this.openai) return { steps: [] };

    const roles = personas.map((p) => p.role).join(', ');
    const prompt = `
    Task: ${task}
    Available Roles: ${roles}
    
    Create a step-by-step plan to execute this task using the available roles.
    Return JSON: { "steps": [{ "role": "...", "instruction": "..." }] }
    `;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: 'You are a CrewAI Manager.' },
        { role: 'user', content: prompt },
      ],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(completion.choices[0]?.message?.content || '{}');
  }
}
