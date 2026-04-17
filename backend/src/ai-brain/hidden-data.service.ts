import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';

@Injectable()
export class HiddenDataExtractorService {
  private openai: OpenAI | null;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

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

    // tokenBudget: non-workspace context, budget tracked at caller level
    const completion = await chatCompletionWithRetry(this.openai, {
      model: resolveBackendOpenAIModel('brain'),
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    let result: Record<string, unknown> = {};
    try {
      result = JSON.parse(completion.choices[0]?.message?.content || '{}');
    } catch {
      /* invalid JSON from model */
    }
    return result;
  }
}
