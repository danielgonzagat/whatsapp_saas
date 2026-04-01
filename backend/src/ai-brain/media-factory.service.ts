import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import OpenAI from 'openai';
import { ConfigService } from '@nestjs/config';
import { resolveBackendOpenAIModel } from '../lib/openai-models';

@Injectable()
export class MediaFactoryService {
  private openai: OpenAI | null;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  async generateImage(prompt: string) {
    if (!this.openai)
      throw new ServiceUnavailableException(
        'Image generation requires OPENAI_API_KEY',
      );

    const response = await this.openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
    });

    return { url: response.data[0].url };
  }

  generateVoice(_text: string, _voiceId: string = 'default') {
    throw new ServiceUnavailableException(
      'Voice synthesis is not configured. Set up OpenAI TTS to enable this feature.',
    );
  }

  async generateSocialContent(topic: string, platform: 'INSTAGRAM' | 'TIKTOK') {
    if (!this.openai) return { content: 'AI not configured' };

    const prompt = `
    Create a viral content script for ${platform} about: "${topic}".
    Include:
    - Hook (0-3s)
    - Body
    - CTA
    - Visual cues (what to show)
    `;

    const completion = await this.openai.chat.completions.create({
      model: resolveBackendOpenAIModel('writer'),
      messages: [{ role: 'user', content: prompt }],
    });

    return { script: completion.choices[0]?.message?.content };
  }
}
