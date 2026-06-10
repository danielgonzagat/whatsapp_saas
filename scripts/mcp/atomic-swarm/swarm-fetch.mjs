/**
 * swarm_fetch — governed read-only web fetch with a verifiable receipt.
 *
 * Parity target: the native TUI WebFetch — except every fetch here leaves a
 * durable receipt (.atomic/swarm-fetch-ledger.jsonl) carrying the URL chain,
 * status, content-type, byte count and sha256 of the exact body bytes, so any
 * citation can be replayed and verified later. Policy is fail-closed:
 * - http(s) only, GET/HEAD only (read-only web);
 * - no credentials: URL userinfo and Authorization/Cookie/Proxy-Authorization
 *   headers are refused outright, never silently dropped;
 * - response body capped (default 2 MiB, hard max 8 MiB) with an explicit
 *   truncation flag in the receipt;
 * - hard timeout; the abort reason travels in the thrown error.
 * Binary bodies are returned as base64 (with sha256) instead of being
 * corrupted through a utf-8 decode — beyond the TUI WebFetch, which is
 * text-only.
 */
import { appendLedger, redactSecrets, refusal, sha256Hex } from './swarm-core.mjs';

const ALLOWED_PROTOCOLS = new Set(['http:', 'https:']);
const ALLOWED_METHODS = new Set(['GET', 'HEAD']);
const FORBIDDEN_HEADERS = new Set(['authorization', 'cookie', 'proxy-authorization', 'set-cookie']);
export const DEFAULT_MAX_BYTES = 2 * 1024 * 1024;
export const MAX_MAX_BYTES = 8 * 1024 * 1024;

export async function swarmFetch(args) {
  const {
    url,
    method: rawMethod = 'GET',
    headers = {},
    maxBytes: rawMaxBytes = DEFAULT_MAX_BYTES,
    timeoutMs: rawTimeout = 30000,
  } = args ?? {};
  const started = Date.now();
  let parsed;
  try {
    parsed = new URL(String(url));
  } catch {
    throw refusal(`swarm_fetch refused: invalid URL: ${String(url)}`);
  }
  if (!ALLOWED_PROTOCOLS.has(parsed.protocol)) {
    throw refusal(`swarm_fetch refused: protocol ${parsed.protocol} not allowed (http/https only)`);
  }
  if (parsed.username || parsed.password) {
    throw refusal('swarm_fetch refused: credentials embedded in the URL are never sent');
  }
  const method = String(rawMethod).toUpperCase();
  if (!ALLOWED_METHODS.has(method)) {
    throw refusal(`swarm_fetch refused: method ${method} not allowed (read-only GET/HEAD)`);
  }
  const cleanHeaders = {};
  for (const [name, value] of Object.entries(headers ?? {})) {
    if (FORBIDDEN_HEADERS.has(String(name).toLowerCase())) {
      throw refusal(`swarm_fetch refused: credentialed header ${name} is never sent`);
    }
    cleanHeaders[name] = String(value);
  }
  const maxBytes = Math.max(1, Math.min(MAX_MAX_BYTES, Number(rawMaxBytes) || DEFAULT_MAX_BYTES));
  const timeoutMs = Math.max(1000, Math.min(120000, Number(rawTimeout) || 30000));
  const controller = new AbortController();
  const timer = setTimeout(
    () => controller.abort(new Error(`swarm_fetch timed out after ${timeoutMs}ms`)),
    timeoutMs,
  );
  try {
    const response = await fetch(parsed, {
      method,
      headers: cleanHeaders,
      redirect: 'follow',
      signal: controller.signal,
    });
    const chunks = [];
    let bytes = 0;
    let truncated = false;
    const reader = method === 'HEAD' ? null : response.body?.getReader();
    if (reader) {
      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        if (bytes + value.byteLength > maxBytes) {
          chunks.push(value.subarray(0, maxBytes - bytes));
          bytes = maxBytes;
          truncated = true;
          await reader.cancel().catch(() => {});
          break;
        }
        chunks.push(value);
        bytes += value.byteLength;
      }
    }
    const body = Buffer.concat(chunks.map((chunk) => Buffer.from(chunk)));
    const receipt = {
      tool: 'swarm_fetch',
      url: parsed.href,
      finalUrl: response.url || parsed.href,
      method,
      status: response.status,
      contentType: response.headers.get('content-type'),
      bytes: body.byteLength,
      bodySha256: sha256Hex(body),
      truncated,
      durationMs: Date.now() - started,
    };
    appendLedger('swarm-fetch-ledger.jsonl', receipt);
    const bodyIsText = looksLikeText(body);
    return {
      ok: response.ok,
      receipt,
      bodyText: bodyIsText ? redactSecrets(body.toString('utf8')) : null,
      bodyBase64: bodyIsText ? null : body.toString('base64'),
    };
  } finally {
    clearTimeout(timer);
  }
}

function looksLikeText(buffer) {
  if (buffer.byteLength === 0) return true;
  const sample = buffer.subarray(0, Math.min(buffer.byteLength, 4096));
  let suspicious = 0;
  for (const byte of sample) {
    if (byte === 0) return false;
    if (byte < 9 || (byte > 13 && byte < 32)) suspicious += 1;
  }
  return suspicious / sample.length < 0.05;
}
