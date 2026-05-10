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

@Injectable()
export class NoopKloelComposerE2EGuard implements KloelComposerE2EGuard {
  isEnabled(): boolean {
    return false;
  }

  buildSearchResult(): ComposerE2EWebSearchDigest {
    throw new Error('NoopKloelComposerE2EGuard.buildSearchResult called in production');
  }

  buildImageResult(): ComposerE2EImageResult {
    throw new Error('NoopKloelComposerE2EGuard.buildImageResult called in production');
  }
}
