/**
 * Shared HTTP POST mechanism for ops-alert webhooks.
 *
 * Callers keep their OWN webhook-URL env resolution and their OWN payload
 * shape; this helper only owns the transport: a JSON POST with a 10s timeout.
 * `globalThis.fetch` is resolved at call time so test stubs and the Node 18+
 * global fetch both work. Errors are thrown so each caller can log them with
 * its own logger/context (this helper intentionally does no logging).
 *
 * The notifyOps notifier in queue-dlq-notifier.ts deliberately does NOT use
 * this helper: its POST has no timeout, so its mechanics differ materially.
 */
const OPS_WEBHOOK_TIMEOUT_MS = 10_000;

export async function postOpsWebhook(url: string, payload: unknown): Promise<void> {
  const fetchFn = globalThis.fetch;
  if (typeof fetchFn !== 'function') {
    return;
  }
  await fetchFn(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(OPS_WEBHOOK_TIMEOUT_MS),
  });
}
