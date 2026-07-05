#!/usr/bin/env node
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const smokePath = path.join(here, 'deepseek-v4-pro-smoke.mjs');
assert.equal(fs.existsSync(smokePath), true, 'deepseek-v4-pro-smoke.mjs must exist');

const smoke = await import(pathToFileURL(smokePath).href);
const { DEEPSEEK_BASE_URL, DEEPSEEK_MODEL, buildChatPayload, validateDeepSeekEnv, runDeepSeekSmoke, runDryPlan } = smoke;

const missing = validateDeepSeekEnv({});
assert.equal(missing.ok, false);
assert.match(missing.blockers.join('\n'), /DEEPSEEK_API_KEY/);

const payload = buildChatPayload({ prompt: 'ping', maxTokens: 7 });
assert.equal(payload.model, DEEPSEEK_MODEL);
assert.equal(payload.stream, false);
assert.equal(payload.max_tokens, 7);
assert.equal(payload.thinking.type, 'enabled');

const fakeKey = 'test-secret-do-not-return';
let captured;
const success = await runDeepSeekSmoke({
  env: { DEEPSEEK_API_KEY: fakeKey },
  fetchImpl: async (url, init) => {
    captured = { url, init };
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({
        model: DEEPSEEK_MODEL,
        choices: [{ message: { content: 'atomic-deepseek-ok' } }],
        usage: { prompt_tokens: 3, completion_tokens: 2, total_tokens: 5 },
      }),
    };
  },
});
assert.equal(success.ok, true);
assert.equal(success.model, DEEPSEEK_MODEL);
assert.equal(captured.url, `${DEEPSEEK_BASE_URL}/chat/completions`);
assert.equal(captured.init.headers.authorization, `Bearer ${fakeKey}`);
assert.equal(JSON.stringify(success).includes(fakeKey), false);

const failed = await runDeepSeekSmoke({
  env: { DEEPSEEK_API_KEY: fakeKey },
  fetchImpl: async () => ({
    ok: false,
    status: 401,
    text: async () => JSON.stringify({ error: { message: `bad ${fakeKey}` } }),
  }),
});
assert.equal(failed.ok, false);
assert.equal(JSON.stringify(failed).includes(fakeKey), false);
assert.match(failed.error, /\[redacted\]/);

const dry = runDryPlan({}, { DEEPSEEK_API_KEY: fakeKey });
assert.equal(dry.hasKey, true);
assert.equal(dry.model, DEEPSEEK_MODEL);
assert.equal(JSON.stringify(dry).includes(fakeKey), false);

console.log(JSON.stringify({ ok: true, proof: 'deepseek-v4-pro-smoke', checked: 5 }, null, 2));
