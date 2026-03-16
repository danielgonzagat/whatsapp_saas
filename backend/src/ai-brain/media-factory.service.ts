import { Injectable } from '@nestjs/common';
import { OpenAIProvider } from '../common/openai.provider';

@Injectable()
export class MediaFactoryService {
  constructor(private readonly openaiProvider: OpenAIProvider) {}

  private get openai() { return this.openaiProvider.client; }

  async generateImage(prompt: string) {
    if (!this.openai) return { url: 'https://via.placeholder.com/1024' };

    const response = await this.openai.images.generate({
      model: 'dall-e-3',
      prompt: prompt,
      n: 1,
      size: '1024x1024',
    });

    return { url: response.data[0].url };
  }

  generateVoice(text: string, voiceId: string = 'default') {
    // Integration with ElevenLabs or OpenAI TTS would go here.
    // Mocking for now.
    return {
      audioUrl: `https://api.penin-saas.com/voice/synth?text=${encodeURIComponent(text)}&voice=${voiceId}`,
      duration: Math.ceil(text.length / 10),
    };
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
      model: 'gpt-4o-mini',
      messages: [{ role: 'user', content: prompt }],
    });

    return { script: completion.choices[0]?.message?.content };
  }
}
