import { Response } from 'express';

const WEBHOOK_CHALLENGE_PATTERN = /^[A-Za-z0-9_.-]{1,200}$/;

/** Sanitize webhook challenge. */
export function sanitizeWebhookChallenge(value: unknown): string | null {
  const challenge =
    typeof value === 'string' || typeof value === 'number' ? String(value).trim() : '';
  if (!WEBHOOK_CHALLENGE_PATTERN.test(challenge)) {
    return null;
  }

  return challenge;
}

/** Send plain text response. */
export function sendPlainTextResponse(res: Response, body: string, statusCode = 200): Response {
  res.status(statusCode);
  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.end(body, 'utf8');
  return res;
}
