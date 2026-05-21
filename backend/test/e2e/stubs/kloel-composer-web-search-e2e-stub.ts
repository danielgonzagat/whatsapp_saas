import { Injectable } from '@nestjs/common';
import {
  KloelComposerE2EGuard,
  ComposerE2EWebSearchDigest,
  ComposerE2EImageResult,
} from 'src/kloel/kloel-composer-e2e-guard';

export function isComposerWebSearchE2EStubEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  if (process.env.JEST_WORKER_ID) {
    return false;
  }
  if (process.env.E2E_TEST_MODE === 'true') {
    return true;
  }
  if (process.env.KLOEL_WEB_SEARCH_STUB === 'true') {
    return true;
  }
  if (process.env.OPENAI_API_KEY === 'e2e-dummy-key') {
    return true;
  }
  return false;
}

export function buildComposerWebSearchE2EStub(query: string): ComposerE2EWebSearchDigest {
  const safeQuery = String(query || '')
    .trim()
    .slice(0, 240);
  const answer =
    `[stub-web-search] Resposta deterministica para teste e2e. ` +
    `Para "${safeQuery}", o site oficial da OpenAI é https://openai.com.`;
  return {
    answer,
    sources: [
      {
        title: 'OpenAI — site oficial',
        url: 'https://openai.com',
      },
      {
        title: 'OpenAI Platform',
        url: 'https://platform.openai.com',
      },
    ],
    totalTokens: 0,
  };
}

export function buildComposerImageE2EStub(): ComposerE2EImageResult {
  const coralPixelPng =
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/p9sAAAAASUVORK5CYII=';
  return {
    content: 'Imagem gerada e pronta para revisão.',
    metadata: {
      capability: 'create_image',
      generatedImageUrl: `data:image/png;base64,${coralPixelPng}`,
      generatedImageFilename: 'kloel-e2e-image.png',
    },
    estimatedTokens: 0,
  };
}

@Injectable()
export class KloelComposerE2EStubGuard implements KloelComposerE2EGuard {
  isEnabled(): boolean {
    return isComposerWebSearchE2EStubEnabled();
  }

  buildSearchResult(query: string): ComposerE2EWebSearchDigest {
    return buildComposerWebSearchE2EStub(query);
  }

  buildImageResult(): ComposerE2EImageResult {
    return buildComposerImageE2EStub();
  }
}
