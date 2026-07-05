#!/usr/bin/env node

export const DEEPSEEK_BASE_URL = 'https://api.deepseek.com';
export const DEEPSEEK_MODEL = 'deepseek-v4-pro';
export const DEEPSEEK_ENV_KEY = 'DEEPSEEK_API_KEY';

function nonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function scrubSecret(value, env = process.env) {
  const text = String(value ?? '');
  const key = env[DEEPSEEK_ENV_KEY];
  return nonEmptyString(key) ? text.split(key).join('[redacted]') : text;
}

export function validateDeepSeekEnv(env = process.env) {
  const blockers = [];
  if (!nonEmptyString(env[DEEPSEEK_ENV_KEY])) blockers.push(`${DEEPSEEK_ENV_KEY} is required`);
  return { ok: blockers.length === 0, blockers, envKeyName: DEEPSEEK_ENV_KEY };
}

export function buildChatPayload(input = {}) {
  return {
    model: input.model ?? DEEPSEEK_MODEL,
    messages: [
      { role: 'system', content: 'Return concise deterministic benchmark smoke-test responses.' },
      { role: 'user', content: input.prompt ?? 'Return exactly: atomic-deepseek-ok' },
    ],
    max_tokens: input.maxTokens ?? 64,
    stream: false,
    reasoning_effort: input.reasoningEffort ?? 'high',
    thinking: { type: input.thinkingType ?? 'enabled' },
  };
}

export function buildDeepSeekRequest(input = {}, env = process.env) {
  return {
    url: `${input.baseUrl ?? DEEPSEEK_BASE_URL}/chat/completions`,
    init: {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${env[DEEPSEEK_ENV_KEY] ?? ''}`,
      },
      body: JSON.stringify(buildChatPayload(input)),
    },
  };
}

function parseJson(text) {
  try {
    return { ok: true, value: JSON.parse(text) };
  } catch (error) {
    return { ok: false, error: String(error?.message || error) };
  }
}

export async function runDeepSeekSmoke(input = {}) {
  const env = input.env ?? process.env;
  const validation = validateDeepSeekEnv(env);
  if (!validation.ok) return { ok: false, provider: 'deepseek', model: DEEPSEEK_MODEL, blockers: validation.blockers };

  const fetchImpl = input.fetchImpl ?? globalThis.fetch;
  if (typeof fetchImpl !== 'function') {
    return { ok: false, provider: 'deepseek', model: DEEPSEEK_MODEL, blockers: ['global fetch is unavailable'] };
  }

  const request = buildDeepSeekRequest(input, env);
  const started = Date.now();
  try {
    const response = await fetchImpl(request.url, request.init);
    const text = await response.text();
    const parsed = parseJson(text);
    if (!parsed.ok) {
      return { ok: false, provider: 'deepseek', model: DEEPSEEK_MODEL, status: response.status, error: parsed.error, elapsedMs: Date.now() - started };
    }
    const body = parsed.value;
    if (!response.ok) {
      return {
        ok: false,
        provider: 'deepseek',
        model: body?.model ?? DEEPSEEK_MODEL,
        status: response.status,
        error: scrubSecret(body?.error?.message || text, env),
        elapsedMs: Date.now() - started,
      };
    }
    const content = body?.choices?.[0]?.message?.content;
    return {
      ok: nonEmptyString(content),
      provider: 'deepseek',
      model: body?.model ?? DEEPSEEK_MODEL,
      status: response.status,
      contentLength: nonEmptyString(content) ? content.length : 0,
      usage: body?.usage ?? null,
      elapsedMs: Date.now() - started,
      blockers: nonEmptyString(content) ? [] : ['DeepSeek response did not include message content'],
    };
  } catch (error) {
    return { ok: false, provider: 'deepseek', model: DEEPSEEK_MODEL, status: null, error: scrubSecret(error?.message || error, env), elapsedMs: Date.now() - started };
  }
}

export function runDryPlan(input = {}, env = process.env) {
  return {
    ok: true,
    dryRun: true,
    provider: 'deepseek',
    baseUrl: input.baseUrl ?? DEEPSEEK_BASE_URL,
    model: input.model ?? DEEPSEEK_MODEL,
    envKeyName: DEEPSEEK_ENV_KEY,
    hasKey: nonEmptyString(env[DEEPSEEK_ENV_KEY]),
    request: {
      url: `${input.baseUrl ?? DEEPSEEK_BASE_URL}/chat/completions`,
      payload: buildChatPayload(input),
    },
  };
}

function parseArgv(argv) {
  const out = { dryRun: argv.includes('--dry-run') };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--prompt') out.prompt = argv[++i];
    else if (arg === '--max-tokens') out.maxTokens = Number(argv[++i]);
    else if (arg === '--reasoning-effort') out.reasoningEffort = argv[++i];
  }
  return out;
}

export async function runCli(argv = [], env = process.env) {
  const options = parseArgv(argv);
  if (options.dryRun) return runDryPlan(options, env);
  return runDeepSeekSmoke({ ...options, env });
}

if (import.meta.url === 'file://' + process.argv[1]) {
  const result = await runCli(process.argv.slice(2), process.env);
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  process.exit(result.ok ? 0 : 1);
}
