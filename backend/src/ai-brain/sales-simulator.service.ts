import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class SalesSimulatorService {
  private openai: OpenAI | null;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async startSimulation(scenario: string, persona: string) {
    if (!this.openai) return { error: 'OpenAI not configured' };

    const systemPrompt = `
    You are a roleplay actor. You are playing the role of a potential customer.
    
    Persona: ${persona}
    Scenario: ${scenario}
    
    Your goal is to challenge the user (who is the salesperson).
    Be realistic. Have objections. Don't buy easily.
    
    Start the conversation with your first message.
    `;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'system', content: systemPrompt }],
    });

    return {
      message: completion.choices[0]?.message?.content,
      threadId: Date.now().toString(), // Mock thread ID
    };
  }

  async replySimulation(
    history: { role: 'user' | 'assistant'; content: string }[],
  ) {
    if (!this.openai) return { error: 'OpenAI not configured' };

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content:
            'You are a difficult customer in a sales roleplay. Keep replies short.',
        },
        ...history,
      ],
    });

    return {
      message: completion.choices[0]?.message?.content,
    };
  }
}
