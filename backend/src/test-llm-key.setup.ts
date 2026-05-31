/**
 * Deterministic LLM API key for the Jest runner.
 *
 * createTextLlmClient() (src/lib/llm-provider.ts) returns null when no API key
 * is present, which sends KloelReplyEngineService down the degraded
 * `no_llm_client` path and makes every reply-engine spec assert the fallback
 * message instead of a real reply. Local dev has an ambient key (.env), so
 * these specs pass locally — but CI has no ambient key, so they failed there.
 * Provide a stub key here so the (mocked) client is always constructed
 * deterministically. Specs that intentionally exercise the degraded/no-client
 * path delete this in their own beforeEach/beforeAll.
 */
if (!process.env.OPENAI_API_KEY) {
  process.env.OPENAI_API_KEY = 'sk-test-key';
}
