import { Injectable } from '@nestjs/common';

export const KLOEL_COMPOSER_E2E_GUARD = Symbol('KLOEL_COMPOSER_E2E_GUARD');

export interface ComposerE2EWebSearchDigest {
  answer: string;
  sources: Array<{ title: string; url: string }>;
  totalTokens: number;
}

export interface ComposerE2EImageResult {
  content: string;
  metadata: {
    capability: 'create_image';
    generatedImageUrl: string;
    generatedImageFilename: string;
  };
  estimatedTokens: number;
}

export interface KloelComposerE2EGuard {
  isEnabled(): boolean;
  buildSearchResult(query: string): ComposerE2EWebSearchDigest;
  buildImageResult(): ComposerE2EImageResult;
}

const E2E_IMAGE_DATA_URL =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+Xx7cAAAAASUVORK5CYII=';

function isComposerE2EHarnessEnabled(): boolean {
  return process.env.NODE_ENV !== 'production' && process.env.CI === 'true';
}

@Injectable()
export class NoopKloelComposerE2EGuard implements KloelComposerE2EGuard {
  isEnabled(): boolean {
    return isComposerE2EHarnessEnabled();
  }

  buildSearchResult(query: string): ComposerE2EWebSearchDigest {
    if (!this.isEnabled()) {
      throw new Error('NoopKloelComposerE2EGuard.buildSearchResult called outside e2e harness');
    }

    return {
      answer: `A URL principal do site oficial da OpenAI é https://openai.com. Consulta: ${query}`,
      sources: [{ title: 'OpenAI', url: 'https://openai.com' }],
      totalTokens: 24,
    };
  }

  buildImageResult(): ComposerE2EImageResult {
    if (!this.isEnabled()) {
      throw new Error('NoopKloelComposerE2EGuard.buildImageResult called outside e2e harness');
    }

    return {
      content: 'Imagem criada pelo Kloel.',
      metadata: {
        capability: 'create_image',
        generatedImageUrl: E2E_IMAGE_DATA_URL,
        generatedImageFilename: 'kloel-e2e-image.png',
      },
      estimatedTokens: 8,
    };
  }
}
