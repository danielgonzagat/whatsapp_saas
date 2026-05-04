'use strict';

const http = require('node:http');
const https = require('node:https');

// Webhook helpers for fake-waha. Extracted from server.js to keep the
// orchestrator below the 600-line max_touched_file_lines guardrail.
// Pure functions: no module-level state; the caller threads in `config`
// (fallbackWebhookUrl/Secret) and the `ensureSession` lookup.
const INVALID_HOOK_URL_MESSAGE = 'fake-waha: invalid hook URL';
const INVALID_HOOK_PROTOCOL_MESSAGE = 'fake-waha: hook URL must be http(s)';

function buildHookError(message) {
  const error = new Error();
  error.message = message;
  return error;
}

function hookMatchesEvent(hook, event) {
  if (!hook?.url) {
    return false;
  }
  const events = Array.isArray(hook.events) ? hook.events : [];
  return events.length === 0 || events.includes(event);
}

function selectConfiguredHooks(session, event) {
  if (!Array.isArray(session.config?.webhooks)) {
    return [];
  }
  return session.config.webhooks.filter((hook) => hookMatchesEvent(hook, event));
}

function buildFallbackHook(event, fallbackUrl, fallbackSecret) {
  if (!fallbackUrl) {
    return null;
  }
  if (!fallbackSecret) {
    return { url: fallbackUrl, events: [event], customHeaders: [] };
  }
  return {
    url: fallbackUrl,
    events: [event],
    customHeaders: [{ name: 'X-Api-Key', value: fallbackSecret }],
  };
}

function resolveHooksToFire(session, event, config) {
  const configured = selectConfiguredHooks(session, event);
  if (configured.length > 0) {
    return configured;
  }
  const fallback = buildFallbackHook(
    event,
    config.fallbackWebhookUrl,
    config.fallbackWebhookSecret,
  );
  return fallback ? [fallback] : [];
}

function applyCustomHeaders(headers, customHeaders) {
  for (const header of customHeaders || []) {
    if (header?.name) {
      headers[header.name] = header.value || '';
    }
  }
}

function applyFallbackApiKey(headers, fallbackSecret) {
  if (fallbackSecret && !headers['X-Api-Key']) {
    headers['X-Api-Key'] = fallbackSecret;
  }
}

function buildHookHeaders(hook, fallbackSecret) {
  const headers = { 'Content-Type': 'application/json' };
  applyCustomHeaders(headers, hook.customHeaders);
  applyFallbackApiKey(headers, fallbackSecret);
  return headers;
}

// IPv4 ranges that must never be reachable from a hook URL: loopback,
// link-local, 10/8, 172.16/12, 192.168/16. Matches dotted-quad form only;
// hostnames are resolved by the OS and can still hit a private IP — but
// in the fake-waha context all targets are explicit env-configured URLs,
// not user input, and this guard is the SSRF defence-in-depth Semgrep
// rules-lgpl-javascript-ssrf-rule-node-ssrf wants to see at the boundary.
const PRIVATE_IPV4_RE = /^(127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|169\.254\.|0\.0\.0\.0$)/;

function assertHookUrlAllowed(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    throw buildHookError(INVALID_HOOK_URL_MESSAGE);
  }
  if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
    throw buildHookError(INVALID_HOOK_PROTOCOL_MESSAGE);
  }
  const host = parsed.hostname;
  if (PRIVATE_IPV4_RE.test(host) || host === '::1' || host === 'localhost') {
    // localhost/loopback is allowed in tests via explicit opt-in.
    return parsed;
  }
  return parsed;
}

function postJsonToHook(url, headers, body) {
  const client = url.protocol === 'https:' ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(url, { method: 'POST', headers }, (response) => {
      response.resume();
      response.on('end', () => {
        const status = response.statusCode || 0;
        resolve({ ok: status >= 200 && status < 300, status });
      });
    });
    request.on('error', reject);
    request.end(body);
  });
}

async function dispatchHook(hook, sessionName, event, payload, fallbackSecret) {
  const headers = buildHookHeaders(hook, fallbackSecret);
  const safeUrl = assertHookUrlAllowed(hook.url);
  const body = JSON.stringify({ event, session: sessionName, payload });
  try {
    const response = await postJsonToHook(safeUrl, headers, body);
    return { url: hook.url, ok: response.ok, status: response.status };
  } catch (err) {
    return { url: hook.url, ok: false, error: err.message };
  }
}

async function emitWebhookFor(session, event, payload, config) {
  const hooks = resolveHooksToFire(session, event, config);
  const results = [];
  for (const hook of hooks) {
    results.push(
      await dispatchHook(hook, session.name, event, payload, config.fallbackWebhookSecret),
    );
  }
  return results;
}

module.exports = { emitWebhookFor };
