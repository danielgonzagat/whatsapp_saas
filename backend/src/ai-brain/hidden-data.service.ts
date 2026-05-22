import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StructuredLogger } from '../logging/structured-logger';
import OpenAI from 'openai';
import { chatCompletionWithRetry } from '../kloel/openai-wrapper';
import { resolveBackendOpenAIModel } from '../lib/openai-models';

/** Hidden data extractor service. */
@Injectable()
/**
 * @cluster whatsapp_saas/backend/ai-brain
 * L11 multi-agent TaskGraph annotation (batched by tools/auto-pr/batch-job.mjs).
 */
export class HiddenDataExtractorService {
  private readonly logger = StructuredLogger.from(HiddenDataExtractorService.name);
  private openai: OpenAI | null;

  constructor(private config: ConfigService) {
    const apiKey = this.config.get('OPENAI_API_KEY');
    this.openai = apiKey ? new OpenAI({ apiKey }) : null;
  }

  /** Extract. */
  async extract(text: string) {
    if (!this.openai) {
      return {};
    }

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
    this.logger.log('Calling OpenAI', {
      context: 'HiddenDataExtractorService.extract',
      model: 'brain',
    });
    const completion = await chatCompletionWithRetry(this.openai, {
      model: resolveBackendOpenAIModel('brain'),
      messages: [{ role: 'user', content: prompt }],
      response_format: { type: 'json_object' },
    });

    let result: Record<string, unknown> = {};
    try {
      result = JSON.parse(completion.choices[0]?.message?.content || '{}');
    } catch (error: unknown) {
      this.logger.error(
        'Failed to parse OpenAI JSON response',
        error instanceof Error ? error.message : String(error),
        { context: 'HiddenDataExtractorService.extract' },
      );
    }
    return result;
  }
}
