import { Injectable } from '@nestjs/common';
import { OpenAIProvider } from '../common/openai.provider';

@Injectable()
export class HiddenDataExtractorService {
  constructor(private readonly openaiProvider: OpenAIProvider) {}

  private get openai() { return this.openaiProvider.client; }

  async extract(text: string) {
    if (!this.openai) return {};

    const prompt = `
    Extract hidden data from this message.
    Message: "${text}"
    
    Return JSON with:
    - budget: (number or null)
    - urgency: (LOW, MEDIUM, HIGH)
    - role: (Decision Maker, Influencer, Gatekeeper)
    - pain_points: []
    - preferred_time: (string or null)
    `;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(completion.choices[0]?.message?.content || '{}');
  }
}
