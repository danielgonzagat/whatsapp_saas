/**
 * PULSE Parser 82: Chaos — Third Party (STATIC)
 * Layer 13: Chaos Engineering
 *
 * STATIC analysis: checks that fallback patterns exist for external dependencies.
 * No live infrastructure required.
 *
 * BREAK TYPES:
 *   CHAOS_STRIPE_NO_FALLBACK (high)  — Stripe calls have no error/catch handling
 *   CHAOS_LLM_NO_FALLBACK (high)     — LLM calls lack timeout or fallback response
 *   CHAOS_WHATSAPP_MSG_LOST (high)   — no WhatsApp disconnect/reconnect handler found
 */

import * as path from 'path';
import type { Break, PulseConfig } from '../types';
import { walkFiles } from './utils';
import { readTextFile } from '../safe-fs';

function readSafe(file: string): string {
  try {
    return readTextFile(file, 'utf8');
  } catch {
    return '';
  }
}

/** Check chaos third party. */
export function checkChaosThirdParty(config: PulseConfig): Break[] {
  const breaks: Break[] = [];

  const backendFiles = walkFiles(config.backendDir, ['.ts']).filter(
    (f) => !/\.(spec|test)\.ts$|__tests__|__mocks__|dist\//.test(f),
  );
  const workerFiles = walkFiles(config.workerDir, ['.ts']).filter(
    (f) => !/\.(spec|test)\.ts$|__tests__|__mocks__/.test(f),
  );

  // ── CHECK 1: Stripe error handling ───────────────────────────────────────────
  // Find files that interact with Stripe (payment rail)
  const stripeFiles = backendFiles.filter((f) => {
    const content = readSafe(f);
    return /stripe|STRIPE/i.test(content) && /fetch\s*\(|axios\.|httpService/i.test(content);
  });

  const hasStripeFallback = stripeFiles.some((f) => {
    const content = readSafe(f);
    // Check for try/catch around Stripe calls, or .catch() chaining
    return (
      /try\s*\{[\s\S]{0,1000}stripe[\s\S]{0,500}\}\s*catch/i.test(content) ||
      /stripe[\s\S]{0,200}\.catch\s*\(/i.test(content) ||
      /catch\s*\([^)]*\)[\s\S]{0,200}stripe/i.test(content)
    );
  });

  if (stripeFiles.length > 0 && !hasStripeFallback) {
    breaks.push({
      type: 'CHAOS_STRIPE_NO_FALLBACK',
      severity: 'high',
      file: path.relative(config.rootDir, stripeFiles[0]),
      line: 1,
      description: 'Stripe payment calls found without error/catch fallback',
      detail:
        'Wrap all Stripe HTTP calls in try/catch. On failure, set Order status=PENDING ' +
        'and enqueue a retry job with exponential backoff instead of failing the request.',
    });
  }

  // ── CHECK 2: LLM timeout and fallback ────────────────────────────────────────
  // Find files that call OpenAI / Anthropic
  const llmFiles = backendFiles.filter((f) => {
    const content = readSafe(f);
    return /openai|anthropic|completions\.create|chat\.completions/i.test(content);
  });

  const hasLlmTimeout = llmFiles.some((f) => {
    const content = readSafe(f);
    // Check for explicit timeout configuration
    return /timeout\s*:|max_tokens\s*:|AbortSignal|AbortController|signal\s*:/i.test(content);
  });

  const hasLlmFallback = llmFiles.some((f) => {
    const content = readSafe(f);
    // Check for fallback response / degraded state handling
    return /fallback|degraded|indispon[íi]vel|catch\s*\([^)]*\)[\s\S]{0,300}(?:return|throw)/i.test(
      content,
    );
  });

  if (llmFiles.length > 0 && !hasLlmTimeout) {
    breaks.push({
      type: 'CHAOS_LLM_NO_FALLBACK',
      severity: 'high',
      file: path.relative(config.rootDir, llmFiles[0]),
      line: 1,
      description: 'LLM calls found without explicit timeout configuration',
      detail:
        'Add timeout: <ms> or AbortController signal to LLM API calls. ' +
        'Without a timeout, a hung LLM request blocks the Node.js event loop indefinitely.',
    });
  }

  if (llmFiles.length > 0 && !hasLlmFallback) {
    breaks.push({
      type: 'CHAOS_LLM_NO_FALLBACK',
      severity: 'high',
      file: path.relative(config.rootDir, llmFiles[0]),
      line: 1,
      description: 'LLM calls found without fallback/degraded response handling',
      detail:
        'Add a catch block that returns a degraded-state response (e.g., { status: "degraded" }) ' +
        'instead of propagating the LLM error to the user.',
    });
  }

  // ── CHECK 3: WhatsApp disconnect handler ─────────────────────────────────────
  // Find files that manage WhatsApp sessions and check for disconnect handling
  const waFiles = [...workerFiles, ...backendFiles].filter((f) => {
    const content = readSafe(f);
    return /whatsapp|wppconnect|baileys|puppeteer.*browser/i.test(content);
  });

  const hasDisconnectHandler = waFiles.some((f) => {
    const content = readSafe(f);
    return (
      /disconnect|DISCONNECTED|onDisconnect|reconnect/i.test(content) &&
      // Must actually handle it (not just detect the type)
      /(?:disconnect|DISCONNECTED)[\s\S]{0,500}(?:reconnect|retry|queue|emit|logger|throw)/i.test(
        content,
      )
    );
  });

  if (waFiles.length > 0 && !hasDisconnectHandler) {
    breaks.push({
      type: 'CHAOS_WHATSAPP_MSG_LOST',
      severity: 'high',
      file: path.relative(config.rootDir, waFiles[0]),
      line: 1,
      description: 'WhatsApp session code found but no disconnect/reconnect handler detected',
      detail:
        'Handle DISCONNECTED state: queue unsent messages, trigger reconnection, ' +
        'and push a WebSocket event to frontend so users see "Conexão perdida" state.',
    });
  }

  return breaks;
}
