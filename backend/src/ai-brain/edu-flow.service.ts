import { Injectable } from '@nestjs/common';
import { OpenAIProvider } from '../common/openai.provider';

@Injectable()
export class EduFlowService {
  constructor(private readonly openaiProvider: OpenAIProvider) {}

  private get openai() { return this.openaiProvider.client; }

  async transformToLesson(messages: { role: string; content: string }[]) {
    if (!this.openai) return { error: 'OpenAI not configured' };

    const conversationText = messages
      .map((m) => `${m.role}: ${m.content}`)
      .join('\n');

    const prompt = `
    Transform this real conversation into a structured educational lesson (PDF style).
    
    Conversation:
    ${conversationText}
    
    Output JSON:
    {
      "title": "Lesson Title",
      "key_takeaways": ["Point 1", "Point 2"],
      "summary": "Brief summary...",
      "actionable_steps": ["Step 1", "Step 2"]
    }
    `;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(completion.choices[0]?.message?.content || '{}');
  }
}
