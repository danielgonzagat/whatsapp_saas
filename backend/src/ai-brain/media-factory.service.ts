import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import OpenAI from 'openai';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';

/** Media factory service. */
@Injectable()
export class MediaFactoryService {
  private openai: OpenAI | null;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  /** Generate image. */
  async generateImage(prompt: string) {
    if (!this.openai) {
      throw new ServiceUnavailableException('Image generation requires OPENAI_API_KEY');
    }

    // tokenBudget: non-workspace context, budget tracked at caller level
    const response = await this.openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
    });

    return { url: response.data[0].url };
  }

  /** Generate voice. */
  generateVoice(_text: string, _voiceId = 'default') {
    throw new ServiceUnavailableException(
      'Voice synthesis is not configured. Set up OpenAI TTS to enable this feature.',
    );
  }

  /** Generate social content. */
  async generateSocialContent(topic: string, platform: 'INSTAGRAM' | 'TIKTOK') {
    if (!this.openai) {
      return { content: 'AI not configured' };
    }

    const prompt = `
    Create a viral content script for ${platform} about: "${topic}".
    Include:
    - Hook (0-3s)
    - Body
    - CTA
    - Visual cues (what to show)
    `;

    // tokenBudget: non-workspace context, budget tracked at caller level
    const completion = await chatCompletionWithRetry(this.openai, {
      model: resolveBackendOpenAIModel('writer'),
      messages: [{ role: 'user', content: prompt }],
    });

    return { script: completion.choices[0]?.message?.content };
  }
}
