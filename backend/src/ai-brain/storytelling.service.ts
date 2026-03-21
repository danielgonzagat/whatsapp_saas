import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { resolveBackendOpenAIModel } from '../lib/openai-models';

@Injectable()
export class StorytellingService {
  private openai: OpenAI | null;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async generateStory(context: string, goal: string) {
    if (!this.openai) return { story: '' };

    const prompt = `
    Create a short, compelling story (storytelling) for WhatsApp based on this context.
    Context: ${context}
    Goal: ${goal}
    
    The story should be emotional, relatable, and lead to a soft CTA.
    Keep it under 200 words. Portuguese Brazil.
    `;

    const completion = await this.openai.chat.completions.create({
      model: resolveBackendOpenAIModel('writer'),
      messages: [{ role: 'user', content: prompt }],
    });

    return { story: completion.choices[0]?.message?.content };
  }
}
