/**
 * MindMediaFactory implementation — canonical Mind/Knowledge service.
 *
 * Physically moved from `backend/src/ai-brain/media-factory.service.ts` to its
 * canonical home under `backend/src/kloel/mind/knowledge/` (ADR-0013 Wave M5,
 * 2026-05-27, MIND_SERVICES_CANONICAL row #21). The legacy
 * `ai-brain/media-factory.service.ts` re-export stub was deleted in Wave 51
 * (zero consumers).
 *
 * Prefer importing as `MindMediaFactory` via the
 * `backend/src/kloel/mind/knowledge` barrel.
 *
 * @cluster Mind/Knowledge
 * @canonical backend/src/kloel/mind/knowledge/mind-media-factory.service.ts
 * @see docs/adr/0013-kloel-mind-unification.md
 */
import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../../../logging/structured-logger';
import OpenAI from 'openai';
import { chatCompletionWithRetry } from '../../openai-wrapper';
import { resolveBackendOpenAIModel } from '../../../lib/openai-models';
import { CANONICAL_MODEL_IDS } from '../../../lib/openai-models';

/** Media factory service. */
@Injectable()
/**
 * @cluster whatsapp_saas/backend/kloel/mind/knowledge
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class MediaFactoryService {
  private readonly logger = StructuredLogger.from(MediaFactoryService.name);
  private openai: OpenAI | null;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get<string>('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  /** Generate image. */
  async generateImage(prompt: string) {
    if (!this.openai) {
      throw new ServiceUnavailableException('Image generation requires OPENAI_API_KEY');
    }

    // tokenBudget: non-workspace context, budget tracked at caller level
    this.logger.log('Calling OpenAI image generation', {
      context: 'MediaFactoryService.generateImage',
      model: CANONICAL_MODEL_IDS.imageGeneration,
    });
    const response = await this.openai.images.generate({
      model: resolveBackendOpenAIModel('image_generation', this.config),
      prompt: prompt,
      n: 1,
      size: '1024x1024',
    });

    const first = response.data?.[0];
    if (!first?.url) {
      throw new ServiceUnavailableException('Image generation returned no URL');
    }
    return { url: first.url };
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
    this.logger.log('Calling OpenAI', {
      context: 'MediaFactoryService.generateSocialContent',
      model: 'writer',
      platform,
    });
    const completion = await chatCompletionWithRetry(this.openai, {
      model: resolveBackendOpenAIModel('writer'),
      messages: [{ role: 'user', content: prompt }],
    });

    return { script: completion.choices[0]?.message?.content };
  }
}
