// tools/saas-compiler/llm-client.mjs — provider-agnostic LLM call.
// Looks for ANTHROPIC_API_KEY → DEEPSEEK_API_KEY → OPENAI_API_KEY.
// Falls back to throwing if none set; callers MUST handle the deterministic
// rule-based path themselves.

import { writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

const ANTHROPIC = process.env.ANTHROPIC_API_KEY;
const DEEPSEEK = process.env.DEEPSEEK_API_KEY;
const OPENAI = process.env.OPENAI_API_KEY;

export function provider() {
  if (ANTHROPIC) return 'anthropic';
  if (DEEPSEEK) return 'deepseek';
  if (OPENAI) return 'openai';
  return null;
}

export async function chat({ system, user, model, maxTokens = 4096, temperature = 0.2 }) {
  const p = provider();
  if (!p) throw new Error('No LLM API key found (ANTHROPIC_API_KEY/DEEPSEEK_API_KEY/OPENAI_API_KEY)');
  if (p === 'anthropic') return anthropic({ system, user, model: model || 'claude-opus-4-7', maxTokens, temperature });
  if (p === 'deepseek') return openaiCompatible({
    apiKey: DEEPSEEK, baseUrl: 'https://api.deepseek.com/v1',
    system, user, model: model || 'deepseek-chat', maxTokens, temperature,
  });
  return openaiCompatible({
    apiKey: OPENAI, baseUrl: 'https://api.openai.com/v1',
    system, user, model: model || 'gpt-4o-mini', maxTokens, temperature,
  });
}

async function anthropic({ system, user, model, maxTokens, temperature }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model,
      system,
      max_tokens: maxTokens,
      temperature,
      messages: [{ role: 'user', content: user }],
    }),
  });
  if (!res.ok) throw new Error(`Anthropic ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.content?.[0]?.text || '';
}

async function openaiCompatible({ apiKey, baseUrl, system, user, model, maxTokens, temperature }) {
  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: 'POST',
    headers: { 'content-type': 'application/json', authorization: `Bearer ${apiKey}` },
    body: JSON.stringify({
      model,
      max_tokens: maxTokens,
      temperature,
      messages: [
        { role: 'system', content: system },
        { role: 'user', content: user },
      ],
    }),
  });
  if (!res.ok) throw new Error(`${baseUrl} ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return data.choices?.[0]?.message?.content || '';
}

export function extractJsonBlock(text) {
  // Find first {...} JSON block (greedy balanced).
  const start = text.indexOf('{');
  if (start === -1) throw new Error('No JSON block in LLM response');
  let depth = 0;
  for (let i = start; i < text.length; i++) {
    if (text[i] === '{') depth++;
    else if (text[i] === '}') {
      depth--;
      if (depth === 0) {
        const block = text.slice(start, i + 1);
        return JSON.parse(block);
      }
    }
  }
  throw new Error('Unbalanced JSON block in LLM response');
}
