import { Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class MarketingGeniusService {
  private openai: OpenAI | null;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async generateCampaign(data: {
    product: string;
    price: string;
    audience: string;
    goal: string;
  }) {
    if (!this.openai) return { error: 'OpenAI not configured' };

    const prompt = `
    Act as a World-Class Marketing Genius.
    
    Product: ${data.product}
    Price: ${data.price}
    Target Audience: ${data.audience}
    Goal: ${data.goal}
    
    Generate a complete WhatsApp Marketing Campaign JSON containing:
    1. "strategy": A brief explanation of the strategy.
    2. "copywriting": 3 variations of message copy (A, B, C).
    3. "image_prompt": A prompt to generate an image for this campaign.
    4. "flow_structure": A simple array of steps for a chatbot flow (e.g., [Send Msg, Wait, Check Reply]).
    5. "schedule": Best time to send (e.g., "Tuesday 10am").
    
    Return strictly JSON.
    `;

    const completion = await this.openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    return JSON.parse(completion.choices[0]?.message?.content || '{}');
  }
}
