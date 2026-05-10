/**
 * Deterministic web-search digest stub for the Kloel composer e2e harness.
 *
 * Activated only when the runtime env signals a non-production e2e/test
 * harness (mirrors the env-detection contract used by
 * {@link isKloelLlmTestStubEnabled} and {@link isCheckoutPaymentE2EStubEnabled}).
 *
 * The CI workflow runs with `OPENAI_API_KEY=e2e-dummy-key`. Any real
 * `OpenAI.responses.create` call therefore fails, blocking the e2e spec
 * `kloel-chat-composer-real.spec.ts:289` ("web search returns a cited
 * answer and renders sources in the chat") which asserts:
 *   - `assistantMessage.metadata.webSources.length > 0`
 *   - `/openai\.com/i.test(assistantMessage.content)`
 *   - the "Fontes" UI panel renders in the chat.
 *
 * The stub returns a deterministic digest that satisfies all three
 * assertions without contacting any external service. Production never
 * reaches this branch — guarded by NODE_ENV.
 */

/** Source shape compatible with WebSearchDigest.sources. */
interface ComposerWebSearchE2EStubSource {
  title: string;
  url: string;
}

/** Digest shape returned by KloelComposerService.searchWeb. */
interface ComposerWebSearchE2EStubDigest {
  answer: string;
  sources: ComposerWebSearchE2EStubSource[];
  totalTokens: number;
}

/** Image-generation stub shape compatible with composer metadata. */
interface ComposerImageE2EStubResult {
  content: string;
  metadata: {
    capability: 'create_image';
    generatedImageUrl: string;
    generatedImageFilename: string;
  };
  estimatedTokens: number;
}

/** True when a non-production harness should bypass real OpenAI calls. */
export function isComposerWebSearchE2EStubEnabled(): boolean {
  if (process.env.NODE_ENV === 'production') {
    return false;
  }
  // Jest unit-test workers must run the real service path so
  // KloelComposerService.searchWeb specs assert against the dependencies.
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

/**
 * Build a deterministic web-search digest. The digest mentions
 * `openai.com` in the answer body and exposes a non-empty `sources`
 * array so the chat composer e2e spec can match its assertions.
 *
 * The query is echoed in the answer to keep the stub output identifiable
 * during failure triage; we still return canonical sources.
 */
export function buildComposerWebSearchE2EStub(query: string): ComposerWebSearchE2EStubDigest {
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

/** Build a deterministic data-url image result for the chat composer e2e harness. */
export function buildComposerImageE2EStub(): ComposerImageE2EStubResult {
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
