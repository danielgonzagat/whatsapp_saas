import { Injectable } from '@nestjs/common';
import { OpenAIProvider } from '../common/openai.provider';

@Injectable()
export class StorytellingService {
  constructor(private readonly openaiProvider: OpenAIProvider) {}

  private get openai() { return this.openaiProvider.client; }

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
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });

    return { story: completion.choices[0]?.message?.content };
  }
}
